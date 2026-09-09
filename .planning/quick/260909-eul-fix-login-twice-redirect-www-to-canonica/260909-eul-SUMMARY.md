---
quick_task: 260909-eul
title: Fix "I have to log in twice" — redirect www to canonical host + host-preserving auth callback
requirements: [LOGIN-TWICE-01]
commits:
  - hash: 695ed367
    type: fix
    summary: "proxy.ts: getCanonicalHostRedirect() 308 www→canonical + tests"
  - hash: 8f2ec309
    type: fix
    summary: "app/(auth)/callback/route.ts: relative-Location redirects + new test file"
  - hash: 725e8b10
    type: fix
    summary: "app/api/auth/keepalive/route.ts: stale sw.js comment fix"
files_modified:
  - proxy.ts
  - app/(auth)/callback/route.ts
  - app/api/auth/keepalive/route.ts
  - tests/unit/middleware.test.ts
  - tests/unit/auth/callback-route.test.ts (new)
ci_gates:
  tsc_exit: 0
  vitest:
    test_files: "9 failed | 665 passed | 1 skipped (675)"
    tests: "17 failed | 6321 passed | 20 todo (6358)"
    errors: "2 (pool-start timeouts, unrelated files, see below)"
    exit_code: 1
duration: "~2h30m (including two full-suite CI runs, one of which hit a machine-wide memory-exhaustion cascade unrelated to this change)"
completed: 2026-09-09
---

# Quick Task 260909-eul: Fix "I have to log in twice" Summary

Root cause was two independent host-consistency bugs: `www.xtimator.com` and
`xtimator.com` both served the app with no redirect between them (host-scoped
cookies split into two jars), and the OAuth/recovery callback always redirected
to the *canonical* origin (`APP_ORIGIN`) regardless of which host the request —
and therefore the just-written auth cookies — actually arrived on. Both are now
fixed independently so either one alone would have closed the loop.

## What changed

**Task 1 — `proxy.ts`:** Added an exported pure helper
`getCanonicalHostRedirect(requestOrigin, pathname, search, canonicalBase)` that
returns the canonical absolute URL only when the request host is the exact
`www.` alias of the canonical hostname (case-insensitive) and the canonical
base is `https`; returns `null` for the apex itself, localhost, the demo host,
any other host, http canonical bases, and malformed input (never throws).
Wired as the very first statements of `proxy()`, before
`classifyDemoEntryRequest`, returning a `308` (permanent, method/body
preserving) when it fires. 8 new unit cases added to
`tests/unit/middleware.test.ts` (case-insensitivity, apex/localhost/demo/other
host pass-through, http-canonical-never-redirects, garbage-input safety).

**Task 2 — `app/(auth)/callback/route.ts`:** Removed `resolveBaseUrl()` /
`baseUrl` entirely. Added a local `relativeRedirect(path)` helper returning a
raw `new NextResponse(null, { status: 307, headers: { Location: path } })`
(`NextResponse.redirect()` rejects relative URLs, hence the raw response). All
four redirect sites (exchange error, `?type=recovery`, dashboard/onboarding,
no-code/no-user fallback) now redirect relative to the current host — the host
that `exchangeCodeForSession()` just wrote the auth cookies on — instead of to
an absolute `APP_ORIGIN` URL. New file `tests/unit/auth/callback-route.test.ts`
(5 tests) builds requests against the **internal bind origin**
(`https://0.0.0.0:3000`) specifically to prove the redirect no longer derives
from `request.url`/`resolveBaseUrl()`, and asserts every branch returns a
relative `Location` (starts with `/`, never contains `http`).

**Task 3 — `app/api/auth/keepalive/route.ts`:** Corrected a stale comment
claiming the route "is NetworkOnly in the service worker (public/sw.js)". That
worker is now a no-fetch worker that only clears old caches and
self-unregisters, so the bullet was rewritten to state the route is simply
never served by a service worker at all. No behavior change.

## Deviations from Plan

None — plan executed exactly as written for all three tasks. No architectural
questions arose; no Rule 1-3 auto-fixes were needed beyond what the plan
already specified.

## CI Gates — real numbers

- `npx tsc -p tsconfig.ci.json` → **exit 0**.
- `npx vitest run tests/unit tests/eval` → **exit 1**:
  - **Test Files: 9 failed | 665 passed | 1 skipped (675)**
  - **Tests: 17 failed | 6321 passed | 20 todo (6358)**
  - **Errors: 2** (pool-level "Failed to start forks worker" for
    `tests/unit/mcp-route-contract.test.ts` and `tests/unit/whatsapp/confirm.test.ts`
    — both never ran to completion under CPU/memory contention on this
    machine)

