---
phase: 180-isolated-demo-session-read-only-foundation
plan: 15
subsystem: mutation-boundary-security
tags: [demo, read-only, ast, typescript, vitest, webhooks, oauth, tdd]

# Dependency graph
requires:
  - phase: 180-02
    provides: "Canonical D-08 through D-10 demo classification and guard contract"
  - phase: 180-03..180-12
    provides: "Guarded Server Actions, routes, service funnels, provider paths, and product-effect jobs"
provides:
  - "Executable AST census of exported actions, HTTP handlers, service funnels, and Inngest jobs"
  - "Exact manifest/discovery equality that rejects newly unclassified mutation boundaries"
  - "Guard evidence and executable guard-before-effect ordering for newly uncovered paths"
affects: [phase-181, ci, demo, webhooks, oauth, inngest, mutation-security]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TypeScript compiler AST derives exports and call evidence without counting comments"
    - "Explicit symbol literals classify each boundary instead of inheriting file-level authority"
    - "Signed provider callbacks resolve trusted company context before applying the company demo guard"

key-files:
  created:
    - tests/unit/demo/mutation-boundary-sweep.test.ts
  modified:
    - app/api/stripe/connect/callback/route.ts
    - app/api/logout/route.ts
    - app/api/cron/cleanup-whatsapp-sessions/route.ts
    - app/api/webhooks/twilio/route.ts
    - app/api/webhooks/whatsapp/route.ts

key-decisions:
  - "The census discovers executable exports mechanically but requires every symbol to be listed explicitly, so new exports cannot inherit an existing file classification."
  - "Signed webhooks retain signature-first authentication, then guard trusted company product effects with assertCompanyWritable."
  - "Machine-authorized WhatsApp session retention may delete expired rows, while its customer-facing provider notification remains demo-guarded."
  - "Shared demo logout uses local Supabase scope so one visitor cannot revoke another visitor's session."

patterns-established:
  - "A guarded classification must reach assertWritable, assertCompanyWritable, or demoGuardResponse through executable local or named cross-module call evidence."
  - "Every exception records both an independent authority and why the declaration has no tenant product mutation."

requirements-completed: [SAFE-01, SAFE-02, SAFE-04]

# Metrics
duration: 18 min
completed: 2026-07-26
---

# Phase 180 Plan 15: Mutation-Boundary Census Summary

**An exact TypeScript-AST mutation census now blocks unclassified exports and guard-free demo product effects, with five uncovered provider/session boundaries closed before external or tenant mutation.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-26T19:04:44Z
- **Completed:** 2026-07-26T19:23:01Z
- **Tasks:** 2 completed
- **Files created/modified:** 6 implementation and test files

## Accomplishments

- Added an executable census over exported Server Actions, HTTP handlers, selected service/domain funnels, and company-scoped Inngest jobs.
- Enforced exact discovered-set/manifest equality, duplicate and stale row detection, canonical guard call evidence, reasoned exception authority, and a synthetic-unclassified regression case.
- Covered every planned shared-helper and research group, including admin actions whose filenames end in `actions.ts`, exported function expressions, OAuth cross-module funnels, provider callbacks, and maintenance jobs.
- Closed five real mutation gaps found by the census without changing normal-tenant behavior.
- Added AST-level ordering checks proving the new guards precede provider, database, token, and shared-counter effects.

## Task Commits

Each TDD gate was committed atomically:

1. **Task 1: RED — enumerate mutation boundaries and dispositions** — `254d59e9` (`test`)
2. **Task 2: GREEN — enforce the census and close uncovered effects** — `0a040e15` (`feat`)

## Files Created/Modified

- `tests/unit/demo/mutation-boundary-sweep.test.ts` — AST discovery, explicit manifest, exact equality, guard evidence, guard ordering, exception rationale, and synthetic drift checks.
- `app/api/stripe/connect/callback/route.ts` — denies demo context after trusted company resolution and before OAuth exchange, cookie consumption, or company update.
- `app/api/logout/route.ts` — limits sign-out to the current browser session for the shared demo account.
- `app/api/cron/cleanup-whatsapp-sessions/route.ts` — guards customer-facing WhatsApp expiry notifications while preserving machine-authorized retention deletion.
- `app/api/webhooks/twilio/route.ts` — signature-first company filtering prevents demo client consent and inbound-event mutations.
- `app/api/webhooks/whatsapp/route.ts` — trusted company denial now precedes rate-limit counters, deduplication, inbox logging, welcome sends, and processing dispatch.

## Decisions Made

