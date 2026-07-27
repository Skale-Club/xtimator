---
phase: 180-isolated-demo-session-read-only-foundation
plan: 14
subsystem: auth
tags: [supabase, rls, nextjs, coolify, playwright, captcha]

requires:
  - phase: 180 (plans 01-13, 15)
    provides: demo host routing, mutation-boundary guards across every write funnel, the demo_readonly_foundation RLS migration
provides:
  - demo_readonly_foundation migration applied to production (Xtimator, prmqgcrnpuvpzruyzvuv), live RLS verified against real prod schema
  - fixed apex<->demo-host classification for self-hosted deployment (was infinite-redirect-looping in real production topology)
  - fixed demo server-side login (was 100% broken in production due to Auth-level CAPTCHA)
  - tests/e2e/demo-session-isolation.spec.ts — the phase's Chromium cross-host proof
affects: [181-real-product-cutover-verification]

tech-stack:
  added: []
  patterns:
    - "getRequestOrigin() — read Host/x-forwarded-host instead of request.nextUrl.origin when self-hosted (nextUrl.origin only reflects per-request host on Vercel)"
    - "Server-side user login via admin.generateLink()+verifyOtp() instead of signInWithPassword() when CAPTCHA protection is enabled project-wide and no browser widget is available"

key-files:
  created:
    - tests/e2e/demo-session-isolation.spec.ts
  modified:
    - lib/demo/session.ts
    - proxy.ts
    - tests/unit/demo/session-route.test.ts
    - supabase/migrations/20260726000001_demo_readonly_foundation.sql (applied to prod, not edited)
    - 10 pre-existing test files (mock-drift repair, see Deviations)

key-decisions:
  - "Used a disposable rolled-back SQL transaction against production (via Supabase MCP execute_sql) to prove RLS live, instead of Docker (broken on this machine) or a paid Supabase branch (org has no branching entitlement, declined by operator)."
  - "Switched establishDemoSession() from signInWithPassword to admin.generateLink()+verifyOtp() — a real production-blocking bug found while writing the required E2E spec, not a hypothetical."
  - "Added getRequestOrigin() reading Host/x-forwarded-host — request.nextUrl.origin is Vercel-specific and always wrong for this self-hosted (Coolify) deployment; every demo-host request was misclassified as apex, infinite-redirect-looping."

patterns-established:
  - "Any future request-origin classification against configured hosts must use getRequestOrigin() (lib/demo/session.ts), never request.nextUrl.origin, on this self-hosted stack."

requirements-completed: [ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, SAFE-01, SAFE-02, SAFE-03, SAFE-04]

duration: ~5h (across two sessions; paused at Task 2 once, resumed and completed)
completed: 2026-07-27
---

# Phase 180 Plan 14: Preflight, Production Authorization, Final Evidence — Summary

**Applied the SAFE-03 RLS migration to production with live proof it works, then found and fixed two real bugs (self-hosted host misdetection causing an infinite redirect loop, and CAPTCHA silently blocking every server-side demo login) that the required Chromium E2E spec exposed — the demo entry feature did not actually work end-to-end in production until this plan.**

## Performance

- **Duration:** ~5h across two sessions (Session 1: preflight + stop at Task 2 checkpoint; Session 2: environment troubleshooting, production authorization, migration apply, live proof, test repair, E2E authoring, two real bug fixes)
- **Completed:** 2026-07-27
- **Tasks:** 3 (Task 1 preflight, Task 2 production-authorization checkpoint, Task 3 push + final evidence)
- **Files modified:** 15 (2 app files, 1 migration applied, 12 test files — 10 pre-existing repairs + 1 new + 1 updated)

## Accomplishments

