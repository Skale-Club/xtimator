# Multi-Tenancy Retrofit Pitfalls — Xtimator v4.0

**Domain:** Adding multi-tenancy (multiple companies per user) to a live single-tenant Supabase + Next.js + Stripe + Inngest SaaS
**Researched:** 2026-05-20
**Overall confidence:** HIGH (Supabase RLS performance/recursion claims verified against Supabase docs + production migration evidence; Stripe webhook claims verified against existing handler code; storage policy claims verified against initial_schema.sql)

> **Format reminder:** Each pitfall lists **Failure Mode** / **Why Easy to Miss** / **Prevention (which phase)** / **Detection**.
> Pitfalls are grouped by category. Numbering is stable so the roadmap can reference them as `PIT-RLS-01` etc.

---

## Category Index

- **RLS** — 8 pitfalls (PIT-RLS-01 .. 08)
- **Migration / Data Integrity** — 6 pitfalls (PIT-MIG-01 .. 06)
- **Stripe** — 5 pitfalls (PIT-STRIPE-01 .. 05)
- **Inngest / Background Jobs** — 4 pitfalls (PIT-INNG-01 .. 04)
- **Active-Tenant Cookie + Session** — 6 pitfalls (PIT-COOKIE-01 .. 06)
- **Storage** — 3 pitfalls (PIT-STOR-01 .. 03)
- **Caching** — 4 pitfalls (PIT-CACHE-01 .. 04)
- **Custom Domains** — 2 pitfalls (PIT-DOMAIN-01 .. 02)
- **Type Safety + Codebase Hygiene** — 3 pitfalls (PIT-TYPE-01 .. 03)
- **Testing** — 3 pitfalls (PIT-TEST-01 .. 03)
- **Performance** — 3 pitfalls (PIT-PERF-01 .. 03)

**Total:** 47 retrofit-specific pitfalls.

---

## RLS

### PIT-RLS-01 — Missed table during every-table audit

**Failure Mode:** A tenant-scoped table keeps its old `user_id = auth.uid()` policy after the rewrite (or is missed entirely). A user who owns Company A but is a member of Company B reads Company A rows by accident because the policy still gates on `user_id` rather than `EXISTS (SELECT 1 FROM company_members WHERE company_id = X AND user_id = auth.uid())`. With v4.0's "one user per company" rule it manifests only when the user owns >1 company — exactly the scenario the milestone introduces. Cross-tenant data leak.

**Why Easy to Miss:** EXPECTED-POSTURE.md lists 13 tenant tables, but actual migrations have added more over time. Survey of current migrations shows tenant-scoped tables include at minimum: `companies`, `clients`, `projects`, `recordings`, `photos`, `estimates`, `estimate_sections`, `estimate_items`, `estimate_activity`, `company_price_book`, `price_book_folders` (Phase 78), `price_book_imports` (Phase 80), `estimate_template_*` (columns on companies, fine), `custom_domains` (column on companies, fine), `notifications` (Phase 77 — already uses JWT `company_id`!), `estimate_deliveries` (Phase 79), `admin_audit_log` (Phase 78). RLS audit script (`supabase/audits/rls-audit.sql`) confirms presence of policies but does NOT inspect policy bodies — it cannot tell a `user_id`-based policy apart from a `company_members`-based one. The audit's coverage is structural, not semantic.

**Prevention (Phase: 1-Schema, 2-RLS-rewrite):**
- Phase 1 produces an inventory script: `node supabase/audits/list-tenant-tables.mjs` that prints every public table whose schema has a `company_id` column OR is referenced in a tenant-scoped policy. This becomes the v4.0 "table list" — anything not on it is either platform/deny-all or a bug.
- Phase 2 ships a SECURITY DEFINER helper `public.is_company_member(target_company_id uuid)` (parallel to the existing `public.is_platform_admin()` helper from migration `20260519000002_fix_platform_admin_rls_recursion.sql`). Every tenant policy body becomes `public.is_company_member(company_id)` — one helper, one body, eliminates copy-paste drift.
- Phase 2 follow-up adds a semantic audit query (`supabase/audits/rls-policy-bodies.sql`) that selects from `pg_policies` and asserts that no tenant-table policy still contains the substring `user_id = (SELECT auth.uid())` or `WHERE user_id = auth.uid()`.

**Detection:**
```sql
-- Find any tenant-table policy that still pattern-matches the old shape:
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename NOT IN ('platform_admins', 'platform_integrations', 'platform_branding',
                        'usage_events', 'company_whatsapp', 'whatsapp_sessions',
                        'whatsapp_processed_messages', 'processed_stripe_events',
                        'translations', 'blog_posts')
  AND (qual LIKE '%user_id = (SELECT auth.uid())%' OR qual LIKE '%user_id = auth.uid()%');
-- Expected: zero rows post-Phase 2.
```
Run against dev after Phase 2 and against prod after the prod migration.

---

### PIT-RLS-02 — `auth.uid()` not wrapped in `(select auth.uid())` in the new policies

**Failure Mode:** The new v4.0 policies become "EXISTS (SELECT 1 FROM company_members WHERE company_id = X AND user_id = auth.uid())". On large tables (estimates, estimate_items, recordings) this re-evaluates `auth.uid()` per row, plus re-executes the membership EXISTS subquery — turning what was a O(1) auth check into O(n) lookups. Dashboard load times double, mobile users on field-site 4G timeout, paying-customer regression.

**Why Easy to Miss:** The existing v3 policies *do* correctly wrap `auth.uid()` in `(SELECT auth.uid())` (verified in `20260409000001_initial_schema.sql:167`). It would be easy to forget that the same wrapping must apply to the `auth.uid()` *inside* the new EXISTS subquery — and to also wrap the membership EXISTS itself if it's stable per-statement. The Supabase docs explicitly warn this in [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv): "Wrapping the function causes an initPlan to be run by the Postgres optimizer, which allows it to cache the results per-statement, rather than calling the function on each row."

**Prevention (Phase: 2-RLS-rewrite):**
- The SECURITY DEFINER helper `public.is_company_member()` from PIT-RLS-01 already short-circuits this — function call results are cached per statement when the function is marked STABLE.
- For any inline policy bodies that *don't* go through the helper, mandate `(SELECT auth.uid())` wrapping. Add a lint to `rls-policy-bodies.sql`: any policy body containing `auth.uid()` without the `(SELECT ` prefix flags as warn.

**Detection:**
- Supabase Performance Advisor lint `0003_auth_rls_initplan` automatically catches this. Run after Phase 2 prod apply: `supabase db lint --schema public` or check dashboard Performance Advisor.
- Manual: load a large estimate (e.g. paginated estimates list, 500+ rows) on dev with `EXPLAIN ANALYZE` — if plan shows per-row function calls instead of an InitPlan node, the wrapping is missing.

---

### PIT-RLS-03 — JOIN-table leakage (estimate_items via estimate_sections)

**Failure Mode:** Many tenant tables have a `company_id` column AND a parent reference (e.g. `estimate_items.company_id` AND `estimate_items.section_id → estimate_sections.id`). If a developer relaxes `estimate_items` policy to gate purely by `section_id` (under the false assumption that `estimate_sections` already does the gating), they break the layered defense — but worse, if they relax the parent policy and leave the child gating-by-parent, a cross-tenant rebind of `section_id` (via direct SQL or a bug) leaks child rows. Either way, the well-established double-gate from `20260409000001` (every child stores its own `company_id`) must be preserved.

**Why Easy to Miss:** It looks like duplicate enforcement. A naive reviewer says "the child table doesn't need `company_id` — it has `section_id` which has `company_id`". This is the classic JOIN-leakage trap — RLS evaluates each table independently, so removing `company_id` from a child means RLS no longer has any direct check; security collapses to whatever the parent permitted, which may be wider than intended (e.g. public share_token reads on `estimates`).

**Prevention (Phase: 1-Schema):**
- Document in `.planning/research/ARCHITECTURE.md`: every tenant child table keeps its `company_id` column AND gates RLS on it directly. Do not "simplify" by removing.
- Phase 1 schema check: every table in the tenant-tables inventory MUST have its own `company_id NOT NULL` column. List any exceptions (none expected — verified all child tables already have it).

**Detection:**
```sql
-- Any tenant table missing its own company_id column?
SELECT t.table_name
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_name IN (/* tenant table list */)
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = t.table_name
      AND c.column_name = 'company_id'
  );
-- Expected: zero rows.
```

---

### PIT-RLS-04 — SECURITY DEFINER helper without `set search_path` (privilege escalation footgun)

