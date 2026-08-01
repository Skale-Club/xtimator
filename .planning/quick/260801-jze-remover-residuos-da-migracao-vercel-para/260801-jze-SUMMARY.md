---
phase: 260801-jze
plan: 01
subsystem: settings, oauth, config
tags: [vercel-cleanup, dns, oauth-security, config]
requires: []
provides:
  - "Coolify-correct DNS instructions on custom-domain settings page"
  - "resolveIssuer() production safety net independent of VERCEL_* env vars"
affects:
  - components/settings/custom-domain-form.tsx
  - lib/oauth/issuer.ts
  - next.config.ts
tech-stack:
  added: []
  patterns:
    - "NODE_ENV === 'production' as the trust boundary for issuer resolution (matches existing convention in app/api/stripe/connect/initiate/route.ts, instrumentation.ts)"
key-files:
  created: []
  modified:
    - components/settings/custom-domain-form.tsx
    - lib/oauth/issuer.ts
    - tests/unit/oauth-issuer.test.ts
    - next.config.ts
  deleted:
    - vercel.json
decisions:
  - "Replaced VERCEL_ENV/VERCEL_URL branches with a single NODE_ENV === 'production' fallback in resolveIssuer(), closing a spoofed-Host-header gap now that the Vercel-production safety net (VERCEL_ENV check) no longer exists"
  - "DNS instructions card intentionally omits any coolify.skale.club link (internal infra) — copy says the shown values are authoritative instead of pointing to a provider dashboard"
metrics:
  duration: "~35 min (dominated by a ~23 min full `vitest run tests/unit` verification pass)"
  completed: 2026-08-01
---

# Phase 260801-jze Plan 01: Remove Vercel migration residuals Summary

Removed three Vercel-migration leftovers: customer-facing DNS instructions that pointed at dead Vercel infrastructure, unreachable `VERCEL_ENV`/`VERCEL_URL` branches in the OAuth issuer resolver (replaced with a `NODE_ENV`-based production safety net that can't be spoofed via request headers), and dead `vercel.json` config plus two stale comments in `next.config.ts`.

## What was built

**Task 1 — `components/settings/custom-domain-form.tsx`:** The "DNS Setup Instructions" card now shows `188.245.112.3` for the apex `A` record and `xtimator.com` for the subdomain `CNAME` value (both match the Coolify shared host, confirmed live in production). Removed the `vercel.com/dashboard` link and the Vercel-SSL sentence; the paragraph now says SSL is provisioned automatically via Let's Encrypt and that the shown values are authoritative — no internal `coolify.skale.club` reference was introduced (that's internal infra, deliberately never exposed to tenants).

**Task 2 — `lib/oauth/issuer.ts` + `tests/unit/oauth-issuer.test.ts`:** Deleted the `VERCEL_ENV === 'production'` and `VERCEL_URL` branches. `resolveIssuer()`'s resolution order is now: (1) explicit env (`APP_ORIGIN` → `NEXT_PUBLIC_APP_URL` → `NEXT_PUBLIC_SITE_URL`), (2) `NODE_ENV === 'production'` → `CANONICAL_PRODUCTION_URL` (`https://xtimator.com`), (3) request-origin fallback via `next/headers` (dev/test only). This closes a latent security gap: previously, once the Vercel `VERCEL_ENV` safety net was gone, a production runtime with no explicit env var set would have fallen through to trusting `x-forwarded-host`/`host`, letting a spoofed Host header become the OAuth issuer. Rewrote the top-of-file comment to document the new 3-tier order. Test file updated to match: dropped `VERCEL_ENV`/`VERCEL_URL` from `envBackup`, drove the production-fallback tests via `NODE_ENV`, deleted the now-nonexistent "VERCEL_URL preview" test, and replaced the old regression test with one that mocks `next/headers` to return a spoofed `evil.example.com` Host header and asserts `resolveIssuer()` still returns `https://xtimator.com` under `NODE_ENV=production`.

**Task 3 — `vercel.json` deleted, `next.config.ts` comments fixed:** Removed the dead `vercel.json` (Bun `framework`/`buildCommand`/`devCommand`/`installCommand` — production builds via `Dockerfile` + npm, deployed via GitHub Actions → GHCR → Coolify). Fixed the CSP report-only comment (dropped "Vercel" from the third-party list being validated against) and the HSTS comment ("Prod is HTTPS-only on Vercel" → "Prod is HTTPS-only (Coolify/Traefik terminates TLS)").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `NODE_ENV` is a read-only property under this project's TS config**

