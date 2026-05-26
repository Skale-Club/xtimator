# Phase 82: RLS Rewrite — tenant-scoped tables gate by company_members - Context

**Gathered:** 2026-05-26 (via `/gsd:autonomous --from 82` → `/gsd:discuss-phase 82 --auto` — recommended defaults locked)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 82 rewrites every tenant-scoped RLS policy in the database to gate by `company_members` membership instead of the legacy `companies.user_id` ownership join. After Phase 82, a user can READ/WRITE rows for **any** company they have a `company_members.role='owner'` row for — not just the one company where `companies.user_id = auth.uid()`. The Switcher UI from Phase 81 finally works end-to-end against real tenant data.

**In scope:**
1. Single idempotent migration that rewrites every `USING (...)` and `WITH CHECK (...)` clause on tenant-scoped tables. The legacy pattern `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))` is replaced with `company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))`.
2. Tables in scope (confirmed via grep against `supabase/migrations/`):
   - `clients`, `projects`, `recordings`, `photos`, `estimates`, `estimate_sections`, `estimate_items`, `estimate_activity`, `estimate_template_settings`
   - `company_price_book`, `price_book_folders`, `price_book_imports`
   - `custom_domains`, `integrations` (whatsapp_settings etc.), `notifications`, `tour_events`, `estimate_deliveries`, `digital_signatures`
3. Per-table policy rewrite is **mechanical**: for each policy, replace the legacy subquery with the new one. No semantic change for single-company users (the backfill from Phase 79 guarantees 1:1 alignment). For multi-company users, the rewrite ENABLES access to additional companies they were added to via `createOrUpdateCompany('add')`.
4. Storage policies on the `logos` / `photos` / `audio` / `branding-assets` buckets are out of scope for this phase — they gate by `(storage.foldername(name))[1] = company_id`, which doesn't need to know about ownership; the storage path itself is the company key. Document this explicitly so the planner doesn't drift into storage.
5. Unit test: a static-contract test reading the new migration SQL and asserting (a) every targeted policy uses the new pattern, (b) `companies.user_id` is NOT referenced in any tenant-scoped policy after the migration, (c) the legacy pattern grep returns 0 hits in the new migration.

