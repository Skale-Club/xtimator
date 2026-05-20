# Project Research Summary — Xtimator v4.0 Multi-Tenancy

**Project:** Xtimator
**Milestone:** v4.0 — Multiple Companies per User (Owner-only)
**Researched:** 2026-05-20
**Overall confidence:** HIGH

**Source files:**
- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

---

## 1. TL;DR

- **Pattern change, not a stack change.** Zero new runtime npm packages. The existing `@supabase/ssr` + Next.js 16 Server Actions + RLS-everywhere stack is sufficient. Only dev-time additions are `pgTAP` + `supabase_test_helpers` (single-file SQL installs, no Node deps) to gain semantic RLS coverage.
- **The hard part is already done.** Every tenant table has `company_id NOT NULL` and a uniform `user_id = auth.uid()`-based RLS pattern. v4.0 is a *mechanical sweep*: add `company_members` join table, write a `SECURITY DEFINER` helper `is_company_member(uuid)`, rewrite ~30 RLS policies + ~20 server-action `getAuthContext()` duplicates to use it.
- **Active company = httpOnly cookie via Server Action.** All three industry alternatives (JWT custom claim, path slug `/c/{id}/...`, subdomain) are explicitly rejected. Cookie wins on zero-deps, instant-switch UX, SSR-safety, and zero conflict with the existing custom-domain feature.
- **Migration is expansive-only.** Add `company_members` + backfill 1 owner per existing company + `AFTER INSERT ON companies` trigger. Do **NOT** drop `companies.user_id` in v4.0 — Inngest workers still read it. Drop in v4.1. Eliminates dual-write outage window entirely.
- **Stripe + Inngest survive almost unchanged.** Webhooks already key off `companies.stripe_customer_id` / `stripe_account_id`. Inngest payloads already carry `companyId`. Only the *dispatcher* sites (API routes that create checkout sessions / send events) swap `auth.uid()`-derived company for `getActiveCompanyContext()`.
- **Build order is schema-first, not vertical slice.** Cross-cutting infrastructure (schema → RLS helper → active-company helper → app layout) is the architectural cost. Once paid, per-table sweeps are trivial. Matches v3.0 monetization rhythm (Phases 55-60).
- **47 pitfalls catalogued across 11 categories.** The top 10 (Section 5) are existential — RLS recursion, SECURITY DEFINER `search_path`, Stripe Customer-per-user-not-company, cookie tampering, hot-loop perf, JOIN-leakage. Each has concrete prevention assigned to a specific phase.

---

## 2. Stack

### Additions

| Item | Version | Scope | Why |
|------|---------|-------|-----|
| `pgTAP` | 1.3.3+ | DB extension, dev/CI only | RLS policies silently filter — without a test harness, "policy is enabled" is all the existing audit proves. pgTAP closes the semantic gap. `CREATE EXTENSION pgtap WITH SCHEMA extensions;` |
| `supabase_test_helpers` (basejump) | 0.0.4 | SQL package, dev/CI only | `tests.authenticate_as(user_id)`, `tests.create_supabase_user()` — turn 30-line JWT-mock boilerplate into 5-line tests. `SELECT dbdev.install('basejump-supabase_test_helpers')`. **Never on prod.** |

### Modifications (no library bumps)

- **Schema:** new `company_members(user_id, company_id, role)` with composite PK `(user_id, company_id)` + reverse index `idx_company_members_company_id` + `AFTER INSERT ON companies` trigger (PIT-MIG-04 insurance) + `UNIQUE INDEX companies_custom_domain_unique` (PIT-DOMAIN-02).
- **RLS helper:** `public.is_company_member(uuid)` — `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp`. Pattern cloned from `is_platform_admin()` precedent (migration `20260519000002`). `REVOKE ALL FROM public; GRANT EXECUTE TO authenticated, service_role`.
- **Active company:** `lib/auth/active-company.ts` → `getActiveCompanyContext()` (cookie + cached membership validation in one React `cache()` helper). `lib/actions/active-company.ts` → `setActiveCompany(companyId)` (validate membership → `cookieStore.set('xt-active-company', ...)` → `revalidatePath('/', 'layout')`).
- **UI:** `components/app-shell/company-selector.tsx` already has the right scaffold. `cmdk` and `@radix-ui/react-dropdown-menu` already installed.
- **Cookie:** `xt-active-company`, `httpOnly: true`, `sameSite: 'lax'`, `secure` in prod, `path: '/'`, `maxAge: 1 year`.

