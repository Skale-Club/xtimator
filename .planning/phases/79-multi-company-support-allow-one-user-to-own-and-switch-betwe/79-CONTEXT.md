# Phase 79: Multi-company foundation (schema + cookie + active company resolution) - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 79 delivers the **foundation slice** of v4.0 Multi-Tenancy. After Phase 79, the schema and server-side plumbing exist for a user to own multiple companies and the app reads the "active" company from a session cookie — but **no new UI ships in this phase**. The existing single-company UI continues to work because the migration backfills exactly one owner membership per existing `companies.user_id`, and the active-company resolver falls back to that membership.

**In scope:**
1. New `company_members(user_id, company_id, role)` table with idempotent migration that backfills one `role='owner'` row per existing `companies` row.
2. Cookie-based active company tracking: `active_company_id` session cookie (httpOnly), set by a new helper that runs early in the request lifecycle.
3. Server-side helpers: `getActiveCompanyId()` (reads cookie + falls back to most-recently-created membership) and `getActiveCompany()` (returns the full `AppCompany` for the active id).
4. Update `app/(app)/layout.tsx` to call `getActiveCompany()` instead of `getCachedCompany(userId)`, and re-key `unstable_cache` by `activeCompanyId` instead of `userId`.
5. `createOrUpdateCompany` gains an explicit `mode: 'first' | 'add'` parameter so future phases can call it in `add` mode (the action still upserts in `first` mode for the original onboarding flow — `add` mode is wired up but not yet reachable from UI in this phase).

**Out of scope (covered by follow-up phases in v4.0 — see Deferred Ideas):**
- Switcher dropdown UI listing all companies (Phase 80)
- "Add company" entry point hitting `/onboarding?mode=add` (Phase 80)
- Rewrite of ~20 server actions in `lib/actions/*.ts` to derive `company_id` from cookie instead of `user_id` (Phase 81)
- RLS rewrite on ~12 tenant-scoped tables to gate by membership of active company instead of `companies.user_id = auth.uid()` (Phase 82)
- Billing per-company (trial clock + Stripe customer + usage_events scoping) (Phase 83)
- Storage path migration from `${user.id}/logo.${ext}` to `${company.id}/logo.${ext}` (Phase 80 — bundled with logo-upload work in add-company onboarding mode)

</domain>

<decisions>
## Implementation Decisions

### Schema
- **D-01:** Create `company_members(user_id uuid, company_id uuid, role text, created_at timestamptz)` join table with composite primary key `(user_id, company_id)`. `role` is `'owner'` for v4.0 (column exists for future Admin/Member tiers but is constrained to `'owner'` for now).
- **D-02:** Migration is idempotent: `INSERT INTO company_members(user_id, company_id, role) SELECT user_id, id, 'owner' FROM companies ON CONFLICT (user_id, company_id) DO NOTHING`. Safe to re-run.
- **D-03:** RLS on `company_members`: user can read rows where `user_id = auth.uid()`. No insert/update/delete from client (writes happen via server actions with service role).
- **D-04:** `companies.user_id` column stays for now (do NOT drop in this phase). RLS that depends on it stays unchanged. Phase 82 rewrites RLS to use `company_members` and only then drops `companies.user_id`.

### Active Company Cookie
- **D-05:** Cookie name: `active_company_id`. httpOnly, sameSite=lax, path=/, max-age=30 days (rolling — refreshed on each successful resolution).
- **D-06:** Cookie is set by the new `getActiveCompanyId()` helper itself when it has to fall back (cookie missing/invalid). This keeps the cookie write logic colocated with the resolution logic and avoids a separate middleware layer.
- **D-07:** Fallback resolution when cookie missing/invalid/stale: query `company_members` for `user_id = auth.uid()` ordered by `companies.created_at DESC`, pick top 1, set cookie to that company_id, return. If zero memberships → return null (caller redirects to `/onboarding`, same as today).
- **D-08:** Cookie value is validated on every read: confirm the user still has a `company_members` row for that company_id. If not (company deleted, user removed from members), fall back per D-07.

### Server-Side Helpers
- **D-09:** New file: `lib/queries/active-company.ts` exports two functions:
  - `getActiveCompanyId(): Promise<string | null>` — cookie read + validation + fallback per D-07
  - `getActiveCompany(): Promise<AppCompany | null>` — wraps `getActiveCompanyId()` then loads the company row via `unstable_cache` keyed by `activeCompanyId`
- **D-10:** `getCachedCompany(userId)` from `lib/queries/auth.ts` stays (used by other phases via deprecation path), but `app/(app)/layout.tsx` and the inline `billingRow` query in that layout switch to `getActiveCompany()` and `companies.id = activeCompanyId` respectively.
- **D-11:** Cache invalidation: `revalidateTag('company')` is called by future Phase 80's switch action. In Phase 79, only the cache key changes (from `userId` to `activeCompanyId`) — the tag system is already in place.