- Used compiler AST nodes for discovery and call ordering instead of comment or source-text matching.
- Kept the manifest symbol-explicit even when many functions share one local guard helper. This makes an added export fail until deliberately classified.
- Required both authorization-code consumption and refresh-token rotation evidence for the OAuth token route because its two grants use different guarded funnels.
- Returned provider-success semantics when a signed Twilio message resolves only to demo companies, avoiding retry storms while producing no demo product effect.
- Kept unknown WhatsApp sender handling outside demo-company classification because no trusted tenant company has resolved at that branch.

## TDD Gate Compliance

- **RED:** `254d59e9` introduced the census scaffold; discovery and family coverage ran, while exact equality failed with the unclassified repository boundary set.
- **GREEN:** `0a040e15` completed the explicit manifest, added executable guard/rationale/order checks, and closed the five runtime gaps. The focused contract passed 7/7.
- **REFACTOR:** Not needed; helper builders keep the explicit manifest readable without weakening symbol-level drift detection.

## Verification

- `npx vitest run tests/unit/demo/mutation-boundary-sweep.test.ts --reporter=verbose` — passed (7/7).
- `npx vitest run tests/unit/demo` — passed (253/253 across 18 files).
- `npx tsc --noEmit -p tsconfig.ci.json` — passed with exit code 0.
- `git diff --check` — passed.
- Git history confirms RED `254d59e9` precedes GREEN `0a040e15`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Guarded Stripe Connect callback effects**
- **Found during:** Task 2 repository census
- **Issue:** An authenticated demo visitor could exchange a Stripe OAuth code and update company connection state.
- **Fix:** Applied `demoGuardResponse` after trusted company resolution and before cookie consumption, token exchange, provider lookup, or database update.
- **Files modified:** `app/api/stripe/connect/callback/route.ts`
- **Commit:** `0a040e15`

**2. [Rule 2 - Missing Critical Functionality] Guarded Twilio inbound tenant mutations**
- **Found during:** Task 2 repository census
- **Issue:** A valid signed Twilio callback could mutate demo-company client consent and insert message events.
- **Fix:** Filtered trusted matched client rows through `assertCompanyWritable` before consent or event writes, preserving signed-provider success responses.
- **Files modified:** `app/api/webhooks/twilio/route.ts`
- **Commit:** `0a040e15`

**3. [Rule 2 - Missing Critical Functionality] Guarded WhatsApp inbound product effects**
- **Found during:** Task 2 repository census
- **Issue:** A valid Meta callback could mutate shared rate-limit counters, dedup rows, inbox state, provider messages, and downstream processing for a demo company.
- **Fix:** Applied `assertCompanyWritable` immediately after trusted company resolution and moved rate limiting behind that guard.
- **Files modified:** `app/api/webhooks/whatsapp/route.ts`
- **Commit:** `0a040e15`

**4. [Rule 2 - Missing Critical Functionality] Isolated shared-demo logout**
- **Found during:** Task 2 repository census
- **Issue:** Default Supabase sign-out scope could revoke refresh tokens shared by other demo visitors.
- **Fix:** Set sign-out to `{ scope: 'local' }` and enforced it with an AST assertion.
- **Files modified:** `app/api/logout/route.ts`
- **Commit:** `0a040e15`

**5. [Rule 2 - Missing Critical Functionality] Separated cleanup authority from provider effect**
- **Found during:** Task 2 repository census
- **Issue:** The machine-authorized expired-session cleanup sent customer WhatsApp notifications for demo companies.
- **Fix:** Guarded the provider send/log with `assertCompanyWritable` while retaining platform-authorized expired-row deletion.
- **Files modified:** `app/api/cron/cleanup-whatsapp-sessions/route.ts`
- **Commit:** `0a040e15`

## Issues Encountered

- Targeted ESLint found a pre-existing unused `resolvedUserId` in the WhatsApp webhook. It is unrelated to this plan and is recorded in `deferred-items.md`; the required demo suite and strict typecheck gates pass.

## Authentication Gates

None.

## User Setup Required

None - no package install, provider call, remote database change, DNS change, deployment, push, or external mutation was performed.

## Known Stubs

None. The created/modified implementation and test files contain no goal-blocking TODO, FIXME, placeholder, coming-soon, or unavailable path.

## Next Phase Readiness

The repository now has a single focused command that rejects unclassified exports, missing guard evidence, stale classifications, and guard ordering regressions. Phase 180 browser-isolation work can use this census as its server-side authorization baseline.

## Self-Check: PASSED

Verified all six implementation/test artifacts and this summary exist, commits
`254d59e9` and `0a040e15` are reachable in RED-before-GREEN order, all required
test/typecheck gates pass, no goal-blocking stub or new threat surface was
introduced, and unrelated `app/globals.css` remains unstaged and untouched.

---
*Phase: 180-isolated-demo-session-read-only-foundation*
*Completed: 2026-07-26*