**Out of scope (separate phases):**
- Server-action code changes (Phase 83 — server actions still derive `company_id` from `claims.sub` via the old helpers; they continue to work because the new RLS still grants access for the user's first/legacy company)
- Billing per-company semantics (Phase 84 — `companies.tier` + `tier_trial_ends_at` still per-row; cross-cutting refactor)
- Dropping `companies.user_id` (Phase 85 — must wait for 83 to land first because actions still write that column)
- Adding Admin/Member roles to `company_members` (v5+ scope)
- RLS on platform-admin tables (admin_audit_log, etc. — they correctly use `is_platform_admin(...)` and don't gate by company)

</domain>

<decisions>
## Implementation Decisions

### Migration Shape
- **RLS-01:** Single new migration file: `supabase/migrations/20260526000001_phase82_rls_company_members.sql`. Idempotent via `DROP POLICY IF EXISTS … DROP POLICY ON …` + `CREATE POLICY …`. Re-running the migration is safe.
- **RLS-02:** Every targeted policy is DROPPED and RE-CREATED in the same migration transaction. This is atomic — there is never a window where RLS is missing on a table.
- **RLS-03:** Policy names are preserved (e.g., `clients_select`, `clients_insert`, `clients_update`, `clients_delete`). Only the body changes.
- **RLS-04:** The new pattern is consistently: `company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid()))`. Use `(SELECT auth.uid())` (not bare `auth.uid()`) to match the existing project convention — the planning layer rewrites that subquery once per request and Postgres caches it. Reference: Phase 01-foundation-auth decision and current `clients_select` pattern at `supabase/migrations/20260409000001_initial_schema.sql:177-180`.

### Scope Boundary Enforcement
- **RLS-05:** The migration touches ONLY tenant-scoped tables (those that have a `company_id` column). Tables without `company_id` (e.g., `auth.users`, `platform_branding`, `platform_admins`, `translations`, `usage_events` if non-company-scoped) are NOT modified.
- **RLS-06:** Storage policies (anything in `storage.policies`) are NOT modified — bucket-level access already uses the storage path prefix and doesn't need ownership refactor. The planner verifies via grep that no `storage.objects` policy is in the migration.
- **RLS-07:** `companies` itself is NOT modified. The `companies_select` / `companies_insert` etc. policies still gate by `user_id = auth.uid()`. This is intentional and documented in Phase 79 D-04: `companies.user_id` stays until Phase 85 drops it.

### Functional Equivalence Argument
- **RLS-08:** For every user at the moment Phase 82 ships, Phase 79's backfill guarantees that `companies.user_id = X` implies `company_members(user_id=X, company_id=companies.id, role='owner')` exists. Therefore the new policy returns the same set as the old policy for ALL existing users. No data access regression possible. This is the safety case that justifies running Phase 82 before Phase 83.
- **RLS-09:** For users who later create a second company via Phase 81's "+ Add new company" flow, the new RLS will correctly grant access to their additional company's rows — which the old RLS would have denied. This is the functional upside.

### Multi-Table Atomicity
- **RLS-10:** All policy drops + recreates happen in ONE migration transaction. If any single CREATE POLICY fails, the whole migration rolls back and the legacy policies remain. This is the standard PostgreSQL semantic and we rely on it.
- **RLS-11:** The migration includes a DO $$ ... $$ block at the end that runs a verification query: assert that no tenant-scoped policy still references `companies.user_id` (`SELECT count(*) FROM pg_policies WHERE qual LIKE '%companies%user_id%' OR with_check LIKE '%companies%user_id%'` MUST equal 0). If non-zero, RAISE EXCEPTION to roll back. This is the in-migration assertion that catches missed policies.

### Tests
- **RLS-12:** Static-contract test at `tests/unit/phase82-rls-migration.test.ts` reads the new migration SQL file and asserts:
  - File exists at the expected path.
  - Contains the new pattern at least N times (N = number of policies rewritten; the test counts via regex).
  - Does NOT contain the legacy `companies WHERE user_id` pattern.
  - Contains the DO $$ verification block.
- **RLS-13:** No integration test in this phase — Supabase CLI is broken in this environment (see Phase 79 SUMMARY for the Management API workaround). The migration's own DO $$ assertion is the integration test.

### Application via Management API
- **RLS-14:** Migration applied to prod via the existing pattern from Phase 79/Phase 81: read `SUPABASE_ACCESS_TOKEN` from `.env.local`, POST to `https://api.supabase.com/v1/projects/prmqgcrnpuvpzruyzvuv/database/query` with the SQL body. Verify success via a follow-up SELECT counting policies on the affected tables.
- **RLS-15:** Post-application smoke verify via Management API: `SELECT count(*) FROM clients;` should return the same row count as before (since RLS now grants access at minimum to the same set). If row count drops to 0 → STOP, investigate immediately.

### Project Instructions Compliance
- **RLS-16:** Secrets never committed; the migration SQL contains no API keys, passwords, or hostnames beyond the standard supabase reference. The Management API call uses the env-loaded token only.

### Claude's Discretion
- Exact ordering of table-policy rewrites in the migration (any order works since they're independent; alphabetical for readability).
- Whether to add a comment block at the top of the migration explaining the rationale (recommended: yes, short).
- Whether to also add a unique index on `(user_id, company_id)` in `company_members` (already there per Phase 79 D-01 composite PK — no action needed).
- Whether to refactor the inline subquery into a SQL function `current_company_ids()` returning a setof uuid (could be done; planner can decide based on policy count — if 30+ policies, a function makes the migration shorter and future policy rewrites cheaper; if under 20, inline is fine and matches existing codebase style).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Direction
- `.planning/PROJECT.md` §"Current Milestone: v4.0 Multi-Tenancy" — RLS rewrite listed as a target feature; out-of-scope items listed
- `.planning/STATE.md` — Phase 82 added 2026-05-26
- `.planning/ROADMAP.md` §"Phase 82: v4.0 RLS Rewrite" — Goal placeholder

### Phase 79 Outputs (foundation)
- `.planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-CONTEXT.md` — D-04 (companies.user_id retained until Phase 85), D-03 (company_members RLS pattern)
- `supabase/migrations/20260525000001_phase79_company_members.sql` — the `company_members` table + its own RLS SELECT policy

### Existing RLS Policies (the ones being rewritten)
- `supabase/migrations/20260409000001_initial_schema.sql` lines 177–230 — original 13 policies across clients, projects, recordings, photos, estimates, estimate_sections, estimate_items, estimate_activity
- `supabase/migrations/20260506000001_phase19_price_book.sql` — company_price_book policies
- `supabase/migrations/20260518000003_price_book_folders.sql` — folders policies
- `supabase/migrations/20260519000002_digital_signature_and_estimate_terms.sql` — digital signature + estimate terms policies
- `supabase/migrations/20260519000003_estimate_deliveries.sql` — deliveries policies
- `supabase/migrations/20260520000002_notifications_system.sql` — notifications policies
- `supabase/migrations/20260520100001_price_book_imports.sql` — imports policies
- `supabase/migrations/20260521000001_tour_events.sql` — tour_events policies
- `supabase/migrations/20260522000002_quick_lhp_projects_archive_trash.sql` — archive/trash columns policies if any
- (Researcher must enumerate the FULL list during 82-RESEARCH.md and the planner uses that list verbatim in the migration body.)

### Management API Apply Pattern
- `.planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-01-SUMMARY.md` — documented the Management API + `SUPABASE_ACCESS_TOKEN` pattern that Phase 81 also used
- `supabase/migrations/20260525000001_phase79_company_members.sql` — last successfully-applied migration; same apply path

### Conventions
- `(SELECT auth.uid())` (parenthesized subquery) is the established pattern across the codebase — Phase 01 reference. Use this form, not bare `auth.uid()`.
- Policy names follow `{table}_{operation}` pattern (e.g., `clients_select`, `projects_insert`).

</canonical_refs>

<deferred>
## Deferred Ideas

- **`current_company_ids()` SQL function** — could replace the inline subquery in every policy. Useful if the policy count is large or future RLS rewrites are anticipated. Defer to Phase 84 or later when there's more signal on RLS churn.
- **Storage policy rewrite** — buckets gate by path prefix which is already company-keyed. No change needed in v4.0 but worth revisiting if cross-company sharing becomes a feature.
- **Replication policy review** — if/when Supabase replication is enabled, the new RLS pattern may interact with publication-side policies. Out of scope for v4.0.

</deferred>

<auto_mode_log>
## Auto-Mode Selection Log

`/gsd:discuss-phase 82 --auto` locked the following at recommended defaults:

- Migration shape: single new migration, idempotent, atomic transaction (vs split per-table or function-based extraction). Chosen for clarity + safety.
- Tests: static-contract grep on migration SQL (vs full integration via Supabase JS client). Chosen because the Supabase CLI is broken in this env; the migration's own DO $$ assertion catches missed policies during apply.
- Apply path: Management API + `SUPABASE_ACCESS_TOKEN` (vs CLI). Forced by env limitation.
- Storage policies: out of scope. Documented explicitly.
- Function extraction: skipped this phase; revisit later if RLS churn signals it.

</auto_mode_log>