### createOrUpdateCompany Mode Parameter
- **D-12:** Add `mode: 'first' | 'add'` parameter (default `'first'` for backwards-compat). In `'first'` mode: current SELECT-then-INSERT/UPDATE behavior is preserved. In `'add'` mode: always INSERT, never UPDATE; on success, also INSERT into `company_members` and set the `active_company_id` cookie to the new company's id.
- **D-13:** `'add'` mode is wired up in this phase (action signature + logic + cookie-set + member insert) but **no UI calls it yet**. Phase 80 wires the switcher dropdown's "Add company" entry to `/onboarding?mode=add` which will pass `mode: 'add'` to this action. This decoupling lets us test the action in isolation in Phase 79.

### Trial Clock for Additional Companies
- **D-14:** Companies created in `'add'` mode INHERIT the tier of the user's most-recently-created existing company (the one the cookie resolves to as "previous active") instead of starting a fresh 14-day trial. This is more conservative than literal "billing per-company" — prevents trial-farming where a user spins up new companies to get fresh trial windows. NOTE: this contradicts the literal reading of PROJECT.md "billing per-company"; the inheritance rule is the authoritative decision for v4.0. Phase 83 (billing per-company) will revisit if real revenue data shows the heuristic is wrong.
- **D-15:** `tier_trial_ends_at` for inherited companies copies from the source company. If the source is already past trial (`tier != 'free'` OR `tier_trial_ends_at < NOW()`), the new company is born in the same paid/expired state. No fresh 14-day window.

### Project Instructions Compliance
- **D-16:** All new files follow project conventions: TypeScript strict, server-side only (no service role exposed to browser), all secrets in `.env.local`/Vercel env vars (no hardcoded keys in migration or helpers).

### Claude's Discretion
- Exact migration filename (timestamp prefix follows existing `supabase/migrations/` convention)
- Whether `company_members.role` uses a CHECK constraint or a Postgres enum (planner can pick — CHECK is simpler given only one valid value today)
- Internal structure of `lib/queries/active-company.ts` (split into multiple files vs single)
- Test surface: unit tests for `getActiveCompanyId()` cookie/fallback logic are mandatory; integration tests for the migration backfill are mandatory; UI tests are not needed (no UI ships in this phase)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Direction
- `.planning/PROJECT.md` §"Current Milestone: v4.0 Multi-Tenancy" — Locked decisions list, target features, out-of-scope items
- `.planning/STATE.md` — Roadmap evolution note for Phase 79 + current milestone status
- `.planning/ROADMAP.md` §"Phase 79" — Goal placeholder (planner will fill in)

### Database Schema (Current)
- `supabase/migrations/20260409000001_initial_schema.sql` — Original `companies` table; `companies.user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` (line 12)
- `supabase/migrations/20260513000001_phase55_subscription_tiers.sql` — `tier`, `tier_trial_ends_at` columns (per-company in DB but currently keyed by user_id)
- `supabase/migrations/` — All migrations are reviewed for RLS patterns to mirror in the new `company_members` table

### Existing Code Touching Company Resolution
- `lib/queries/auth.ts` — `getAuthClaims()` and `getCachedCompany(userId)`; `AppCompany` type definition (lines 7-14)
- `lib/queries/company.ts` — `getCompanySettings`, `getCompanyTier`, `getCustomDomainSettings`, `getEstimateTemplateSettings` (all use `.eq('user_id', uid).single()` — DO NOT REWRITE in this phase; Phase 81 owns the sweep)
- `lib/actions/company.ts` — `createOrUpdateCompany` SELECT-then-INSERT/UPDATE logic (gets `mode` parameter added in this phase)
- `app/(app)/layout.tsx` — Calls `getCachedCompany(claims.sub)` and inline `billingRow` query by `user_id` (both switch to active-company-based reads in this phase)

### Onboarding (Reference Only — Not Modified in Phase 79)
- `app/onboarding/page.tsx` — Current onboarding entry (Phase 80 will read `?mode=add`)
- `components/onboarding/onboarding-survey.tsx` — Calls `createOrUpdateCompany` (Phase 80 will pass `mode: 'add'` when applicable)