- **Found during:** Task 2, first `npx tsc --noEmit` after rewriting `tests/unit/oauth-issuer.test.ts`
- **Issue:** The plan's behavior spec says to "drive it via `NODE_ENV = 'production'`" directly, but `process.env.NODE_ENV = 'production'` fails to typecheck (`TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property`) — this project's `@types/node`/TS config marks `NODE_ENV` read-only on `ProcessEnv`.
- **Fix:** Used `vi.stubEnv('NODE_ENV', 'production')` (Vitest's built-in env-stubbing API, which bypasses the readonly TS restriction) in all four tests that need `NODE_ENV=production`, and added `vi.unstubAllEnvs()` to `afterEach` alongside the existing manual env-var restore. All other env vars (`APP_ORIGIN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`) still use direct `process.env.X =` assignment since those are writable.
- **Files modified:** tests/unit/oauth-issuer.test.ts
- **Commit:** c025356d

None of the plan's other assertions/behavior changed — only the mechanism for setting `NODE_ENV` in tests.

### Pre-existing failures encountered during full verification (not fixed — out of scope)

Task 3's required `npx vitest run tests/unit` run surfaced 4 failing tests out of 5012. All 4 are unrelated to this plan's three target files (`components/settings/custom-domain-form.tsx`, `lib/oauth/issuer.ts`, `tests/unit/oauth-issuer.test.ts`, `vercel.json`, `next.config.ts`) and were verified as pre-existing / environment-flaky, not regressions introduced here:

- **`tests/unit/sign-estimate-atomic-migration.test.ts` — "is SECURITY DEFINER ... with search_path pinned"** and **`tests/unit/signature-evidence-retention-migration.test.ts` — "is SECURITY DEFINER with search_path pinned"**: both assert a regex against raw SQL migration file content (`erase_company_for_compliance`/`sign_estimate_atomic` functions), completely unrelated to Vercel/OAuth. **Verified pre-existing:** re-ran both tests in isolation with this plan's changes fully stashed (`git stash`, then restored via `git stash pop`) — they failed identically without any of this plan's changes present, confirming these are pre-existing failures in migration test assertions vs. the current `.sql` file content, not something this plan caused.
- **`tests/unit/mcp-route-contract.test.ts` — "GET returns 405 Method Not Allowed ..."**: failed with `Test timed out in 15000ms` only under the full 602-file suite (which ran under heavy fork-pool contention — full run took 1408s / ~23 min). **Verified flaky, not a regression:** re-ran this file in isolation (`npx vitest run tests/unit/mcp-route-contract.test.ts ...`) and it passed. This test's own source comment already documents it needs a raised timeout "under vitest fork-pool contention."
- **`tests/unit/api/analyze-photos-dispatch.test.ts` — "returns { jobId } HTTP 202 in <1s"**: failed with `elapsed 1197 to be less than 1000` — a hard-coded wall-clock timing assertion, also only under full-suite contention. **Verified flaky, not a regression:** passed when re-run in isolation.

These are logged here per the task instruction ("If a pre-existing unrelated failure blocks you, report it explicitly in the summary rather than hiding it") rather than fixed, per the scope boundary (only fix issues directly caused by this plan's changes). No `deferred-items.md` entry was created since these are test-suite health issues outside this quick task's phase directory scope, not deferred plan work.

### Untouched, unrelated working-tree noise

`tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` and `.../document-label-parity.test.ts.snap` showed as modified (`M`) in `git status` after the full suite ran, but `git diff` on both shows **zero content difference** — only a git CRLF/LF line-ending warning. These files are not in this plan's `files_modified` list and were left untouched/unstaged.

## Self-Check

- `components/settings/custom-domain-form.tsx` — FOUND (contains `188.245.112.3`, `xtimator.com`, no `vercel.com`/`coolify.skale.club`)
- `lib/oauth/issuer.ts` — FOUND (no `VERCEL_ENV`/`VERCEL_URL` references; `NODE_ENV === 'production'` fallback present)
- `tests/unit/oauth-issuer.test.ts` — FOUND (9 tests, all passing, includes spoofed-Host regression test)
- `next.config.ts` — FOUND (no remaining Vercel references in comments)
- `vercel.json` — deleted (confirmed absent from working tree and staged as `D` in the Task 3 commit)
- Commit e9c15238 (Task 1) — FOUND in `git log`
- Commit c025356d (Task 2) — FOUND in `git log`
- Commit 731025c0 (Task 3) — FOUND in `git log`

## Self-Check: PASSED

## Verification Results

- `npx tsc --noEmit`: **PASS** (exit 0, no output) — verified after every task and again as the final check.
- `npx vitest run tests/unit/oauth-issuer.test.ts`: **PASS** — 9/9 tests passed.
- `npx vitest run tests/unit` (full suite, Task 3's required check): **4 failed | 597 passed | 1 skipped (602 files)**, **4 failed | 4988 passed | 20 todo (5012 tests)**. All 4 failures are pre-existing/environment-flaky and unrelated to this plan's changes (see "Pre-existing failures" above, with isolation-run and stash-based verification evidence for each).
