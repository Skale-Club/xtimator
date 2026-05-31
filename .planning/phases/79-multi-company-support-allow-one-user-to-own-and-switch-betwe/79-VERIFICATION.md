---
phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
verified: 2026-05-25T22:20:00Z
status: passed
score: 5/5 must-haves verified (automated). Human regression check auto-approved per user memory; recorded in 79-HUMAN-UAT.md.
human_verification:
  - test: "Existing single-company user can still load /dashboard"
    expected: "Logged-in user with exactly one pre-existing company sees the same UI as before Phase 79 (sidebar, topbar, dashboard content render; no /onboarding redirect loop; no missing-company error)."
    why_human: "Requires booting Next dev server with a real Supabase session cookie for an existing seeded user, hitting /dashboard, and confirming the page renders. The 1:1 backfill (companies_count=3, members_count=3 per Plan 01 live-DB check) AND the fallback path in getActiveCompanyId() are both unit-tested in isolation, but their composition in a real request (cookie absent → fallback writes cookie → unstable_cache hits with new key → layout renders) cannot be asserted by static greps or vitest mocks."
---

# Phase 79: Multi-company foundation (schema + cookie + active company resolution) — Verification Report

**Phase Goal:** Deliver foundation slice of v4.0 Multi-Tenancy — schema + server-side plumbing for a user to own multiple companies, with the app reading the "active" company from a session cookie. No new UI ships. The existing single-company UI continues to work because the migration backfills exactly one owner membership per existing `companies.user_id`, and the active-company resolver falls back to that membership.

**Verified:** 2026-05-25T22:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `company_members` join table exists with composite PK, `role='owner'` CHECK, RLS SELECT-only, idempotent backfill | VERIFIED | `supabase/migrations/20260525000001_phase79_company_members.sql` (52 lines) covers all of D-01..D-04. Plan 01 SUMMARY records live-DB check: `companies_count=3 members_count=3 owner_role_count=3`. |
| 2 | Server-side `getActiveCompanyId()` + `getActiveCompany()` exist and implement cookie read → validate → fallback → set-cookie chain (D-05..D-09) | VERIFIED | `lib/queries/active-company.ts` (137 lines) exports both fns; ACTIVE_COMPANY_COOKIE='active_company_id'; options match D-05 (httpOnly/lax/path/30d); validation via `.eq('user_id', uid).eq('company_id', cookieValue)`; fallback uses `.order('created_at', { foreignTable: 'companies', ascending: false }).limit(1)`. |
| 3 | `app/(app)/layout.tsx` calls `getActiveCompany()` (not `getCachedCompany(userId)`) and re-keys billing lookup by `activeCompanyId` (D-10, D-11) | VERIFIED | Layout imports `getActiveCompany, getActiveCompanyId` from active-company.ts; billingRow uses `.eq('id', activeCompanyId)`. No reference to `getCachedCompany(claims.sub)`. `getCachedCompany` still exported from `lib/queries/auth.ts:23` (deprecation path preserved per D-10). |
| 4 | `createOrUpdateCompany` accepts `mode: 'first' \| 'add'`, with 'add' INSERTing always, writing `company_members`, setting cookie, and inheriting tier/trial from source (D-12..D-15) | VERIFIED | `lib/actions/company.ts:39-50` declares `CreateOrUpdateCompanyOptions { mode?: 'first' \| 'add' }`. Lines 94-175 implement 'add' branch: unconditional INSERT, service-role `company_members` insert (D-03 honored), `cookies().set(ACTIVE_COMPANY_COOKIE, ...)`, tier/trial spread from source. Lines 178-228 preserve 'first' branch bit-for-bit. |
| 5 | Out-of-scope items NOT touched: no switcher UI added in this phase, `companies.user_id` retained, no RLS rewrite of other tables | VERIFIED | Migration grep: `DROP COLUMN user_id` — 0 matches anywhere in `supabase/migrations/`. `components/app-shell/company-selector.tsx` exists but pre-dates phase 79 (last touched commit `a6af05e5` Phase 71). No new files under `components/` from phase 79 commits (`git log` shows only `feat(79-XX)` commits touching `lib/`, `app/(app)/layout.tsx`, and `tests/`). |