### What NOT to Add (explicit rejections)

| Rejected | Why |
|----------|-----|
| Makerkit / Basejump as **runtime** deps | Borrow patterns (membership table, DEFINER helper, pgTAP helpers); don't install. Would force rewriting 70+ validated phases. |
| `next-multi-tenant` / `multi-tenancy-nextjs` npm packages | Not widely-used; not App Router + Supabase-RLS compatible. Native `cookies()` + `revalidatePath()` is ~30 lines. |
| Supabase Custom Access Token Hook for `active_company_id` JWT claim | Stale until next refresh (~1h) — switching companies forces re-auth. Adds Edge Function infra. Doesn't eliminate `company_members` lookup. **Cookie wins on every axis.** |
| Drizzle / Prisma as RLS-aware ORM | Bigger change than multi-tenancy itself. |
| `next-safe-action` mid-flight | Doubles cognitive load with the action sweep. Track as polish. |
| `middleware.ts` for tenant gating | Xtimator has no `middleware.ts` (uses `proxy.ts`). Server-action cookie + RSC-level helper reach the same enforcement point. |
| Separate Supabase project per tenant | Costs scale per project; shared-schema-with-RLS is correct until enterprise. |
| Subdomain per workspace (`acme.xtimator.com/...`) | Conflicts with existing custom-domain (white-label estimate share). |
| Path-based URLs (`/c/{id}/...`) | ~30-route refactor for marginal benefit. |

**Confidence:** HIGH — verified against current `package.json`, `lib/supabase/server.ts`, Next.js 16 official docs, and the codebase's own `is_platform_admin()` precedent.

---

## 3. Features

### Table stakes (must ship)

1. Switcher lists all user's companies, marks active, switches via server action (scaffold already matches Slack/Linear/Notion/Vercel/Stripe/GitHub).
2. `xt-active-company` cookie as authoritative state, server-side membership-validated on every read.
3. **Server actions derive company from cookie, not `auth.uid()`** — ~20-action sweep is the **biggest single scope item**.
4. Stale-cookie auto-recovery (fall back to oldest membership + toast).
5. "Add company" entry launches onboarding in create-new mode (dedicated route, not modal — industry consensus).
6. `OnboardingSurvey` gains `mode: 'first-time' | 'add-additional'` prop without overwrite risk.
7. `createCompany` + `company_members` insert in single transaction (DB-level trigger as belt-and-braces).
8. Zero-workspaces empty state forces creation flow.
9. Backfill migration: idempotent + reconciliation-complete + zero re-onboarding.
10. Per-company trial clock starts at company creation (already correct; survive refactor).
11. Stripe Customer per company, never per user (PIT-STRIPE-01).

### Differentiators (defer)

Plan badge in switcher, Cmd/Ctrl+K shortcut, search box (at 10+), `last_active_at` sort, role badge (blocked on non-Owner roles), copy branding from current company, industry-preset templates, `?company=...` debug override.

### Anti-features (do NOT build)

Path-based URLs, subdomain-per-workspace, localStorage primary store, per-tab workspace state, cross-company billing dashboard, Pro-on-A-unlocks-B, single multi-company invoice, modal-based creation, auto-"Personal" workspace, drag-to-reorder, greyed deleted companies in switcher.

### Hidden cross-cutting concerns

1. **Logo upload path collision** — current `${user.id}/logo.${ext}` collides across companies of same user. Switch to `${company.id}/logo.${ext}` (12 storage policies rewritten uniformly across 4 buckets).
2. **`notifications` table RLS uses `auth.jwt() ->> 'company_id'`** (PIT-RLS-06) — Phase 77 speculative; JWT claim never landed. Rewrite to `is_company_member(company_id)`.
3. **`getCachedCompany(userId)` in `lib/queries/auth.ts`** — assumes 1 company per user, uses `unstable_cache` which can't read cookies. **Delete entirely.**
4. **11 duplicate `getAuthContext()`** across `lib/actions/{project,client,estimate,recording,photo,company,price-book,settings,whatsapp-settings,estimate-template,custom-domain}.ts` — consolidate to single shared helper.
5. **`createOrUpdateCompany` SELECT-then-INSERT/UPDATE keyed by `user_id`** is now a footgun. **Split** into `createCompany` + `updateCompany`.
6. **No UNIQUE on `companies.custom_domain`** (PIT-DOMAIN-02) — two companies could copy-paste same domain → `.single()` 500s. Add partial unique index.
7. **Trial-abuse vector** (PIT-STRIPE-05) — fresh 14-day trial per new company. Decide mitigation level (Section 7).