- Production schema mutation: `demo_readonly_foundation` migration applied to Xtimator prod (`prmqgcrnpuvpzruyzvuv`) — 9 RESTRICTIVE policy sets across every current public RLS table + `companies` + `storage.objects`, gated by an atomic preflight that verified exactly one valid demo user/company mapping before touching anything.
- Live RLS proof against the real production database (not a mock, not local Docker): a demo-user-simulated `authenticated` role session, inside a transaction that ends in `ROLLBACK`, proved a company-row UPDATE matches 0 rows and an INSERT is rejected with `42501 new row violates row-level security policy`, while reads keep working — zero permanent data change.
- Found and fixed a real infinite-redirect-loop bug: `classifyDemoEntryRequest`/`establishDemoSession` (and `proxy.ts`'s own apex/demo-host check) compared `request.nextUrl.origin` against the configured hosts. That field only reflects the real per-request Host on Vercel; this app is self-hosted (GitHub Actions → Docker/GHCR → Coolify), so under `next start`/the standalone server it's always the server's own bind address — every real demo-host hit misclassified as apex and `/demo/entry` redirected to itself forever. Verified identically across `next dev`, `next start`, and the exact standalone-server command the Dockerfile's `CMD` runs.
- Found and fixed a real CAPTCHA-blocking bug: `establishDemoSession` called `signInWithPassword()`, which this project's Supabase Auth rejects project-wide without a Cloudflare Turnstile token — and there is no browser widget in a server-side handoff to solve one. Every real login attempt failed with `captcha_failed`, so the demo route always returned its terminal 503. Switched to the Admin API (`generateLink()` + `verifyOtp()`, service-role, not subject to the password-grant CAPTCHA gate), with a single bounded retry covering an observed transient `otp_expired` immediately after a local `signOut()` on the repair path.
- Wrote and landed `tests/e2e/demo-session-isolation.spec.ts` — one real Chromium browser context proving, against a real running server: the apex→demo-host redirect chain, real `/dashboard` reach with `DemoBanner` visible, host-only cookie isolation (never leaking to apex), a blocked write returning the exact `demo_readonly` 403 payload, apex cookie-jar/identity restored after the demo excursion, and two bounded re-entry cases (valid-session reuse, stale-cookie repair) that settle in ≤2 hops instead of looping. Stable across 3 consecutive runs.
- Repaired 10 pre-existing tests broken by earlier phase-180 plans' `assertWritable()`/`assertCompanyWritable()` wiring (module-scope `unstable_cache`/`cookies()` dependency chain tripping stale mocks) — full suite is genuinely green, not red-with-an-excuse.

## Task Commits

1. **Task 1 (partial, Session 1):** preflight evidence recorded — `8c26e8c4` (wip, paused at checkpoint)
2. **Task 2 decision (Session 2):** operator authorized the exact production target/checksum after live discussion of the RLS-vs-application-guard threat model — no separate commit (decision recorded in chat + this SUMMARY)
3. **Docs (Session 2):** `9ab19a46` — recorded the Docker/Supabase-branching environment investigation
4. **Test repair (Session 2):** `e6aa67f5` — 10 pre-existing tests fixed (demo-guard mock drift)
5. **Task 3 (Session 2):** `1bf005e9` — the two real bug fixes + new E2E spec + updated unit test

**Plan metadata:** this SUMMARY.md (docs commit to follow)

_Migration apply and the live-RLS proof transaction were run via Supabase MCP directly against production — not a git commit (schema change, not a file change), captured in this SUMMARY and the 180-14-CHECKPOINT.md history instead._

## Files Created/Modified

- `lib/demo/session.ts` — `getRequestOrigin()` helper (Host/x-forwarded-host, not `nextUrl.origin`); `establishDemoSession` login switched to Admin API magic-link with one bounded retry
- `proxy.ts` — apex-vs-demo-host check uses `getRequestOrigin()`
- `tests/unit/demo/session-route.test.ts` — mocks updated for `generateLink`/`verifyOtp` instead of `signInWithPassword`
- `tests/e2e/demo-session-isolation.spec.ts` — new, the phase's required Chromium cross-host proof
- `supabase/migrations/20260726000001_demo_readonly_foundation.sql` — applied to production (file itself unchanged, was already committed in an earlier plan)
- 10 pre-existing test files — demo-guard mock-drift repair (`switch-active-company.test.ts`, `notifications/event-sources.test.ts`, `actions/team-invite.test.ts`, `actions/team-manage.test.ts`, `actions/invite-accept.test.ts`, `billing/seat-billing-wiring.test.ts`, `services/generate-estimate.test.ts`, `services/generate-estimate-captions.test.ts`, `eval/harness.test.ts`, `eval/price-research-regression.test.ts`)

## Decisions Made

- **RLS verification without Docker or a paid Supabase branch:** local Docker Desktop had a persistent, unfixable-in-session fault (stale AF_UNIX socket reparse points recreated on every startup, root cause deeper than a one-time cleanup); Supabase branching returned `402 entitlement_required` (org not on a plan with branching). Operator explicitly declined paying for either. Used a `BEGIN ... ROLLBACK` SQL transaction via Supabase MCP against production instead — genuine live proof, zero permanent mutation, no new spend.
- **Production migration authorized, not assumed:** the plan's Task 2 explicitly forbids inferring authorization from config/auto_advance. Operator gave explicit, separate authorization in chat after seeing the exact target/checksum and the Docker/branching investigation — the push did not happen until that point.
- **Fixed the two real bugs found while writing the E2E spec, rather than shipping a spec that would only ever pass locally:** both bugs (host misdetection, CAPTCHA) would have made the demo entirely non-functional in real production (Coolify + CAPTCHA-enabled Auth) even though every unit test and the static RLS contract were green. Fixing them was in-scope because they broke the exact requirements (ENTRY-01..04) this plan exists to prove.

## Deviations from Plan

### Auto-fixed Issues

**1. [Real bug found during E2E authoring] Host misclassification causing an infinite redirect loop**
- **Found during:** Task 3 (writing/running the required Chromium E2E spec)
- **Issue:** `request.nextUrl.origin` (used in `classifyDemoEntryRequest`, `establishDemoSession`, and `proxy.ts`) is Vercel-specific; on this self-hosted stack it's always the server bind address, so every demo-host request misclassified as apex and `/demo/entry` redirected to itself forever
- **Fix:** new `getRequestOrigin()` helper reading `Host`/`x-forwarded-host`, used in all three call sites
- **Files modified:** `lib/demo/session.ts`, `proxy.ts`
- **Verification:** reproduced and confirmed fixed against `next dev`, `next start`, and `node .next/standalone/server.js` (the Dockerfile's exact production command); `tests/unit/demo/host-routing.test.ts`/`session-route.test.ts`/`middleware.test.ts` (36 tests) stayed green throughout
- **Committed in:** `1bf005e9`

**2. [Real bug found during E2E authoring] CAPTCHA silently blocking every server-side demo login**
- **Found during:** Task 3, same E2E run
- **Issue:** `signInWithPassword()` is rejected project-wide by this Supabase project's CAPTCHA (Turnstile) requirement — no browser widget exists in the server-side handoff to satisfy it — so the demo login always failed with `captcha_failed` and returned the terminal 503
- **Fix:** switched to `requireServiceClient().auth.admin.generateLink()` (mints a magic-link token server-side, service-role, not CAPTCHA-gated) + `verifyOtp()` on the request-scoped client to redeem it and write real session cookies; one bounded retry (still inside the same response, no extra redirect) for an observed transient `otp_expired` immediately following a local `signOut()`
- **Files modified:** `lib/demo/session.ts`, `tests/unit/demo/session-route.test.ts`
- **Verification:** live curl trace showed real `sb-*` session cookies + 303 to `/dashboard`; E2E spec green 3/3 consecutive runs including the stale-cookie repair path
- **Committed in:** `1bf005e9`

**3. [Rule: stale-mock repair] 10 pre-existing tests broken by earlier phase-180 plans' guard wiring**
- **Found during:** Task 3's required full CI-equivalent suite run
- **Issue:** `assertWritable()`/`assertCompanyWritable()` calls added by plans 02-13 (and the 180-15 mutation-boundary sweep) transitively import `lib/queries/active-company.ts` → `lib/queries/auth.ts`, whose module-scope `unstable_cache()` call and real `cookies()` usage broke these files' pre-existing mocks
- **Fix:** mocked `@/lib/demo/guard` directly (matching the established `tests/unit/demo/*` boundary-test pattern) or added a passthrough `unstable_cache` to `next/cache` mocks, per file
- **Files modified:** 10 test files (listed above)
- **Verification:** full suite 553/554 files, 4572/4572 tests green
- **Committed in:** `e6aa67f5`

---

**Total deviations:** 3 auto-fixed (2 real production-blocking application bugs, 1 stale-mock repair class)
**Impact on plan:** All three were necessary for SAFE-04's actual claim ("complete phase suite proves isolation... including... proof") to be true rather than aspirational. No scope creep — nothing touched outside what Task 3's own acceptance criteria required.

## Issues Encountered

- Local Docker Desktop had a persistent AF_UNIX-socket-reparse-point fault (`dockerInference`, then `docker-secrets-engine`) that recreated itself on every restart — root-caused via `backend.error.json` but not resolvable within this session without a full Docker Desktop factory reset (declined; would wipe unrelated local Docker state). Local live-RLS/lint/disposable-reset evidence stays unavailable on this machine; production live-RLS evidence (the transaction-rollback proof) substitutes for it per operator decision.
- Supabase branching returned `402 entitlement_required` — org `tsybxxlhruvgviewclbl` is not on a plan with branching. Declined by operator; not revisited.
- `bun run dev`'s `concurrently` wrapper died on a broken local `inngest-cli` binary (unrelated `--ignore-scripts` install issue), unrelated to this plan; worked around by running `next dev` directly for E2E verification (Inngest isn't exercised by this spec).
- `.next/types/validator.ts` went stale after a temporary diagnostic route was created and removed during E2E debugging, causing a false `tsc` failure; resolved by clearing `.next` (safe, disposable build cache).

## User Setup Required

None — no new external service configuration required. (The CAPTCHA requirement on Supabase Auth is pre-existing project configuration, worked around in code rather than requiring a settings change.)

## Next Phase Readiness

Phase 180 is now **complete (15/15 plans)** with genuine, verified evidence for all eight requirements (ENTRY-01..04, SAFE-01..04), including two real production-blocking bugs found and fixed rather than papered over. Phase 181 (real-product-cutover-verification) can proceed — its dependency ("Phase 180's isolation and deny-write test gate passes") is now actually true, not just documented as true.

Carried forward for awareness (not blockers): local Docker Desktop remains broken on this machine (defer or factory-reset later, operator's call); Supabase org has no branching entitlement (upgrade is operator's call if wanted later); `.env.local`'s local Supabase CLI `SUPABASE_ACCESS_TOKEN` differs from the machine's global `supabase login` session (only the `.env.local` token can see the Xtimator project) — worth remembering for any future CLI-based Supabase work on this machine.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-27*