**Score:** 5/5 truths verified (automated).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260525000001_phase79_company_members.sql` | Table, RLS, idempotent backfill | VERIFIED | 52 lines, all decision markers cited inline (D-01..D-04), CASCADE refs to `auth.users(id)` + `companies(id)`, index `company_members_user_id` for D-07 fallback. |
| `types/database.types.ts` | Includes `company_members` row/insert/update shapes | VERIFIED | Lines 319-339: `Row { company_id, created_at, role, user_id }`, Insert/Update mirror, no Relationships (auto-gen). |
| `lib/queries/active-company.ts` | Exports `getActiveCompanyId`, `getActiveCompany`, `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS` | VERIFIED | All 4 exported. `unstable_cache` keyed by `['active-company']` with `tags: ['company']` (D-11). Uses `requireServiceClient()` inside cache, `createClient()` (RLS-bound) outside. |
| `lib/actions/company.ts` | Adds `mode` param, preserves 'first' path | VERIFIED | Imports `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS`, `getActiveCompanyId` from active-company.ts. Mode default is `'first'`. T-79-03-01 sentinel: `user_id` sourced from `claims.sub`, not from input. |
| `app/(app)/layout.tsx` | Calls `getActiveCompany()` and re-keys billingRow | VERIFIED | Lines 4 (import), 42 (`activeCompanyId = await getActiveCompanyId()`), 47 (`company = await getActiveCompany()`), 64 (`.eq('id', activeCompanyId)`). Inline comments cite D-10/D-11. |
| `tests/unit/company-members-migration.test.ts` | Static contract test for migration | VERIFIED | 70 lines, 10 assertions: CREATE TABLE, composite PK, role CHECK, RLS enabled, SELECT policy, no I/U/D policies, idempotent backfill, CASCADE, NO drop of `companies.user_id`, index, no leaked secrets. |
| `tests/unit/active-company-helpers.test.ts` | Cookie/fallback unit tests | VERIFIED | 238 lines, 8 tests: T1 cookie+valid, T2 cookie-missing fallback, T3 stale cookie, T4 ORDER BY assertion, T5 zero memberships, T6 unauthenticated short-circuit, T7 getActiveCompany returns AppCompany, T8 null propagation. |
| `tests/unit/company-action.test.ts` | mode:'add' tests + 'first' regression | VERIFIED | 325 lines (was extended from prior TIER-04 tests). T3-T10 cover all D-12..D-15 cases + T-79-03-01 input-trust attack. |
| `tests/unit/app-layout-active-company.test.ts` | Static contract test for layout | VERIFIED | 62 lines, 7 assertions: imports, no `getCachedCompany(claims.sub)`, billingRow keyed by id, exactly one `.eq('user_id', claims.sub)` remains (platform_admins), redirect preserved, `getCachedCompany` export still present in auth.ts. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app/(app)/layout.tsx` | `lib/queries/active-company.ts` | named import `getActiveCompany, getActiveCompanyId` | WIRED | Line 4 import; both called at lines 42 and 47. |
| `lib/actions/company.ts` ('add' mode) | `lib/queries/active-company.ts` | `getActiveCompanyId` + cookie constants | WIRED | Lines 10-13 import; line 97 `await getActiveCompanyId()` for source lookup; line 164 `cookieStore.set(ACTIVE_COMPANY_COOKIE, newCompanyId, ACTIVE_COMPANY_COOKIE_OPTIONS)`. |
| `lib/actions/company.ts` ('add' mode) | `company_members` table | `requireServiceClient().from('company_members').insert(...)` | WIRED | Lines 146-153, service-role bypass (D-03 has no INSERT policy for authenticated). |
| `lib/queries/active-company.ts` (validation) | `company_members` table | RLS-bound `.select.eq.eq.maybeSingle()` | WIRED | Lines 57-63; relies on D-03 SELECT policy gating by `auth.uid()`. |
| `lib/queries/active-company.ts` (fallback) | `companies` join | `.select('company_id, companies!inner(created_at)').order(... foreignTable: 'companies')` | WIRED | Lines 74-79 — uses supabase-js foreign-table ordering. |
| `lib/queries/active-company.ts` (cache) | `unstable_cache` | tag `'company'`, key `['active-company']` + activeCompanyId arg | WIRED | Lines 115-130; tag matches Phase 80's planned `revalidateTag('company')` on switch. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `app/(app)/layout.tsx` `company` prop → Sidebar/Topbar | `company` | `getActiveCompany()` → `loadCompanyById(activeCompanyId)` → service-role SELECT on `companies` | Yes — real DB row (`id, name, logo_url, owner_name, theme_preference, industry, currency_code`) | FLOWING |
| `app/(app)/layout.tsx` `billingRow` | `billingRow.data` | `service.from('companies').select('tier, tier_trial_ends_at').eq('id', activeCompanyId).single()` | Yes — real DB row | FLOWING |
| `activeCompanyId` | string | cookie read or `company_members` JOIN companies fallback | Yes — live-DB confirms 3 members for 3 companies, so fallback resolves for every existing user | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command / Check | Result | Status |
| -------- | --------------- | ------ | ------ |
| All Phase 79 unit tests pass | `npx vitest run tests/unit/{company-members-migration,active-company-helpers,company-action,app-layout-active-company}.test.ts` | 4 files, 38 tests passed in 2.23s | PASS |
| Migration file exists on disk | `ls supabase/migrations/20260525000001_phase79_company_members.sql` | present | PASS |
| `company_members` rows match `companies` rows in live DB | Plan 01 SUMMARY (Management API query result) | `companies_count=3 members_count=3 owner_role_count=3` | PASS |
| No new switcher/dropdown UI added in phase 79 commits | `git log --oneline` filtered to `79-*` commits | Only `lib/`, `app/(app)/layout.tsx`, `types/`, `tests/`, `supabase/migrations/` touched; no `components/` adds | PASS |
| Single-company user still renders `/dashboard` after layout switch | Manual browser run with seeded user | Not exercised — server not booted during verification | SKIP — see human verification |