### Phase 2 Origin
- `.planning/phases/02-company-onboarding/02-CONTEXT.md` — Decisions from original onboarding (D-01 to D-14) that constrain how `'add'` mode should behave (D-13: minimal companies row OK; D-03: skip behavior)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/queries/auth.ts:22-36` — `getCachedCompany` pattern with `unstable_cache`; the new `getActiveCompany()` mirrors this signature but keyed by `activeCompanyId` and using `revalidateTag('company')`.
- `cookies()` from `next/headers` — already used elsewhere in `lib/actions/company.ts` for `onboarding_complete`; same pattern for `active_company_id`.
- `requireServiceClient()` from `lib/supabase/service.ts` — used for `unstable_cache` reads (no cookies() inside cache). New `getActiveCompany()` continues this pattern.
- `revalidateTag('company')` infrastructure — Phase 80 will call this on switch; in Phase 79 we only need to ensure the tag is attached to the cache.

### Established Patterns
- All Supabase clients separated into `server.ts` (cookies-bound, for server components/actions), `service.ts` (service role, bypasses RLS, used inside `unstable_cache`), `client.ts` (browser). No exceptions.
- Migrations live in `supabase/migrations/` with timestamp prefix `YYYYMMDDHHMMSS_description.sql`. Each migration must be idempotent or test for prior state.
- RLS pattern: `CREATE POLICY ... ON <table> FOR <op> USING (...)` — review existing tables for `user_id = auth.uid()` shape; `company_members` policy mirrors this.
- Unit tests in `tests/unit/`; integration tests for DB migrations and server actions also live there (see `tests/unit/company-action.test.ts` for the existing pattern).

### Integration Points
- `app/(app)/layout.tsx` is the single entry point that resolves "the user's company" today; switching it to active-company-based reads cascades to everything that's currently OK because of the 1:1 backfill.
- `lib/inngest/functions/*.ts` — DO NOT TOUCH in this phase. They currently scope by `companyId` passed in the job payload, which is fine post-foundation (Phase 81 will audit).
- `proxy.ts` — current middleware handles `getClaims()` and `onboarding_complete` cookie; the new `active_company_id` cookie does NOT need middleware processing (read happens inside server components/actions).

</code_context>

<specifics>
## Specific Ideas

- The migration backfill MUST be tested against a snapshot with at least 2 existing `companies` rows (different `user_id`s) to confirm each gets exactly one membership row.
- The `active_company_id` cookie value is the only piece of multi-tenant state we add to the request lifecycle. Everything else (current company tier, settings, etc.) continues to be derived per request from the DB — this keeps cache invalidation simple.
- When `getActiveCompanyId()` writes the cookie during fallback, do it via `cookies().set(...)` from `next/headers` so it's part of the response. Test that subsequent reads in the same request hit the in-memory cookie (Next.js merges set+get).
- The `mode: 'add'` branch of `createOrUpdateCompany` is the part of this phase MOST likely to leak bugs into Phase 80 — make sure its unit tests cover: (a) INSERT happens even when user already owns a company, (b) `company_members` row is created, (c) cookie is set to new id, (d) tier/trial inheritance from source company.

</specifics>

<deferred>
## Deferred Ideas

The following are part of the v4.0 milestone but are explicitly out of scope for Phase 79 — these will be added to the roadmap as Phases 80-83 after this phase is planned:

- **Phase 80 — Switcher UI + Add-company entry point**: Topbar `CompanySelector` lists all of user's companies (query via `company_members`), marks active, server action that sets `active_company_id` cookie + `revalidateTag('company')`. "Add company" dropdown entry navigates to `/onboarding?mode=add` which threads `mode: 'add'` to `createOrUpdateCompany`. Includes storage path migration from `${user.id}/logo.${ext}` to `${company.id}/logo.${ext}` (bundled here because Phase 80 adds the second logo upload code path).
- **Phase 81 — Server-action sweep**: Rewrite ~20 server actions in `lib/actions/*.ts` (project, recording, photo, estimate-template, custom-domain, whatsapp-settings, theme, price-book, client, settings, etc.) plus the focused query helpers in `lib/queries/company.ts` (getCompanySettings, getCompanyTier, etc.) to derive `company_id` from `getActiveCompanyId()` instead of `.eq('user_id', uid).single()`.
- **Phase 82 — RLS rewrite**: Every tenant-scoped table (~12: projects, clients, estimates, estimate_items, estimate_templates, company_price_book, recordings, photos, integrations, notifications, custom_domains, whatsapp_settings) updates its RLS policy to gate by `EXISTS (SELECT 1 FROM company_members WHERE user_id = auth.uid() AND company_id = <table>.company_id)`. Drop `companies.user_id` column at the end of this phase once nothing reads it.
- **Phase 83 — Billing per-company**: Stripe customer becomes per-company (was per-user implicitly), `usage_events.company_id` becomes the only scoping column (drop user_id-based queries), trial expiry cron iterates `companies` not users.

</deferred>

---

*Phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe*
*Context gathered: 2026-05-21*