---

## 4. Architecture

### Schema (Phase 1) — file: `supabase/migrations/<ts>_phase81_v4_multitenancy.sql`

```sql
CREATE TABLE company_members (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);
CREATE INDEX idx_company_members_company_id ON company_members(company_id);
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- Atomic membership creation (PIT-MIG-04)
CREATE OR REPLACE FUNCTION public.fn_company_members_on_company_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.company_members (user_id, company_id, role)
  VALUES (NEW.user_id, NEW.id, 'owner')
  ON CONFLICT (user_id, company_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_company_members_on_company_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.fn_company_members_on_company_insert();

-- Idempotent backfill
INSERT INTO company_members (user_id, company_id, role)
SELECT user_id, id, 'owner' FROM companies
ON CONFLICT (user_id, company_id) DO NOTHING;

COMMENT ON COLUMN companies.user_id IS
  'DEPRECATED - use company_members for ownership. Drop in v4.1.';

CREATE UNIQUE INDEX companies_custom_domain_unique
  ON companies(custom_domain) WHERE custom_domain IS NOT NULL;
```

Regenerate `types/database.types.ts` via `supabase gen types`.

### RLS (Phase 2)

```sql
CREATE OR REPLACE FUNCTION public.is_company_member(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = target AND user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated, service_role;
```

Rewrite all ~30 tenant policies: `USING (public.is_company_member(company_id))`. `company_members` own RLS: `USING (user_id = (SELECT auth.uid()))` — NO reference to `companies` (PIT-RLS-05 anti-recursion). Preserve `estimates` anon share-token policy untouched (PIT-RLS-07). 12 storage policies rewrite uniformly using `public.is_company_member(((storage.foldername(name))[1])::uuid)`; path convention `{companyId}/...` stays. `platform-brand` bucket policies NOT rewritten (PIT-STOR-03).

Audit additions in `supabase/audits/rls-policy-bodies.sql`: zero rows with `user_id = (SELECT auth.uid())` outside allowlist; zero `auth.jwt() ->> 'company_id'`; every DEFINER in `public` has explicit `search_path`; storage tenant policies call `is_company_member`.

### Active-tenant pattern (Phase 3)

| Layer | File | Reads | Writes | Purpose |
|-------|------|-------|--------|---------|
| Proxy | `proxy.ts` | cookie | — | Pass-through only. **No DB lookup.** Optional `x-active-company-id` header rebroadcast for log correlation. |
| Resolver | `lib/auth/active-company.ts` `getActiveCompanyContext()` | cookie + DB | — | The **one** function every server action / RSC calls. React `cache()`-wrapped. Validates membership via rewritten `companies` RLS. Fallback to oldest membership when cookie absent/invalid. Returns `{ supabase, userId, activeCompanyId, company }` or `{ error }`. |
| Mutation | `lib/actions/active-company.ts` `setActiveCompany(companyId)` | — | cookie | Invoked by switcher. Validates membership → `cookieStore.set('xt-active-company', companyId, { httpOnly, sameSite: 'lax', secure, path: '/' })` → `revalidatePath('/', 'layout')`. |

Files affected: `proxy.ts` (optional), `lib/auth/active-company.ts` (NEW), `lib/actions/active-company.ts` (NEW), `lib/queries/auth.ts` (DELETE `getCachedCompany`, keep `getAuthClaims`), `app/(app)/layout.tsx` (line 33 + 47-52).

### Server actions sweep (Phase 5)

All 11 `lib/actions/*.ts` files delete duplicate `getAuthContext()` and import shared helper. Return shape `{ supabase, company }` preserved.