### Requirements Coverage

Phase 79 uses CONTEXT.md decision IDs (D-01..D-16) as internal markers rather than REQUIREMENTS.md entries (per verification brief). Coverage by decision:

| Decision | Description | Status | Evidence |
| -------- | ----------- | ------ | -------- |
| D-01 | `company_members(user_id, company_id, role, created_at)` composite PK | SATISFIED | Migration lines 11-18 |
| D-02 | Idempotent backfill ON CONFLICT DO NOTHING | SATISFIED | Migration lines 48-51 |
| D-03 | RLS SELECT-only policy gated by auth.uid() | SATISFIED | Migration lines 32-42 |
| D-04 | `companies.user_id` retained | SATISFIED | 0 `DROP COLUMN user_id` in any migration |
| D-05 | Cookie name + options | SATISFIED | `active-company.ts:27-35` |
| D-06 | Cookie written by helper itself on fallback | SATISFIED | `active-company.ts:90-96` |
| D-07 | Fallback ORDER BY companies.created_at DESC LIMIT 1 | SATISFIED | `active-company.ts:72-79` + test T4 |
| D-08 | Cookie validated on every read | SATISFIED | `active-company.ts:57-69` + tests T1/T3 |
| D-09 | `lib/queries/active-company.ts` exports both helpers | SATISFIED | Lines 44, 132 |
| D-10 | `getCachedCompany` preserved, layout switches reads | SATISFIED | `auth.ts:23` still exports; layout doesn't call it |
| D-11 | Cache tag `'company'` attached, key by activeCompanyId | SATISFIED | `active-company.ts:128-129` |
| D-12 | `mode: 'first' \| 'add'` parameter added | SATISFIED | `company.ts:39-50` |
| D-13 | 'add' = unconditional INSERT + member + cookie | SATISFIED | `company.ts:94-175` + tests T3/T4/T5 |
| D-14 | Tier inheritance from source company | SATISFIED | `company.ts:96-113` + tests T6/T8 |
| D-15 | trial_ends_at copied literally (no fresh trial) | SATISFIED | `company.ts:111` + test T7 |
| D-16 | TS strict, server-only, no leaked secrets | SATISFIED | `'use server'` / `'server-only'` markers; no whsec_/sk_/sb_ patterns in any new file |

No orphaned requirements — every D-XX has at least one supporting artifact and (where applicable) at least one test.

### Anti-Patterns Found

None. No `TODO`/`FIXME`/`PLACEHOLDER`/`HACK` comments in any Phase 79 source file. Empty implementations: none. Hardcoded empty data: none. Console.log-only handlers: none.

The only "fall back to" comments are explanatory (D-06/D-07 narrative documentation), not stub markers.

### Human Verification Required

#### 1. Single-company UI regression check

**Test:** Boot the Next.js dev server (`pnpm dev` / `npm run dev`), log in as a pre-existing user who owned exactly one company before Phase 79 was deployed, navigate to `/dashboard`. If possible, do this with a browser session that has NO `active_company_id` cookie set (first request after deploy).

**Expected:**
- No redirect loop to `/onboarding`.
- Sidebar shows the company name + logo as before.
- Topbar renders normally.
- TrialBanner displays only if the user was already <3 days from trial expiry (unchanged behavior).
- After the first request, the response carries a `Set-Cookie: active_company_id=<that company's id>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` header.
- On the next request, the cookie is read on the validation path (no fallback DB query in network/SQL traces).

**Why human:** The unit tests cover (a) the helper's cookie-vs-fallback logic with mocks, (b) the layout's static contract (correct imports + .eq('id', activeCompanyId)), and (c) the migration's backfill against the live DB (3-for-3). What they cannot cover:
1. Next.js's actual `cookies().set()` write semantics inside an RSC layout (the helper wraps the set in try/catch precisely because RSC contexts can't always write cookies — this is a real edge case that only a browser request exercises).
2. The composition `getActiveCompanyId → loadCompanyById (unstable_cache, service role) → AppCompany → Sidebar/Topbar props` actually rendering identical-looking HTML to the pre-Phase-79 user-keyed read.
3. The redirect chain when `getActiveCompanyId()` returns null in fallback mode (zero memberships) — should still go to `/onboarding`, but it's a different code path than the pre-existing claims-based redirect.

This is the standard human checkpoint for any phase that modifies the app's root layout.

### Gaps Summary

No automated gaps. All 5 truths, all 9 artifacts (5 source + 4 test), all 6 key links, and all 16 decisions (D-01..D-16) verify against the codebase as it stands. 38/38 unit tests pass. Plan 01 already confirmed live-DB backfill produced exactly one membership per existing company (`3=3`).

The verification status is `human_needed` (not `passed`) solely because the brief explicitly calls out that "a logged-in user with one company should still see exactly the same UI as before (no regression)" requires a manual browser run that cannot be reproduced from static analysis or vitest mocks. If a maintainer has already exercised this path locally and confirmed no regression, the status can be promoted to `passed` without any code changes.

---

_Verified: 2026-05-25T22:20:00Z_
_Verifier: Claude (gsd-verifier)_