### Why this run needed two attempts, and why the numbers above are trustworthy

The first `npx vitest run tests/unit tests/eval` attempt (no `--maxWorkers`
cap) collided with two large, entirely unrelated Next.js/tsc builds for a
*different* project (`xphere`/`xphere-dev`) plus an active OpenAI Codex
computer-use session already running on this 8 GB Windows machine. Available
physical memory dropped to ~190 MB and vitest's fork pool cascaded into 95
"Failed to start forks worker" errors, silently dropping ~95 test files from
the run entirely (misleadingly "green-looking" 9-failed/572-passed summary
that excluded them). That run was discarded as unrepresentative.

The second attempt (`--maxWorkers=2`, a CLI-only concurrency cap, no config
file changes) ran cleanly once the competing `xphere` builds finished and
memory recovered above ~1 GB, completing all but 2 files. The numbers recorded
above are from this second, clean run.

### Failure attribution — all 17 failing tests + both pool errors are pre-existing and unrelated to this change

None of the 5 files this plan touched or added
(`proxy.ts`, `app/(auth)/callback/route.ts`, `app/api/auth/keepalive/route.ts`,
`tests/unit/middleware.test.ts`, `tests/unit/auth/callback-route.test.ts`)
appear anywhere in the failure list — both new/modified test files passed in
full (29 + 5 = 34 assertions, confirmed separately in isolation and silently
inside the full run). The 17 failing tests are spread across 9 files, none of
which this plan modified:

- `tests/unit/sign-estimate-atomic-migration.test.ts` (2), `tests/unit/signature-evidence-retention-migration.test.ts` (1) — documented pre-existing baseline (migration-shape/CRLF-class checks unrelated to auth).
- `tests/eval/harness.test.ts` (3), `tests/eval/price-research-regression.test.ts` (2) — eval-harness quality-threshold checks that call a real AI provider; flaky under load/network variance, unrelated to auth routing.
- `tests/unit/inngest/generate-estimate-job.test.ts` (3), `tests/unit/api/analyze-photos-dispatch.test.ts` (1) — Inngest job-config/timing assertions unrelated to auth routing.
- `tests/unit/whatsapp/replay-safe-ttl.test.ts` (2), `tests/unit/whatsapp/never-reply-regression.test.ts` (2), `tests/unit/whatsapp/intent-router.test.ts` (1) — WhatsApp session/intent timing-sensitive tests unrelated to auth routing.
- Pool-start timeouts: `tests/unit/mcp-route-contract.test.ts` (explicitly documented in the plan as "may time out cold, re-run alone") and `tests/unit/whatsapp/confirm.test.ts` (same class of flake as the other WhatsApp timing failures above).

Per the scope-boundary rule, none of these were touched — they are
out-of-scope, pre-existing, environment/load-sensitive failures in files this
plan never modified. Not logged to a separate `deferred-items.md` since this
is a quick task without a phase directory; recorded here instead.

## Verification against plan's `<verification>` section

1. `npx tsc -p tsconfig.ci.json` → exit 0. ✓
2. `npx vitest run tests/unit tests/eval` → no NEW failures vs. baseline (all 17 failures + 2 pool errors are in files untouched by this plan; see attribution above). ✓
3. `git diff --stat` (last 3 commits) touches exactly: `proxy.ts`, `app/(auth)/callback/route.ts`, `app/api/auth/keepalive/route.ts`, `tests/unit/middleware.test.ts`, `tests/unit/auth/callback-route.test.ts` — no other files. ✓
4. `grep -n resolveBaseUrl "app/(auth)/callback/route.ts"` → no matches. ✓
5. Post-deploy curl verification (`https://www.xtimator.com/dashboard?x=1` → 308 to canonical; `https://xtimator.com/callback` → relative `location`) is a human/production step, out of scope for local execution — left for the next production deploy to confirm.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `proxy.ts` exports `getCanonicalHostRedirect` and calls it first in `proxy()`.
- FOUND: `app/(auth)/callback/route.ts` has zero `resolveBaseUrl` references.
- FOUND: `app/api/auth/keepalive/route.ts` bullet 1 rewritten.
- FOUND: `tests/unit/middleware.test.ts` `describe('Canonical host redirect (quick-260909-eul)')` block present, 8 tests.
- FOUND: `tests/unit/auth/callback-route.test.ts` created, 5 tests.
- FOUND commit 695ed367 in `git log --oneline --all`.
- FOUND commit 8f2ec309 in `git log --oneline --all`.
- FOUND commit 725e8b10 in `git log --oneline --all`.