Special cases: `company.ts` split into `createCompany` + `updateCompany`. `estimate.ts` `createBlankEstimate` needs a **focused secondary query** for default tax/payment/warranty (don't bloat shared helper). `custom-domain.ts` drops stale `revalidateTag('company')` (line 46). `auth.ts` `signOut` clears `xt-active-company` cookie. `lib/queries/{company,billing}.ts`: every `getXxx(supabase, userId)` → `getXxx(supabase, companyId)`. `lib/queries/{project,share}.ts` unchanged.

### Inngest workers (Phase 4)

**Zero change to worker bodies.** Payloads already carry `companyId`; service role bypasses RLS. Only dispatchers (`app/api/{generate-estimate,transcribe,analyze-photos}/route.ts`) swap `getAuthContext()` for `getActiveCompanyContext()`. `lib/whatsapp/handler.ts` unchanged (derives `companyId` from phone lookup).

Add defensive Step 0 to every worker (PIT-INNG-01):
```ts
await step.run('verify-tenant', async () => {
  const { data } = await requireServiceClient()
    .from('companies').select('id').eq('id', companyId).maybeSingle()
  if (!data) throw new NonRetriableError('company deleted, skipping')
})
```

### Stripe (Phase 4)

Webhook `app/api/webhooks/stripe/route.ts` — **NO CHANGE** (already on `companies.stripe_customer_id`). `lib/billing/connect-webhook.ts` — **NO CHANGE**. `app/api/billing/{create-checkout-session,create-portal-session}/route.ts` — MODIFY to use `getActiveCompanyContext()`. `app/api/stripe/connect/{initiate,callback,disconnect}/route.ts` — verify OAuth state-param HMAC-carries `activeCompanyId`. Add `UNIQUE` partial index on `companies.stripe_subscription_id` (PIT-STRIPE-02).

### Custom domains

NO architectural change. Existing white-label estimate share (anon, share-token-keyed, host-header-driven) works unchanged. `proxy.ts` host logic untouched.

---

## 5. Pitfalls — Top 10 (highest severity / easiest to miss)

1. **(PIT-RLS-04)** SECURITY DEFINER helper missing `SET search_path` → `pg_temp` schema-shadowing attack. **Prevention:** explicit `SET search_path = public, pg_temp` on every DEFINER function; clone `is_platform_admin()` exactly.
2. **(PIT-RLS-05)** Recursive policy: `companies` references `company_members` AND vice versa → SQLSTATE 42P17 on every joining query. **Prevention:** `company_members` RLS uses direct `user_id = (SELECT auth.uid())` only; `companies` RLS uses DEFINER helper (which internally bypasses RLS).
3. **(PIT-RLS-06)** `notifications` still gates on `auth.jwt() ->> 'company_id'` from Phase 77 — JWT claim never wired → notifications either blocked or stale-tenant-leaked. **Prevention:** explicit Phase 2 rewrite to `is_company_member(company_id)`.
4. **(PIT-RLS-07)** Wholesale `estimates` policy rewrite drops anon `share_token` SELECT → all shared estimate links 404. **Prevention:** Phase 2 plan enumerates `estimates` policies (4 authenticated + 1 anon); anon body untouched. Playwright incognito test gate.
5. **(PIT-MIG-04)** Signup during deploy window between migration apply and code deploy → company INSERT succeeds but no membership row → user owns inaccessible company. **Prevention:** `AFTER INSERT ON companies` DB trigger. Cheap insurance.
6. **(PIT-COOKIE-01)** Cookie tampering: server actions trust value blindly → attacker sets `document.cookie` to any UUID → cross-tenant breach. **Prevention:** `httpOnly: true` cookie + `requireActiveCompanyMembership(userId, cookieValue)` against `company_members`. RLS is second line, never first.
7. **(PIT-COOKIE-03)** Two tabs, two active companies → user saves Tab 1's data into Tab 2's company (cookie is global per-domain). **Prevention:** forms embed hidden `_active_company_id` at render time; server action compares; mismatch → "Your active company changed — please reload".
8. **(PIT-STRIPE-01)** Stripe Customer dedup-by-email creates one Customer for both Company A and Company B same user → A's invoice in B's portal. **Prevention:** every `stripe.customers.create()` has `metadata.companyId` + check `companies.stripe_customer_id` first; never look up by email. Weekly reconciliation script.
9. **(PIT-CACHE-01)** `getCachedCompany(userId).single()` returns multi-row error OR arbitrary company under multi-membership. **Prevention:** delete entirely in Phase 3; TypeScript compiler enumerates every miss.
10. **(PIT-PERF-01)** Missing index on `company_members` → seq scan on every authenticated query → mobile users on 4G timeout. **Prevention:** `PRIMARY KEY (user_id, company_id)` (auto-creates compound btree) + `idx_company_members_company_id`. `EXPLAIN ANALYZE` must show `Index Only Scan, < 1ms`.

The other 37 pitfalls span categories RLS, MIG, STRIPE, INNG, COOKIE, STOR, CACHE, DOMAIN, TYPE, TEST, PERF — each referenced in the Phase-Specific Warnings matrix at the end of PITFALLS.md.

---

## 6. Suggested Build Order

**Mode: schema-first (NOT vertical slice).** Cross-cutting infrastructure is the architectural cost. Once paid, per-table sweeps are mechanical. Matches v3.0 monetization rhythm.

| # | Phase | Delivers | Pitfalls addressed |
|---|-------|----------|---------------------|
| **P1** | **Schema + Migration** | `company_members` table, composite PK, indexes, `AFTER INSERT` trigger, idempotent backfill, custom_domain UNIQUE, regenerated `database.types.ts`, refreshed `EXPECTED-POSTURE.md`, storage path audit. **Expansive only — `companies.user_id` stays.** | MIG-01..06, PERF-01, DOMAIN-02, TYPE-03, STOR-02, RLS-08 |
| **P2** | **RLS Helper + Policy Rewrite** | `is_company_member()` DEFINER helper (with `search_path`), all ~30 tenant policies rewritten, all 12 storage policies rewritten, `notifications` JWT-claim policy migrated, `estimates` share-token preserved, audit harness extended. | RLS-01..08, STOR-01, STOR-03, MIG-05 |
| **P3** | **Active-Company Context + Cookie** | `getActiveCompanyContext()`, `setActiveCompany()`, cookie spec, `getCachedCompany` deleted, `proxy.ts` rebroadcast (optional). | COOKIE-01..02, CACHE-01..02, PERF-02 |
| **P4** | **App Shell + Switcher Wiring** | `app/(app)/layout.tsx` uses helper, `company-selector.tsx` lists memberships + marks active + invokes `setActiveCompany`, "Add company" entry routes to onboarding mode=add-additional, stale-cookie toast. | COOKIE-02, COOKIE-04, COOKIE-06, CACHE-04 |
| **P5** | **Server Actions Sweep + Queries Refactor** | All 11 `lib/actions/*.ts` use shared helper, `company.ts` split, `lib/queries/{company,billing}.ts` migrate, logo path → `${company.id}/logo.${ext}`. | TYPE-01..02, COOKIE-03, COOKIE-05 |
| **P6** | **API Routes + Stripe + Inngest Dispatchers** | Billing checkout/portal use active company, Stripe Connect HMAC state, generate-estimate / transcribe / analyze-photos dispatchers updated, Step 0 `verify-tenant` added to workers, branded `CompanyId`/`UserId` types. | STRIPE-01..05, INNG-01..04 |
| **P7** | **Add Company Flow + Onboarding Mode** | `OnboardingSurvey` `mode` prop, `createCompany` atomically INSERTs + cookie + redirect, "Cancel" affordance, blank-slate defaults, zero-workspaces empty state. | COOKIE-06, MIG-04 validation, STRIPE-05 (trial-abuse flag) |
| **P8** | **Testing + Validation + Audit Re-run** | pgTAP suite, Playwright multi-company fixture, `tests/integration/tenant-isolation.test.ts`, `mockActiveCompany`, perf baseline diff ≤ +15%. | TEST-01..03, PERF-03, RLS-02 |

### Critical path

```
P1 -> P2 -> P3 -+-> P4
                +-> P5
                +-> P6 -> P7 -> P8
```

P4/P5/P6 are independent after P3 (parallelisable across agents). Sequential is safer for review.

---

## 7. Open Questions for Discussion

1. **`notifications` JWT-claim policy — keep a JWT custom-claim path or drop it?** **Recommendation: drop it.** v4.0 explicitly rejects JWT-claim approach (staleness, infra surface, doesn't eliminate `company_members` lookup). The existing `notifications` policy is a speculative Phase 77 remnant; migrate to `is_company_member(company_id)` like every other tenant table.

2. **Branded TypeScript IDs (`CompanyId` / `UserId`)?** **Recommendation: YES, in Phase 6.** Two UUIDs swapping at runtime is a top-3 hidden bug cause (PIT-INNG-02, PIT-TYPE-02). Adding `type CompanyId = string & { readonly __brand: 'CompanyId' }` is one file in `lib/types/ids.ts`; compiler then enumerates every wrong-argument call site.

3. **Trial-abuse mitigation level (PIT-STRIPE-05)?** Single user could create 47 free-trial companies.
   - **Level 0 (recommended):** log it. Daily query flags users with >3 active trial companies into `admin_audit_log` for manual review.
   - **Level 1:** "Add Company" requires ≥1 paid company. Behind a feature flag, OFF by default.
   - **Level 2:** Hard cap of N trial companies per user globally.

4. **Cookie naming (`xt-active-company` vs `eb-active-company`)?** Existing cookies use `eb-` prefix (vestigial). **Recommendation: `xt-active-company`** for forward consistency; cookie-prefix normalisation is a separate cleanup.

5. **`createOrUpdateCompany` split vs `mode` param?** **Recommendation: split** into `createCompany` + `updateCompanySettings`. Eliminates the SELECT-then-INSERT/UPDATE footgun; makes the trial-clock semantic explicit.

6. **`getCachedCompany` outright deletion vs migrating to `(user_id, active_company_id)`-keyed `unstable_cache`?** **Recommendation: delete entirely.** `unstable_cache` cannot read `cookies()`. React `cache()` per-request inside `getActiveCompanyContext()` gives equivalent dedup.

7. **Future v4.x "default company" preference per user?** Out of v4.0 scope per PROJECT.md. SEED for v4.x — first-load UX is "oldest membership becomes active", which may surprise a 5-company user on fresh browser.

---

## 8. Watch Out For (highest-risk integration points)

1. **`app/(app)/layout.tsx`** (lines 33, 47-52) — AppShell loader. After P4 this is the single chokepoint for every authenticated render. A bug = sitewide 500. **Mitigation:** Playwright assertion topbar renders correct company name for users with 1, 2, 3 companies (separate fixtures).

2. **The 11 duplicate `getAuthContext()` helpers** (`lib/actions/{project,client,estimate,recording,photo,company,price-book,settings,whatsapp-settings,estimate-template,custom-domain}.ts`). `company.ts`'s SELECT-then-INSERT/UPDATE is the nastiest footgun — silently writes to wrong company under multi-membership. **Mitigation:** Phase 5 one PR per action file, mandatory `EXPLAIN` of changed queries, diff-only review.

3. **`supabase/migrations/20260520000002_notifications_system.sql:41-44`** — pre-existing `auth.jwt() ->> 'company_id'` policy that silently breaks notifications in v4.0. **Mitigation:** Phase 2 explicitly enumerates `notifications` as rewrite target; CI grep `qual LIKE '%auth.jwt()%company_id%'` must be zero post-P2.

4. **`app/api/webhooks/stripe/route.ts` (lines 99-178) + `lib/billing/connect-webhook.ts`** — webhooks have NO cookie context. Any refactor that pushes "derive company" into a shared helper importing `next/headers` breaks production webhooks invisibly. **Mitigation:** dedicated helpers `getActiveCompanyFromCookie()` (imports `next/headers`) vs `getCompanyFromWebhookContext(payload)` (no `next/headers`). CI grep `app/api/webhooks/**/*.ts` for `from 'next/headers'` must be zero.

5. **`lib/queries/auth.ts:22-36`** — `getCachedCompany` with `unstable_cache` keyed by `userId`. Every single call site changes. **Mitigation:** delete the export in P3; TypeScript enumerates consumers in `app/`, `lib/`, `components/`. After sweep, `rg "getCachedCompany" .` should be zero hits.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Verified against current `package.json`, Next.js 16 docs, Supabase testing guide, existing `cmdk`/radix dropdown installs. |
| Features | **HIGH** | Cross-verified across Slack/Linear/Notion/Vercel/Stripe/GitHub primary docs. Industry consensus on every locked decision. |
| Architecture | **HIGH** | Verified against Supabase RLS Performance docs + codebase's `is_platform_admin()` precedent + direct read of `proxy.ts`, `lib/supabase/server.ts`, `lib/queries/auth.ts`, 11 duplicate `getAuthContext` sites. |
| Pitfalls | **HIGH** | Each pitfall traces to a specific failure mode verified against official Supabase docs or a specific file/line in current code. Detection queries included. |
| Build order | **MEDIUM-HIGH** | Matches v3.0 rhythm; cross-cutting nature refutes vertical-slice counter-argument. Marginal risk phase boundaries shift during planning. |

**Overall:** HIGH

### Gaps to address

- Exact migration timestamp pending v3.2 hosting decision.
- `createOrUpdateCompany` split decision (Section 7, Q5).
- Trial-abuse mitigation level (Section 7, Q3).
- Cookie prefix (`xt-` vs `eb-`).
- Perf baseline: Phase 2 should write `.planning/research/PERF-BASELINE.md` with `EXPLAIN ANALYZE` of top 3 dashboard queries before/after; target ≤ +15% regression.

---

*Research synthesised: 2026-05-20*
*Ready for roadmap: yes*
*Ready for requirements definition: yes — with the 7 Open Questions resolved*