**Failure Mode:** The new `is_company_member()` helper is declared SECURITY DEFINER (so it can SELECT `company_members` regardless of caller's RLS). If declared without `set search_path = public`, a malicious actor with the ability to create tables in `pg_temp` could shadow `company_members` with a fake table that always returns true — bypassing all tenant isolation.

**Why Easy to Miss:** Postgres convention. The existing `is_platform_admin()` helper in `20260519000002` does include `set search_path = public` — it's the right pattern, but easy to omit when copy-pasting under deadline pressure. The PG advisor catches this but only if the function-search-path lint is enabled.

**Prevention (Phase: 2-RLS-rewrite):**
- Phase 2 plan must explicitly include `set search_path = public, pg_temp` on the helper (matching the verified pattern in `is_platform_admin()`).
- Code review checklist line item: "every SECURITY DEFINER function has explicit search_path".

**Detection:**
```sql
-- Find any SECURITY DEFINER function in public without an explicit search_path:
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND (p.proconfig IS NULL OR NOT (p.proconfig::text LIKE '%search_path%'));
-- Expected: zero rows.
```
Also: run `select * from pg_get_functiondef(...)::text` on the helper and grep for "SET search_path".

---

### PIT-RLS-05 — Recursive policy lookup (membership policy that references companies that references memberships)

**Failure Mode:** If the new `company_members` table's RLS policy is "user can SELECT memberships where user_id = auth.uid()" — fine. But if anyone later writes a `companies` policy as "user can SELECT companies where id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid())" AND a `company_members` policy that joins back to `companies`, Postgres detects `infinite recursion in policy for relation` — same SQLSTATE 42P17 that bit Phase 78 (`20260519000002_fix_platform_admin_rls_recursion.sql`). Every authenticated query on either table starts failing with "The database schema is invalid or incompatible."

**Why Easy to Miss:** The recursion is latent — it only triggers when both policies are exercised together by the same query plan. Local smoke tests that hit one table at a time pass. Production fails when the dashboard joins them.

**Prevention (Phase: 2-RLS-rewrite):**
- `company_members` RLS policy: direct comparison only — `USING (user_id = (SELECT auth.uid()))`. Do NOT reference `companies` in the body.
- `companies` RLS policy: use the SECURITY DEFINER `is_company_member(id)` helper (which bypasses RLS internally via DEFINER) — does NOT inline an EXISTS into `company_members`.
- This is exactly the lesson from migration `20260519000002`. Cite it in the Phase 2 plan.

**Detection:**
- After Phase 2 dev apply, run a smoke test query that touches BOTH tables in one plan:
```sql
-- As authenticated user:
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub TO '<test-user-uuid>';
SELECT c.id, c.name, cm.role
FROM companies c
JOIN company_members cm ON cm.company_id = c.id
WHERE cm.user_id = '<test-user-uuid>';
-- Expected: rows; no SQLSTATE 42P17.
```

---

### PIT-RLS-06 — `notifications` table's existing `auth.jwt() ->> 'company_id'` cast breaks if JWT custom claim is never set

**Failure Mode:** Migration `20260520000002_notifications_system.sql` already gates `notifications` SELECT by `company_id = (auth.jwt() ->> 'company_id')::uuid`. This was written assuming a future state where Supabase Auth sets a `company_id` custom claim on the JWT. v4.0 has not committed to JWT custom claims — the locked design uses a session cookie for `active_company_id`, not a JWT claim. After v4.0 ships, this policy either (a) blocks notifications entirely if the claim is unset, or (b) returns wrong-tenant notifications if the claim is stale (set at login, not refreshed on company switch).

**Why Easy to Miss:** The notifications RLS was written *before* v4.0 locked its design. It's already in production and "works" only because the single-company assumption means there's no scenario where the claim diverges from the actual tenant.

**Prevention (Phase: 2-RLS-rewrite):**
- Phase 2 explicitly migrates `notifications` policy from `auth.jwt() ->> 'company_id'` to `public.is_company_member(company_id)`. The cookie remains the source of truth at the application layer; RLS uses membership at the DB layer.
- If the team later adds a JWT custom claim for `active_company_id`, that's a separate optimization — not in v4.0 scope.

**Detection:**
```sql
-- Any policy still using the jwt claim pattern?
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE qual LIKE '%auth.jwt()%company_id%';
-- Expected post-Phase 2: zero rows OR only platform-admin policies.
```

---

### PIT-RLS-07 — Public share_token bypass missed on estimates

**Failure Mode:** `estimates` has a special public-read policy that lets `anon` SELECT by `share_token`. In the v4.0 rewrite, if the team replaces all `estimates` policies blindly with membership-based ones, they lose the public share read. Clients clicking shared estimate links get 404. Direct customer-facing regression.

**Why Easy to Miss:** EXPECTED-POSTURE.md mentions this as "(+ optional public share_token select)" — easy to overlook in a wholesale rewrite. The phase plan needs to explicitly preserve it.

**Prevention (Phase: 2-RLS-rewrite):**
- Phase 2 plan enumerates `estimates` policies one-by-one: 4 authenticated (select/insert/update/delete via membership) + 1 anon (select by share_token). The anon policy body does NOT change — it never referenced `user_id` or `auth.uid()` to begin with.
- Same applies to `blog_posts` (public SELECT) and `translations` (public SELECT) — these are NOT tenant tables and Phase 2 leaves them untouched.

**Detection:**
- Playwright test: open an estimate share link in an incognito context (no auth). Expected: page renders with line items.
- SQL check: `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='estimates' AND roles @> '{anon}'::name[];` must return ≥ 1.

---

### PIT-RLS-08 — `estimate_deliveries`, `admin_audit_log`, `price_book_imports`, `price_book_folders`, `usage_events` posture drift

**Failure Mode:** Recent phases (77-80, May 2026) added tables that may have inconsistent RLS posture relative to the v3 baseline. If Phase 2 rewrite uses the v3 `EXPECTED-POSTURE.md` as ground truth, it misses these new tables. Two failure modes: (a) new tenant tables still gate on `user_id` (cross-tenant leak), (b) new platform/deny-all tables get accidentally given membership policies (privilege escalation).

**Why Easy to Miss:** `EXPECTED-POSTURE.md` was last updated 2026-05-15 (per its own header). The May 17-20 phases (70, 78, 79, 80) added new tables that may not be classified.

**Prevention (Phase: 1-Schema):**
- Phase 1 deliverable: refresh `EXPECTED-POSTURE.md` to include every table that exists in current dev DB. Classify each: tenant / deny-all / bespoke. Reconcile against `supabase/migrations/` to catch any migration that added a table without classification.
- Treat the refresh as a research task in Phase 1, not a Phase 2 surprise.

**Detection:**
- Run `node supabase/audits/run-audit.mjs` BEFORE Phase 2 starts. Any FAIL or WARN must be triaged. Compare table list to `EXPECTED-POSTURE.md`. Diff means doc drift to fix in Phase 1.

---

## Migration / Data Integrity

### PIT-MIG-01 — Half-migrated rows during dual-write window

**Failure Mode:** A naive deploy applies the migration (creates `company_members`, backfills, drops `companies.user_id` NOT NULL or deprecates it) followed by a code deploy. Between the two there is a window where the new code expects memberships to exist for every active session, OR the old code reads from `companies.user_id` which is about to disappear. Live requests during this window error out with "company not found" or "permission denied". Paying customers see a 30-90s outage.

**Why Easy to Miss:** Migrations are typically "apply, then deploy code", and the team assumes Supabase migration apply is instant. In practice the migration runs ALTER TABLEs that take exclusive locks on large tables; live queries during the lock fail.

**Prevention (Phase: 1-Schema, 3-Deploy):**
- Migration is **expansive** (additive) only in this milestone: CREATE `company_members`, INSERT one row per existing company, ADD any new columns. Do NOT drop `companies.user_id` — leave it for a future "contraction" milestone after all reads have been migrated. This eliminates the dual-write requirement entirely.
- Phase 1's migration deliberately uses `INSERT ... ON CONFLICT DO NOTHING` (idempotent) so re-running it on an already-migrated DB is a no-op.
- Phase 3 (deploy) gates: code deploy goes out AFTER migration apply confirms, but code is written to work with BOTH old (read `companies.user_id`) and new (read `company_members`) paths during a brief overlap. Once code deploy is stable, the dual-read can be removed in a follow-up.

**Detection:**
```sql
-- Every existing company has at least one membership row (owner):
SELECT count(*) FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm
  WHERE cm.company_id = c.id AND cm.user_id = c.user_id AND cm.role = 'owner'
);
-- Expected immediately post-migration: zero. Run as part of Phase 1 acceptance.
```

---

### PIT-MIG-02 — Missing UNIQUE constraint on `(company_id, user_id)` in `company_members`

**Failure Mode:** Backfill runs twice (operator runs `node migrate.mjs` twice; or migration is reapplied in a botched rollback). `company_members` ends up with duplicate rows for the same (user, company). Membership queries return multiple rows; `single()` calls throw; the SECURITY DEFINER helper's `EXISTS` still works but role checks and future invite flows break.

**Why Easy to Miss:** `ON CONFLICT DO NOTHING` requires the conflict target to exist. Without a UNIQUE constraint or unique index, `ON CONFLICT DO NOTHING` is a no-op error in PG ≥ 9.5. Easy to omit constraint and then silently lose idempotency.

**Prevention (Phase: 1-Schema):**
- `CREATE TABLE company_members (..., UNIQUE (company_id, user_id));` — non-negotiable.
- Optional secondary: `UNIQUE (company_id, user_id, role)` if multiple roles per user/company should ever be allowed. v4.0 owner-only locks this to single-row-per-pair, so the simpler unique key is fine.

**Detection:**
```sql
SELECT company_id, user_id, count(*) FROM company_members
GROUP BY company_id, user_id HAVING count(*) > 1;
-- Expected: zero rows.
```

---

### PIT-MIG-03 — Backfill doesn't cover orphan companies (companies without a valid auth.users row)

**Failure Mode:** If `companies.user_id` references an `auth.users(id)` that was hard-deleted (auth deletion CASCADE chain), the company row may persist with a stale `user_id`. Backfill `INSERT INTO company_members (user_id, company_id, role) SELECT user_id, id, 'owner' FROM companies` then fails on the FK constraint to `auth.users`. Migration aborts mid-transaction; partial state if not wrapped properly.

**Why Easy to Miss:** Production data tends to be cleaner than test data, but post-Phase 70 cascade rules + the original `ON DELETE CASCADE` from `auth.users(id)` should have already cleaned these — *should*. Don't assume.

**Prevention (Phase: 1-Schema):**
- Phase 1 plan includes a pre-flight check: `SELECT count(*) FROM companies WHERE user_id NOT IN (SELECT id FROM auth.users);` MUST return zero before the migration runs in prod. If non-zero, decide: (a) delete orphans, (b) reassign to a placeholder owner, (c) mark as suspended. Document the chosen remediation in the migration runbook.
- The migration itself wraps in `BEGIN/COMMIT` (Supabase migrations are transactional by default for single-file migrations).

**Detection:**
```sql
-- Run BEFORE the migration:
SELECT id, user_id, name FROM companies
WHERE user_id NOT IN (SELECT id FROM auth.users);
-- Expected: zero.
```

---

### PIT-MIG-04 — Backfill misses companies created during the migration window

**Failure Mode:** Migration runs at T=0. Between T=0 and the code deploy T=+30s, a brand-new user finishes onboarding and creates a company. The `companies` INSERT succeeds (old code still running), but no `company_members` row is created (because the trigger / new write path is not yet active). Net result: the user owns a company they can never read again — RLS denies because membership is missing.

**Why Easy to Miss:** Live signups during deploy are rare but not zero — Xtimator's marketing landing page can drive signup at any moment. Without a DB-level safety net, the bug is invisible until the affected user logs back in.

**Prevention (Phase: 1-Schema):**
- Add a DB-level trigger: `AFTER INSERT ON companies → INSERT INTO company_members (company_id, user_id, role) VALUES (NEW.id, NEW.user_id, 'owner') ON CONFLICT DO NOTHING`. This makes membership creation atomic with company creation regardless of which code path ran. Cheap insurance. Keep the trigger after the contraction milestone (next milestone) as long as `companies.user_id` exists.
- Acceptance test: run the backfill, then INSERT a row into `companies` directly, then SELECT from `company_members` to confirm the trigger fired.

**Detection:**
- After Phase 3 ships, periodic (daily for first week) query:
```sql
SELECT c.id, c.user_id, c.created_at FROM companies c
LEFT JOIN company_members cm ON cm.company_id = c.id
WHERE cm.id IS NULL;
-- Expected: zero rows.
```

---

### PIT-MIG-05 — RLS on `company_members` itself blocks the SECURITY DEFINER helper

**Failure Mode:** `company_members` has RLS enabled (correctly) with policy "user_id = auth.uid()". Inside the SECURITY DEFINER helper `is_company_member()`, the SELECT against `company_members` runs as the function owner (superuser-like), which bypasses RLS — fine. BUT if a developer later writes a non-DEFINER (INVOKER, default) function that does the same lookup, RLS will block cross-row reads needed for membership checks. Or worse: the helper is mistakenly marked SECURITY INVOKER, all tenant queries fail.

**Why Easy to Miss:** `security definer` vs `security invoker` is a one-word difference. Default is `invoker`. Existing pattern in `is_platform_admin()` is correct; copy-pasting that pattern is the safe path.

**Prevention (Phase: 2-RLS-rewrite):**
- The helper signature is exactly: `create or replace function public.is_company_member(target uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$ select exists (select 1 from company_members where company_id = target and user_id = auth.uid()) $$;`
- `revoke all on function public.is_company_member(uuid) from public;` then `grant execute on function public.is_company_member(uuid) to authenticated, service_role;` — same posture as the platform-admin helper.

**Detection:**
```sql
-- Helper is SECURITY DEFINER + STABLE + has search_path:
SELECT proname, prosecdef, provolatile, proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='is_company_member';
-- Expected: prosecdef=true, provolatile='s' (stable), proconfig contains search_path.
```

---

### PIT-MIG-06 — Migration file naming collision

**Failure Mode:** Two migration files share the same timestamp prefix (already happened: `20260518000001_admin_audit_log.sql` and `20260518000001_seed024_price_book_image.sql`; also `20260519000002_fix_platform_admin_rls_recursion.sql` and `20260519000002_digital_signature_and_estimate_terms.sql`). Supabase CLI applies them in lexicographic order of filename — not deterministic across machines if filenames differ only by description. v4.0 migration deployed in a different order to prod than tested in dev.

**Why Easy to Miss:** Most CI/CD pipelines don't catch this — both files apply, just sometimes in different orders. The fail is rare but catastrophic when it hits.

**Prevention (Phase: 1-Schema):**
- Phase 1 migration MUST use a unique timestamp prefix (the date plus a unique suffix not already present). Recommend `20260521000001_phase81_v4_multitenancy.sql` (or whatever the actual deploy date is) — single migration, single file, single transaction.
- Pre-flight: `node supabase/audits/compare-migrations.mjs` to compare dev applied migrations vs prod applied migrations vs filesystem before applying. Already exists per the audit infrastructure inventory.

**Detection:**
```bash
node supabase/audits/compare-migrations.mjs --prod
# Expected: zero diffs in applied-migration list.
```

---

## Stripe

### PIT-STRIPE-01 — Stripe customer dedup: one customer per company, never per user

**Failure Mode:** Existing code (verified at `app/api/webhooks/stripe/route.ts:107-114`) already correctly stores `stripe_customer_id` on `companies` row, keyed by `session.metadata.companyId`. **However**, if checkout-creation code (in `lib/billing/`) ever creates a Stripe Customer with `email: user.email` and reuses it across multiple companies the same user owns, Stripe dedup behavior consolidates billing into one Customer for both companies. Result: Company A's invoice shows up in Company B's billing portal. Cross-company billing leak.

**Why Easy to Miss:** Stripe's recommended practice for SaaS is "one Customer per billing entity". With single-tenant, "billing entity = user", so creating one Customer per user was correct. v4.0 makes "billing entity = company". A developer extending v3 logic might keep the per-user Customer create logic.

**Prevention (Phase: 4-Stripe):**
- Phase 4 audits `lib/billing/*.ts` for any `stripe.customers.create({ email: ... })` call. Each must include a `metadata.companyId` and check `companies.stripe_customer_id` before creating. If the company has no customer, create a fresh one — never look up by email.
- Locked rule: 1 Stripe Customer ↔ 1 `companies.id`. Mirror this rule in the Stripe Customer metadata (`metadata.companyId` always set on create).

**Detection:**
- Audit script: `node scripts/audit-stripe-customers.mjs` (write in Phase 4) — for every `companies.stripe_customer_id`, retrieve the Customer via Stripe API and assert `customer.metadata.companyId === companies.id`. Run weekly after Phase 4 ships.
- Manual: a single test user creates 2 companies, both go through checkout. Stripe Dashboard should show 2 distinct `cus_xxx` IDs, each linked via metadata to a different `companies.id`.

---

### PIT-STRIPE-02 — Webhook race: subscription event arrives before checkout metadata processed

**Failure Mode:** User completes checkout for Company B while a webhook for Company A's invoice arrives in parallel. The handler does `UPDATE companies SET ... WHERE stripe_subscription_id = subId` (verified at `route.ts:137-140`). If Company A and Company B share a Stripe Customer (PIT-STRIPE-01 violation) OR if `stripe_subscription_id` is briefly null on Company A while being assigned, the UPDATE misroutes.

**Why Easy to Miss:** The race is microseconds-wide and only fires in production load. Local testing won't hit it.

**Prevention (Phase: 4-Stripe):**
- Stripe Customer & Subscription IDs are always keyed via `session.metadata.companyId` on insert. Webhook handlers prefer `event.data.object.metadata.companyId` over reverse-lookup by `stripe_subscription_id` whenever the metadata is present.
- Existing handler already does this for `checkout.session.completed`. Extend to `invoice.paid` and `customer.subscription.deleted` by adding `companyId` to subscription metadata on creation (Stripe API supports `subscription_data.metadata` on checkout session create).
- Add a `UNIQUE` constraint on `companies.stripe_subscription_id` (partial, where not null). Prevents two companies from claiming the same subscription if a bug crosses wires.

**Detection:**
```sql
-- Two companies sharing a subscription = bug:
SELECT stripe_subscription_id, count(*)
FROM companies
WHERE stripe_subscription_id IS NOT NULL
GROUP BY stripe_subscription_id HAVING count(*) > 1;
-- Expected: zero.
```

---

### PIT-STRIPE-03 — Stripe Connect token per-company, not per-user

**Failure Mode:** Phase 70 added `stripe_account_id` (Stripe Connect OAuth token) to `companies`. Verified at `20260517000001_phase70_stripe_connect_columns.sql:17`. This is already per-company — good. However, the `app/api/stripe/connect/initiate/route.ts` OAuth callback may derive the company from `auth.uid()` instead of the active session cookie. If a user owns Company A and Company B, completes Connect OAuth while active on Company A, but the callback derives company from "user's only company" logic (legacy code), the token attaches to the wrong company. Charges flow to the wrong Stripe account.

**Why Easy to Miss:** Phase 70 was written under single-tenant assumptions ("the user's company"). The OAuth state parameter is the safe carrier of `companyId` across the redirect — verify it's used.

**Prevention (Phase: 4-Stripe):**
- Audit `app/api/stripe/connect/initiate/route.ts` and `app/api/stripe/connect/callback/route.ts`. The `state` parameter passed to Stripe MUST include the active `companyId` (signed/HMAC'd to prevent tampering). The callback MUST use `state.companyId` to write `stripe_account_id`, never `auth.uid()` → companies lookup.
- Same audit for `app/api/stripe/connect/disconnect/route.ts`: disconnect MUST scope to the active company, not all companies the user owns.

**Detection:**
- Manual: test user creates 2 companies, connects Stripe to Company A only. Verify Company A has `stripe_account_id` set, Company B has it NULL.
- Integration test that simulates the OAuth callback with a mismatched user/company pair — expect 403.

---

### PIT-STRIPE-04 — Subscription transfer when ownership changes (out of scope for v4.0 but flag now)

**Failure Mode:** v4.0 explicitly defers invites and ownership transfer to a future milestone. But the `companies.stripe_customer_id` + `stripe_subscription_id` are owned by a single Stripe Customer that's tied to a real human's payment method. If a future milestone adds "transfer company to another user", the Stripe Customer should logically also transfer — but Stripe Customers are tied to payment methods, not transferable. Future-milestone footgun.

**Why Easy to Miss:** It's out-of-scope for v4.0 itself, but if the v4.0 phase 4 plan doesn't write down the assumption, the next milestone will surface the issue mid-implementation.

**Prevention (Phase: 4-Stripe — document only):**
- Phase 4 writes a 1-paragraph note in `.planning/research/ARCHITECTURE.md` (or a dedicated `INTEGRATION-NOTES.md`) stating: "v4.0 assumes company ownership is fixed at creation. The future invite/transfer milestone must address Stripe Customer reassignment (likely: cancel old subscription, create new Customer + Subscription under new owner, prorate). This is NOT a v4.0 concern." This pre-empts the next milestone's confusion.

**Detection:** N/A — this is a documentation pitfall, not a runtime one.

---

### PIT-STRIPE-05 — Free/Trial state and `tier_trial_ends_at` reset on Add Company

**Failure Mode:** Existing logic (verified at `lib/actions/company.ts:92-98`) sets `tier_trial_ends_at = now() + 14 days` ONLY on INSERT. v4.0 introduces "Add Company" — a user already past their original trial creates a new company; the new company gets a fresh 14-day trial. Expected behavior? Yes per `PROJECT.md` ("trial clock starts on company creation, not user signup"). But the financial implication: a single user can churn through unlimited free trials by creating new companies. Abuse vector.

**Why Easy to Miss:** Looks like a feature; is a fraud vector. The team may not realize abuse potential until they see a user with 47 companies all in trial.

**Prevention (Phase: 4-Stripe + 5-UX):**
- Phase 4 documents the decision in `PROJECT.md` (per-company trial — accepted risk for v4.0). Add abuse-detection log: any user with >3 active trial-tier companies fires a flag in `admin_audit_log`.
- Optional Phase 5 mitigation: "Add Company" only allowed if the user has at least one company on a paid tier — gate behind a feature flag, off by default; can flip on later if abuse materializes.

**Detection:**
```sql
SELECT c.user_id, count(*) AS trial_companies
FROM companies c
WHERE c.tier = 'trial' AND c.tier_trial_ends_at > now()
GROUP BY c.user_id HAVING count(*) > 3;
-- Run weekly. Manually review hits.
```

---

## Inngest / Background Jobs

### PIT-INNG-01 — Stale `companyId` in queued job after company deletion

**Failure Mode:** A user deletes Company A (cascade deletes projects, estimates, recordings). A `generate-estimate` job was queued 30 seconds before deletion, payload `{companyId: 'A', projectId: 'P', requestId: 'R'}`. Inngest picks up the job after deletion; the job's `generateEstimateForProject('A', 'P', ...)` queries find no rows; service crashes with non-deterministic error (could be NPE, could be 404, could be a `recordUsage` insert that succeeds against a now-orphan company_id and FK-fails — depending on path). Job retries 2 more times (per `retries: 2` in `generate-estimate.ts:38`), each retry the same error. Eventually `onFailure` fires and emits a `notify` with `userId = null` (lookup returns null because the company is gone). Silent dead-letter.

**Why Easy to Miss:** Inngest jobs durably persist their payloads. After tenant deletion, the payload still references the deleted tenant. The existing job code (`generate-estimate.ts:21-33`) already has a defensive `loadOwnerUserId` that returns null on lookup failure — that's the only guard. Nothing prevents the wasted Anthropic spend on a retry.

**Prevention (Phase: 4-Workers):**
- Every Inngest function must add a Step 0 (before the AI call) that verifies the company still exists and the original requester is still a member:
  ```ts
  await step.run('verify-tenant', async () => {
    const svc = requireServiceClient()
    const { data } = await svc.from('companies').select('id').eq('id', companyId).maybeSingle()
    if (!data) throw new NonRetriableError('company deleted, skipping')
  })
  ```
- Use Inngest's `NonRetriableError` (already imported in some functions) to abort without consuming retries.
- For jobs that need a `userId` (notify), include `userId` in the original event payload — don't re-derive from `companies.user_id` (which won't exist post-deletion).

**Detection:**
- Inngest Dev Server dashboard shows failed jobs. After Phase 4, monitor for spikes of `NonRetriableError: company deleted` — these are expected (occasional) and benign.
- Unit test: queue a job referencing a non-existent companyId; assert the job exits NonRetriable on Step 0, no AI provider call made (verify by spying on the provider mock).

---

### PIT-INNG-02 — Hardcoded `user_id` in payload schema

**Failure Mode:** Event payload definitions (verified `lib/inngest/events.ts`) use `companyId` — good. But callers (server actions in `lib/actions/*.ts` and API routes in `app/api/*`) may construct events from a stale code path that uses `claims.sub` (user id) instead of the active company. If a developer writes `inngest.send({ name: ..., data: { companyId: claims.sub, ... } })` by mistake (autocomplete confusion: both are uuids), the job runs with `companyId = userId`, queries return empty, errors silently.

**Why Easy to Miss:** Both are UUIDs. TypeScript can't distinguish them without branded types. Tests with mocked supabase don't catch the type confusion.

**Prevention (Phase: 4-Workers):**
- Use TypeScript branded types: `type CompanyId = string & { readonly __brand: 'CompanyId' }` and `type UserId = string & { readonly __brand: 'UserId' }`. Constructor functions enforce the branding. Inngest event payload typed as `companyId: CompanyId`. Cast at the boundary (server action that derives from cookie) — caught at compile time everywhere else.
- Phase 4 plan: introduce branded types in `lib/types/ids.ts`. Migrate the 4 existing event payload types to use them. Compile errors flush out any wrong-id passing.

**Detection:**
- `npm run typecheck` after the brand migration. Zero `as CompanyId` casts outside the active-company resolver function in the cookie layer.
- Grep audit: `rg "data: \{ companyId: claims\." → expect zero hits.

---

### PIT-INNG-03 — Webhook handler (WhatsApp, Stripe) misroutes due to active-cookie absence

**Failure Mode:** Webhook handlers (Stripe at `app/api/webhooks/stripe/route.ts`, WhatsApp handler) run server-side with NO user session — they're external HTTP callbacks. The active-company cookie does not exist. If any logic in these handlers ever tries to derive company from cookie (e.g. a refactor moves "derive company id" into a shared helper that reads cookies), webhooks 500 in prod.

**Why Easy to Miss:** Cookies-vs-no-cookies is a context that's invisible in code unless you're paying attention. Easy regression if a refactor blurs the boundary.

**Prevention (Phase: 4-Workers + 4-Stripe):**
- Helper API: `getActiveCompanyFromCookie()` lives in a file that imports `next/headers` and clearly errors if cookies are unavailable.
- Helper API: `getCompanyFromWebhookContext(payload)` lives in a separate file, derives from payload metadata only.
- Webhooks use the latter. Server actions use the former. No shared helper between them.
- Phase 4 code review: grep webhook handlers for any import of `next/headers` — expect zero.

**Detection:**
- Grep `app/api/webhooks/**/*.ts` and `lib/inngest/**/*.ts` for `cookies()` calls or imports of `next/headers`. Expected: zero matches.

---

### PIT-INNG-04 — `recordUsage` writes to wrong company after a refactor

**Failure Mode:** Existing `recordUsage` (called from `generate-estimate.ts:80`) takes `companyId` explicitly — good. But if a refactor introduces a helper that "looks up the company from the project_id" without the membership context, it could quietly attribute usage to a different company than the one that authorized the job. Quota meters drift, billing analytics wrong, user disputes "I didn't run that estimate".

**Why Easy to Miss:** Project IDs have always been per-company. Looking up "project's company" worked under single-tenant. Under multi-tenant, the project's `company_id` is still authoritative — but the *authorized* company (per session) may differ if a job is rebound mid-flight (rare but possible).

**Prevention (Phase: 4-Workers):**
- Pass `companyId` explicitly through the event payload (already done). Inside the job, NEVER call `lookupProjectCompany(projectId)` — always use the payload's `companyId`. Verify-tenant step (PIT-INNG-01) catches mismatch.
- Add a defensive assertion at the top of each job: `if (project.company_id !== event.data.companyId) throw new NonRetriableError('company/project mismatch')`. This catches the case where a project was reparented (shouldn't happen in v4.0 since no project-transfer feature, but defense in depth).

**Detection:**
- Quarterly reconciliation: `SELECT count(*) FROM usage_events ue JOIN companies c ON c.id = ue.company_id WHERE ...` — confirm event volume matches expected ratio of (companies × usage). Outliers investigated.

---

## Active-Tenant Cookie + Session

### PIT-COOKIE-01 — Client-set `active_company_id` cookie grants access to non-member company

**Failure Mode:** The active-company cookie is httpOnly:false (or there's no enforcement on read path) so the client can set it via `document.cookie = 'active_company_id=...'` to any company UUID. If the server actions trust the cookie value blindly without verifying membership, the attacker reads/writes another tenant's data. Massive cross-tenant breach.

**Why Easy to Miss:** Cookies feel "server-controlled" because they were set by a server action — but cookie storage is in the user's browser, fully mutable. Defense-in-depth says: never trust a cookie value beyond identifier-shape validation.

**Prevention (Phase: 3-Cookie):**
- Cookie posture: httpOnly:true, sameSite:lax, secure:true (in prod), path:'/'.
- Server reads cookie → MUST call `requireActiveCompanyMembership(claims.sub, cookieCompanyId)`:
  ```ts
  async function requireActiveCompanyMembership(userId: string, companyId: string) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('company_members')
      .select('id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!data) throw new Error('not a member of active company')
    return companyId
  }
  ```
- RLS is the second line of defense: even if app-layer check is forgotten, every query against tenant tables passes through the membership-gated policy.
- Bonus: HMAC-sign the cookie value (`${companyId}.${hmac(companyId, secret)}`) — defense against cookie tampering. Optional; the membership check is sufficient.

**Detection:**
- Playwright security test: log in as user A (member of Company X only), manually `cy.setCookie('active_company_id', '<company-Y-uuid>')`, navigate to `/dashboard`. Expected: redirect to "no access" page or first valid company.
- Server-side audit: every `lib/actions/*.ts` action grep for `cookies().get('active_company_id')` — each call site must call `requireActiveCompanyMembership()` next.

---

### PIT-COOKIE-02 — Deleted active company leaves user in a 500 loop

**Failure Mode:** User has Companies A and B. Active cookie points at A. User (or admin) deletes Company A. Next request: cookie still says A, but the membership lookup returns nothing. If the dashboard route doesn't handle this, the page throws "company not found" and a re-render fires the same error.

**Why Easy to Miss:** Deletion paths are tested for "you can delete a company", not "you can delete the company you're currently active in". Two-step deletion (confirm dialog) hides the assumption.

**Prevention (Phase: 3-Cookie + 5-UX):**
- `requireActiveCompanyMembership` (PIT-COOKIE-01) catches missing membership. On miss, server action MUST:
  1. Pick a fallback company: `SELECT company_id FROM company_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`
  2. Rewrite the cookie to the fallback.
  3. Continue with the fallback.
- If no fallback exists (user has zero memberships post-deletion), redirect to `/onboarding` (or `/companies/new`).
- "Delete Company" server action must explicitly clear the active cookie if it matches the deleted ID, set to NULL or fallback.

**Detection:**
- E2E test: create user with 2 companies, set active to A, delete A, navigate to /dashboard, assert renders Company B's data and cookie was updated.
- E2E test: user with 1 company deletes it, asserted redirect to /onboarding (no infinite loop).

---

### PIT-COOKIE-03 — Two browser tabs, two different active companies, one race

**Failure Mode:** User opens Tab 1 with Company A, opens Tab 2, switches to Company B in Tab 2. Cookie now = B. Tab 1 still shows Company A's data in memory (server-rendered, client-cached), but any further action from Tab 1 (e.g. "Save estimate") fires a server action that reads the cookie → B. The estimate saves to Company B (because that's what the cookie says). User has just written Tab 1's data to Company B without knowing.

**Why Easy to Miss:** Cookies are global per-domain, per-browser. Tab isolation requires per-tab state, which cookies don't provide. The single-tenant codebase never needed to think about this.

**Prevention (Phase: 3-Cookie + 5-UX):**
- Every form/action embeds a hidden `_active_company_id` field with the value of the cookie at render time. The server action compares: if `cookie.active !== form.active_company_id`, return error "Your active company changed — please reload this page". User reloads, sees correct context. No silent cross-write.
- Use a `data-tab-company-id` attribute on the root layout; client-side, listen for `storage` events on a localStorage key written by the switcher action. Show a toast "Active company changed in another tab" with a Reload button.

**Detection:**
- Playwright test: open two Page contexts sharing the same auth, switch active in page 2, attempt save in page 1, assert the action returned a mismatch error and no write occurred.

---

### PIT-COOKIE-04 — Race between switcher action and in-flight request

**Failure Mode:** User clicks "Save" on an estimate at T=0. The form submits to a server action. At T=0.1s, the user clicks the company switcher to Company B (which also fires a server action that revalidates the path). At T=0.2s, the original Save action reads the cookie — by now it's B. Estimate saves to wrong company.

**Why Easy to Miss:** Server actions are async. There's no guarantee a form submit's cookie read happens before a switcher's cookie write. The race window is small but real.

**Prevention (Phase: 3-Cookie):**
- Same defense as PIT-COOKIE-03: forms embed the active company at render time, server actions validate cookie matches the form field. The race is then deterministic and visible (action returns a "stale" error and the UI prompts the user).
- Switcher action calls `revalidatePath('/', 'layout')` AFTER the cookie write — Next.js's React cache is invalidated, in-flight server components re-fetch with the new cookie.

**Detection:**
- E2E test: trigger Save and Switch in rapid succession via Playwright, assert one of: (a) save completes on Company A and switcher does its thing, or (b) save returns mismatch error. Never silent cross-write.

---

### PIT-COOKIE-05 — Cookie set on wrong path/domain (custom domain case)

**Failure Mode:** Xtimator has custom domain support (`companies.custom_domain`). If a user accesses the app via `acme.estimates.com` (Acme's custom subdomain pointing at Xtimator), the active cookie is set on that domain — NOT on `app.xtimator.com`. If the user clicks a link that hops between subdomains, the cookie is lost; user lands on the platform domain with no active cookie, defaults to first company (which may not be Acme).

**Why Easy to Miss:** Custom domains exist for unauthenticated estimate share pages (Phase 38) — they're not part of the authenticated app today. But Phase 38's `idx_companies_custom_domain` suggests future use of custom domains for authenticated surfaces. The cookie design must be domain-aware now to avoid a rewrite later.

**Prevention (Phase: 3-Cookie):**
- Cookie domain: `app.xtimator.com` (or whatever the canonical authenticated host is). Authenticated surfaces are ONLY accessible via the canonical host. Custom domains continue to serve unauthenticated share pages only.
- Document the invariant: "active_company_id cookie is set on the canonical app host. Custom domains are estimate-share-only and stateless."

**Detection:**
- Manual: set custom domain on Company A, log in as A's owner, verify navigation through the authenticated app uses the canonical host. Visit the custom domain in a separate browser, verify it serves only the share page (no app shell).

---

### PIT-COOKIE-06 — First-login / no-companies edge case

**Failure Mode:** Brand-new user signs up. No company exists yet. Active cookie is not set. The middleware (if any) tries to read cookie → null → 500 error or redirect loop to /dashboard which requires a company.

**Why Easy to Miss:** v3 onboarding sets `companies.user_id = auth.uid()` on first save and redirects to /dashboard. v4 onboarding creates a company AND a membership AND sets the cookie. If any of these three steps is missed (especially the cookie set), the user lands on a broken state.

**Prevention (Phase: 3-Cookie + 5-UX):**
- The "create company" path (both onboarding and "Add Company") MUST atomically: (1) INSERT companies, (2) INSERT company_members (trigger handles this, see PIT-MIG-04), (3) `cookies().set('active_company_id', newCompanyId)`, (4) redirect.
- Middleware / layout: if cookie is null AND user is authenticated AND `count(memberships) === 0`, redirect to `/onboarding`. If cookie is null AND `count(memberships) > 0`, set cookie to first membership and continue.

**Detection:**
- E2E test: fresh signup → complete onboarding → assert cookie is set, dashboard renders, no redirect loop.
- E2E test: existing user logs out, clears cookies, logs back in → assert cookie auto-sets to first membership.

---

## Storage

### PIT-STOR-01 — `storage.foldername(name)[1]` policy breaks if path format changes

**Failure Mode:** All four buckets (audio, photos, pdfs, logos) gate on `(storage.foldername(name))[1] IN (SELECT id::text FROM companies WHERE user_id = (SELECT auth.uid()))` — verified at `initial_schema.sql:283-366`. Two specific failure modes during v4.0:
1. **Policy not updated:** Phase 2 rewrites table policies but forgets storage policies. Storage now gates on `companies.user_id` while tables gate on `company_members`. A user with multi-company access can read tables for Company B but NOT files in Company B's storage paths (or vice versa, depending on which file changed first). UI shows broken images / missing PDFs.
2. **Path format changes:** Someone "modernizes" storage paths to `{userId}/{companyId}/{filename}` — then `[1]` extracts the user_id, not company_id. All storage RLS silently fails open or silently fails closed.

**Why Easy to Miss:** Storage policies live in a separate part of the codebase (`storage.objects` rather than the public schema). They use the same `auth.uid()` pattern but a different lookup. RLS audit script counts them but doesn't compare policy bodies.

**Prevention (Phase: 2-RLS-rewrite):**
- Phase 2 plan explicitly includes "rewrite the 4 storage bucket policy sets (12 policies total) to use `public.is_company_member((storage.foldername(name))[1]::uuid)` instead of the user-id subquery". Same SECURITY DEFINER helper, applied to storage.
- Keep path format unchanged: `{companyId}/{filename}`. Document this as an invariant.
- Add storage-bucket policy bodies to the `rls-policy-bodies.sql` audit.

**Detection:**
```sql
SELECT polname, qual FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND qual LIKE '%user_id%';
-- Expected post-Phase 2: zero rows (no storage policy references user_id directly).
```
- Integration test: upload a logo to Company A's bucket as user U (owner of A and B). Switch to Company B. Verify the A logo URL returns 403 (or the file isn't listed). Verify B can upload a fresh logo. Verify A logo still visible when active = A.

---

### PIT-STOR-02 — Existing files have storage paths that pre-date the membership model

**Failure Mode:** Every existing file's storage path is `{companies.id}/{filename}` where the company was implicitly the user's only company. Post-migration, the path format is the same (good — no rewrite needed). But if any existing file was uploaded under an old format (e.g. `{user_id}/{filename}` from a forgotten dev experiment), the new policy can't match it. File becomes orphaned / inaccessible.

**Why Easy to Miss:** Storage paths are opaque strings. Without auditing, dev experiments leave invisible drift.

**Prevention (Phase: 1-Schema):**
- Phase 1 pre-flight: audit storage objects across all 4 buckets:
```sql
SELECT bucket_id, count(*) AS total,
       sum(CASE WHEN (storage.foldername(name))[1] IN (SELECT id::text FROM companies) THEN 1 ELSE 0 END) AS matches_company,
       sum(CASE WHEN (storage.foldername(name))[1] NOT IN (SELECT id::text FROM companies) THEN 1 ELSE 0 END) AS orphan
FROM storage.objects
WHERE bucket_id IN ('audio','photos','pdfs','logos')
GROUP BY bucket_id;
```
- If orphan count > 0, decide: delete, reparent, ignore (with audit log).

**Detection:** Same query, run as acceptance after Phase 1.

---

### PIT-STOR-03 — `platform-brand` bucket policies unaffected — verify left alone

**Failure Mode:** The platform-brand bucket policies (`platform_brand_insert_admins` etc.) gate on `public.is_platform_admin()` — unrelated to tenancy. If Phase 2's wholesale storage policy rewrite accidentally touches these, platform admins lose upload access for branding assets. Admin UI breaks.

**Why Easy to Miss:** "Rewrite all storage policies" sounds comprehensive — but platform-brand is not a tenant bucket. It should be explicitly excluded.

**Prevention (Phase: 2-RLS-rewrite):**
- Phase 2 plan enumerates which storage policies are rewritten (the 12 tenant ones) and which are left untouched (the 3 platform-brand ones).

**Detection:**
```sql
SELECT polname FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND polname LIKE 'platform_brand%';
-- Expected: 3 policies, unchanged before/after Phase 2.
```

---

## Caching

### PIT-CACHE-01 — `getCachedCompany(userId)` returns wrong company in multi-tenant world

**Failure Mode:** Verified at `lib/queries/auth.ts:22-36`: `getCachedCompany = unstable_cache(async (userId) => { .from('companies').select(...).eq('user_id', userId).single() }, ['company-for-user'], { revalidate: 60, tags: ['company'] })`. This assumes one company per user. In v4.0, a user may own 5 companies; `.single()` errors with "multiple rows" OR returns an arbitrary one (depending on PostgREST behavior). Result: dashboards crash OR show wrong company.

**Why Easy to Miss:** It's a query helper. Looks innocent. The whole point of the rewrite is to change every caller; this helper is one of them.

**Prevention (Phase: 2-RLS-rewrite + 3-Cookie):**
- Phase 3 rewrites `getCachedCompany(userId)` → `getCachedCompany(companyId)`. Cache key now includes companyId. Callers pass active company from cookie.
- Audit every consumer: `rg "getCachedCompany\(" lib app components` — replace each with the new signature.

**Detection:**
- TypeScript: change the signature, let the compiler error on every miscalled site. Zero `as any` workarounds.
- Runtime test: log in as a user with 2 companies, switch active, assert dashboard renders the correct company name in the topbar each time.

---

### PIT-CACHE-02 — React `cache()` shares across requests in dev under fast-refresh

**Failure Mode:** `getAuthClaims = cache(async () => ...)` (line 16-20 of `auth.ts`) uses React's `cache()` which dedupes within a single request. In dev under fast-refresh, in rare cases, server components share a `cache()` map across requests — leaking auth state. Probability is low; impact is high (one user briefly sees another's company list). Mostly a dev-only annoyance, but worth noting.

**Why Easy to Miss:** Documented Next.js behavior is "per-request scoping". Reality in dev mode is "mostly per-request" — production is fine.

**Prevention (Phase: 3-Cookie):**
- Don't change `cache()` usage — it's correct for production.
- Document this dev quirk in `docs/` so engineers don't panic-debug it.
- Production build (npm run build) eliminates the risk.

**Detection:** None at runtime. Code review checklist: any new `cache()` call must accept the per-request identity (e.g. cookie value) as input so the cache key includes it.

---

### PIT-CACHE-03 — HTTP cache headers leak tenant data across users

**Failure Mode:** A response containing tenant data is sent with `Cache-Control: public, max-age=...`. Vercel/Cloudflare/Hetzner Caddy caches it. The next user (different tenant, different auth) requests the same URL → gets cached response → sees the other tenant's data.

**Why Easy to Miss:** Next.js mostly defaults to no-cache for authenticated routes. But individual API routes (e.g. `/api/companies/list`, `/api/translate`) may set explicit cache headers without considering tenancy.

**Prevention (Phase: 3-Cookie):**
- Audit every `Cache-Control` header set in `app/api/**`. Anything serving tenant-scoped data MUST be `Cache-Control: private, no-store` or include `Vary: Cookie`.
- `app/api/translate/route.ts` (existing) — likely fine because translations are universal; verify.
- Add a CI grep: `rg "Cache-Control.*public" app/api/` — manual review of every hit.

**Detection:**
- Manual: log in as Tenant A, hit a tenant API, check response headers. Log out, log in as Tenant B, hit the same URL. Assert the response body differs (i.e. wasn't served from cache).

---

### PIT-CACHE-04 — `unstable_cache` revalidate tag must include tenant scope

**Failure Mode:** Phase 4 introduces `unstable_cache(... , ['company-stats'], { tags: ['stats'] })`. Tenant A mutates → `revalidateTag('stats')` — this invalidates the cached entry for ALL tenants. Defensive but expensive: every tenant's stats cache flushes whenever any tenant mutates. Performance degradation.

**Why Easy to Miss:** Looks like a correctness measure (over-invalidate is safer than under). But at scale it makes the cache useless.

**Prevention (Phase: 5-UX):**
- Cache tags must include the company ID: `tags: [`stats-${companyId}`]`. Revalidate fires only for the affected tenant.
- The `getCachedCompany` example already does this implicitly by including `userId` in the cache key (will become `companyId` after PIT-CACHE-01 fix).

**Detection:**
- Code review: any `revalidateTag('foo')` without a companyId suffix is suspect.
- Production: monitor cache hit rate. Sudden drop = over-invalidation.

---

## Custom Domains

### PIT-DOMAIN-01 — Subdomain hardcoded to a tenant; ownership transfer not handled

**Failure Mode:** `companies.custom_domain` is per-company. If Company A configures `estimates.acme.com` and later transfers ownership (out of scope for v4.0 — but flagged for future), the DNS still points at the platform but the company_id might change. Stale routing.

**Why Easy to Miss:** Custom domain feature was designed under single-tenant assumptions. Transfer wasn't a concept. v4.0 still doesn't introduce transfer, but a future milestone will.

**Prevention (Phase: 5-UX — document only):**
- Document in `INTEGRATION-NOTES.md`: future invite/transfer milestone must include "domain re-binding" considerations. Out of v4.0 scope.

**Detection:** N/A — documentation only.

---

### PIT-DOMAIN-02 — Same custom domain on two companies = 500

**Failure Mode:** v4.0 lets a user own multiple companies. If both have `custom_domain = 'mydomain.com'` (perhaps the user copy-pasted while setting up Company B), the domain-to-company lookup returns two rows → `.single()` errors → all requests to that domain fail.

**Why Easy to Miss:** Current schema has no UNIQUE constraint on `custom_domain` (verified — `idx_companies_custom_domain` is a partial index, not UNIQUE). v3 didn't need it because each user could only configure one company.

**Prevention (Phase: 1-Schema):**
- Add `ALTER TABLE companies ADD CONSTRAINT companies_custom_domain_unique UNIQUE (custom_domain);` — partial wouldn't help (UNIQUE NULLs are allowed by default in PG). Use:
```sql
CREATE UNIQUE INDEX companies_custom_domain_unique
  ON companies(custom_domain) WHERE custom_domain IS NOT NULL;
```

**Detection:**
```sql
SELECT custom_domain, count(*) FROM companies
WHERE custom_domain IS NOT NULL
GROUP BY custom_domain HAVING count(*) > 1;
-- Expected: zero. Run before adding the index.
```

---

## Type Safety + Codebase Hygiene

### PIT-TYPE-01 — TypeScript still allows `companies.user_id` references that should be membership-via-company_id

**Failure Mode:** `types/database.types.ts` is regenerated from the current schema (1508 lines). After Phase 1's expansive migration, the type file gains `company_members` table types AND keeps `companies.user_id` (because we deliberately did not drop it). TypeScript can't enforce "you should look at memberships, not companies.user_id" — developers still see `companies.user_id` as a valid foreign key and use it.

**Why Easy to Miss:** Types compile, code runs, RLS protects from cross-tenant leak — but the codebase rots with mixed-paradigm reads. Future contributor cargo-cults the wrong pattern.

**Prevention (Phase: 6-Sweep):**
- Phase 6 dedicated to sweeping the codebase: `rg "user_id" --type ts -g '!types/database.types.ts'`. Triage each hit:
  - Owner derivation in server actions → replace with `await getActiveCompanyId(cookies)`.
  - WhatsApp/Stripe/Inngest webhook handlers → already correct (use service role, scope from payload metadata).
  - Test mocks → update to new paradigm.
- ESLint rule (custom): forbid `from('companies')...eq('user_id', ...)` patterns. Allow-list specific files.

**Detection:**
- CI grep: `rg "\.eq\('user_id'" lib app components | wc -l` — expected to drop dramatically post-Phase 6, target ~zero outside of audit/admin paths.

---

### PIT-TYPE-02 — Branded types for CompanyId / UserId / MembershipId

**Failure Mode:** Both `companyId` and `userId` are `string` (UUID). Functions taking `(userId: string, companyId: string)` can be called with arguments swapped — TypeScript happily accepts. Runtime: cross-tenant read or write.

**Why Easy to Miss:** UUIDs all look the same. Code reviews miss argument-order bugs.

**Prevention (Phase: 6-Sweep):**
- Introduce branded types in `lib/types/ids.ts`:
```ts
export type CompanyId = string & { readonly __brand: 'CompanyId' }
export type UserId = string & { readonly __brand: 'UserId' }
export const asCompanyId = (s: string): CompanyId => s as CompanyId
export const asUserId = (s: string): UserId => s as UserId
```
- Annotate function signatures progressively. Compile errors catch swaps.

**Detection:**
- TypeScript build succeeds with strict mode. Any `as CompanyId` cast outside the brand-creation site is a code-smell flag.

---

### PIT-TYPE-03 — Generated types out of sync after migration

**Failure Mode:** Phase 1 adds `company_members` table; `types/database.types.ts` is not regenerated; new code references `Database['public']['Tables']['company_members']` which doesn't exist; build fails OR developer manually adds the type and it diverges from the DB. Six months later, schema and types are silently mismatched on production.

**Why Easy to Miss:** Type regeneration is a separate command (`supabase gen types typescript`). Easy to forget post-migration.

**Prevention (Phase: 1-Schema):**
- Phase 1 acceptance includes: "regenerate `types/database.types.ts` and commit". Compare diff to ensure ONLY the expected changes (new table, new columns) appear.
- CI step: a build-time check that runs `supabase gen types ...` against the current migrations and diffs against the committed file. Fail CI if drift.

**Detection:**
- `npm run build` against the committed types file. If a query references a non-existent column, build fails immediately.

---

## Testing

### PIT-TEST-01 — Playwright tests assume one company per user

**Failure Mode:** Existing E2E tests (e.g. `tests/visual/tour-uat-runbook.md`, Playwright specs under `tests/playwright/`) seed test users that own exactly one company. After v4.0, the company picker / switcher is part of the UI. Tests fail because the topbar's expected layout changed. Worse: tests that "create a project" implicitly assume the active company is the user's only one — if a test runs against a user with 2 companies, the project goes to the wrong one.

**Why Easy to Miss:** Tests pass against the old fixtures; they don't exercise multi-company scenarios. Coverage gap.

**Prevention (Phase: 7-Test):**
- Phase 7 introduces a new test fixture: `seedUserWithTwoCompanies()`. Add a smoke spec that switches between them and asserts the dashboard updates.
- Update existing fixtures to be explicit about which company is active.
- Add a "company-switcher present" assertion to layout tests.

**Detection:**
- Test execution: `bun test:e2e` after Phase 7 — all green, new multi-company specs included.

---

### PIT-TEST-02 — Unit tests mock single-company context

**Failure Mode:** Mocks in `tests/setup/inngest-mocks.ts` and elsewhere stub `supabase.from('companies').select(...).eq('user_id', ...).single()` returning a hardcoded company. After Phase 2, the production code calls membership queries, not user_id queries. Mocks no longer cover the real code path. Tests pass but they're testing the mock, not the system.

**Why Easy to Miss:** Mock drift is invisible — tests still report 100% pass. Confidence high, coverage low.

**Prevention (Phase: 7-Test):**
- Phase 7 audits every mock helper. Replace `.eq('user_id', ...)` with `from('company_members').select(...)` mocks.
- Introduce a higher-level helper `mockActiveCompany(companyId)` that sets the cookie and the membership in one call. Used across all tests.

**Detection:**
- Grep: `rg "\.eq\('user_id'" tests/` → expected to drop dramatically. Hits in deprecated tests get rewritten or removed.

---

### PIT-TEST-03 — No tenant-isolation contract test

**Failure Mode:** Despite all the per-pitfall detection queries, there's no single test that asserts the core invariant: "User A cannot read User B's data via any path". A single integration test that:
1. Creates User A + Company A1, Company A2
2. Creates User B + Company B1
3. As User B with active=B1, attempts to read/write every tenant table looking for any row belonging to A1 or A2
4. Asserts every attempt returns empty / 403 / RLS denial

…is the safest net for the entire milestone.

**Why Easy to Miss:** Each per-table policy looks fine in isolation. The cross-cutting "does the WHOLE system isolate tenants" test is rarely written because nobody owns it.

**Prevention (Phase: 7-Test):**
- Phase 7 deliverable: `tests/integration/tenant-isolation.test.ts` (or `.spec.ts`) — exhaustive cross-tenant read/write attempt suite. Run as part of CI on every PR.
- Include storage operations: User B attempts to list files at `{A1-id}/...` path. Expected: 0 rows.

**Detection:**
- The test itself IS the detection.
- Run also in production via a sandbox tenant pair quarterly: `node scripts/tenant-isolation-prod-probe.mjs`.

---

## Performance

### PIT-PERF-01 — Missing index on `company_members(user_id)` — RLS lookup on EVERY query

**Failure Mode:** Every authenticated query against a tenant table fires `is_company_member()` → `SELECT 1 FROM company_members WHERE company_id = X AND user_id = auth.uid()`. Without an index on `(user_id, company_id)`, this is a seq scan over all memberships for every query. At 10K users × 1.2 memberships avg = 12K rows scanned PER query × hundreds of queries per page load = death.

**Why Easy to Miss:** Index design feels like a Phase 1 "later" task. By the time it's a perf problem, prod is already on fire.

**Prevention (Phase: 1-Schema — NON-NEGOTIABLE):**
```sql
CREATE INDEX company_members_user_id_idx ON company_members (user_id);
CREATE INDEX company_members_company_id_idx ON company_members (company_id);
-- Compound for the membership EXISTS lookup:
CREATE UNIQUE INDEX company_members_user_company_idx ON company_members (user_id, company_id);
-- (This last one doubles as the UNIQUE constraint from PIT-MIG-02.)
```

**Detection:**
```sql
EXPLAIN ANALYZE SELECT 1 FROM company_members WHERE user_id='<uuid>' AND company_id='<uuid>';
-- Expected: Index Only Scan, < 1ms.
```

---

### PIT-PERF-02 — Membership query inside a hot loop

**Failure Mode:** A server component renders a list of 50 projects. For each, it independently calls `getActiveCompanyId(cookies)` (which hits the DB to verify membership). 50 round-trips per page load.

**Why Easy to Miss:** `getActiveCompanyId` looks free; the cookie read is — but the membership verification is not.

**Prevention (Phase: 3-Cookie):**
- `getActiveCompanyId` returns from React `cache()` — single membership check per request. Verified result memoized for the request lifetime.
- Server components receive the active company as a prop from the layout, not via fetch.

**Detection:**
- Add a counter to the membership-check function in dev: log "membership check fired" per request. Hit dashboard, assert log count = 1.

---

### PIT-PERF-03 — JOIN on `company_members` in policies on hot tables

**Failure Mode:** Even with `is_company_member` SECURITY DEFINER + index, complex tenant queries (e.g. `SELECT * FROM estimates JOIN estimate_sections ON ... JOIN estimate_items ON ...`) re-evaluate the policy 3x (once per table). Each call is fast individually; in aggregate, paginated lists slow noticeably vs. v3's direct user_id comparison.

**Why Easy to Miss:** It's a constant-factor regression, not an algorithmic one. Easy to ignore until 95th percentile latency creeps up.

**Prevention (Phase: 2-RLS-rewrite):**
- Helper marked STABLE → Postgres caches result per-statement.
- Production probe: pick the top 3 slowest dashboard queries (from existing logs) and run `EXPLAIN ANALYZE` before/after Phase 2 in dev. Document the delta in `.planning/research/PERF-BASELINE.md`.

**Detection:**
- p95 dashboard load time before vs after migration. Target: ≤ +15% regression. If higher, revisit policy shape (e.g. denormalize membership into a JWT custom claim later).

---

## Cross-Cutting Summary — Phase Ownership Matrix

| Pitfall ID | Phase 1 Schema | Phase 2 RLS | Phase 3 Cookie | Phase 4 Stripe / Workers | Phase 5 UX | Phase 6 Sweep | Phase 7 Test |
|------------|----------------|-------------|----------------|--------------------------|------------|---------------|---------------|
| RLS-01..08 | inventory      | rewrite     |                |                          |            |               | tenant-iso    |
| MIG-01..06 | migration      |             |                |                          |            |               |               |
| STRIPE-01..05 |             |             |                | rewrite                  |            |               |               |
| INNG-01..04 |                |             |                | rewrite                  |            |               |               |
| COOKIE-01..06 |              |             | implement      |                          | UX edge    |               | e2e           |
| STOR-01..03 | audit          | rewrite     |                |                          |            |               |               |
| CACHE-01..04 |               |             | rewrite        |                          | tags       |               |               |
| DOMAIN-01..02 | constraint   |             |                |                          | doc        |               |               |
| TYPE-01..03 | regen          |             |                |                          |            | sweep         |               |
| TEST-01..03 |                |             |                |                          |            |               | fixtures      |
| PERF-01..03 | indexes        | helper      | cache          |                          |            |               | baseline      |

---

## Phase-Specific Warnings

| Phase | Top 3 Pitfalls to Address |
|-------|---------------------------|
| **Phase 1: Schema + Migration** | PIT-MIG-04 (atomic membership trigger), PIT-PERF-01 (indexes), PIT-MIG-02 (UNIQUE constraint) |
| **Phase 2: RLS Rewrite** | PIT-RLS-01 (every-table audit), PIT-RLS-04 (helper search_path), PIT-RLS-05 (recursion) |
| **Phase 3: Active Cookie** | PIT-COOKIE-01 (membership verify), PIT-COOKIE-03 (tab race), PIT-CACHE-01 (getCachedCompany) |
| **Phase 4: Stripe + Workers** | PIT-STRIPE-01 (per-company customer), PIT-INNG-01 (tenant-deleted job), PIT-STRIPE-03 (Connect token scope) |
| **Phase 5: UX + Switcher** | PIT-COOKIE-02 (deleted active), PIT-COOKIE-06 (first-login), PIT-CACHE-04 (tag scoping) |
| **Phase 6: Codebase Sweep** | PIT-TYPE-01 (user_id grep), PIT-TYPE-02 (branded types), PIT-RLS-06 (notifications JWT) |
| **Phase 7: Testing** | PIT-TEST-03 (tenant-isolation suite), PIT-TEST-01 (multi-company fixtures), PIT-TEST-02 (mock drift) |

---

## Sources

- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — HIGH (official Supabase docs): `(SELECT auth.uid())` wrapping, SECURITY DEFINER helper pattern, index requirements on policy-referenced columns.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH: policy body syntax, helper function patterns, recursion warnings.
- [Supabase Performance Advisors](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0003_auth_rls_initplan) — HIGH: `auth_rls_initplan` lint that catches PIT-RLS-02.
- [MakerKit: Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — MEDIUM (community, verified against official docs): join-leak warnings, helper function patterns matching the Xtimator `is_platform_admin()` precedent.
- [AntStack: Multi-Tenant Applications with RLS](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) — MEDIUM: migration sequencing for retrofits.
- **Internal sources (HIGH confidence — direct file evidence):**
  - `supabase/migrations/20260409000001_initial_schema.sql:166-185` — current policy shape (`user_id = (SELECT auth.uid())`)
  - `supabase/migrations/20260519000002_fix_platform_admin_rls_recursion.sql` — proven SECURITY DEFINER helper pattern, recursion failure mode
  - `supabase/audits/EXPECTED-POSTURE.md` — current table classification baseline
  - `lib/queries/auth.ts:22-36` — `getCachedCompany` single-company assumption
  - `app/api/webhooks/stripe/route.ts:99-178` — webhook handler structure
  - `lib/inngest/events.ts`, `lib/inngest/functions/generate-estimate.ts` — Inngest event payload shape and step structure
  - `supabase/migrations/20260520000002_notifications_system.sql:41-44` — pre-existing `auth.jwt() ->> 'company_id'` policy (PIT-RLS-06)
