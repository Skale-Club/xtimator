---
phase: 178-agentic-send
plan: 01
subsystem: notifications
tags: [supabase, rls, sha256, rate-limit, tdd, whatsapp, mcp, state-machine]

# Dependency graph
requires:
  - phase: 177-customer-messaging
    provides: customer-send-gate.ts (SendChannel, assertSendAllowed), customer-send.ts (TriggerSource, sendCustomerMessage)
provides:
  - agentic_send_confirmations table (durable confirmation state machine, service-role only)
  - lib/notifications/agentic-send-confirm.ts (create/resolve/claim/cancel/refuse, hash-binding integrity check, multilingual confirm/cancel classifier, gate-refusal explainer, fail-closed rate limit wrapper)
  - agenticSendPerCompanyPerDay rate-limit config entry (lib/ratelimit.ts)
affects: [178-02 (draft/confirm/cancel orchestrator), 178-03 (WhatsApp turn-taking), 178-04 (MCP token round-trip)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLAIM-BEFORE-DISPATCH: atomic conditional UPDATE (WHERE id=? AND status='pending', .select() to detect a matched row) as the sole safe way to transition a shared pending resource under concurrent callers -- no read-then-write race window."
    - "FAIL-CLOSED rate limit wrapper: a real-money/irreversible-action limiter deliberately inverts lib/ratelimit.ts's project-wide fail-OPEN default, detected via the rateLimit() count:0 fail-open sentinel plus an explicit isRedisAvailable() pre-check."
    - "Never-throw DB reads: every exported resolver wraps its full body in try/catch and resolves a safe fallback (null) on any failure, including a mock/client missing an expected chained method -- makes it safe to call unconditionally from a hot path without touching that path's existing test mocks."

key-files:
  created:
    - supabase/migrations/20260721000005_phase178_agentic_send_confirmations.sql
    - lib/notifications/agentic-send-confirm.ts
    - tests/unit/notifications/agentic-send-confirm.test.ts
  modified:
    - lib/ratelimit.ts

key-decisions:
  - "CLAIM-BEFORE-DISPATCH (plan-checker correction, adopted): markConfirmed is an atomic conditional claim -- UPDATE ... SET status='confirmed' WHERE id=? AND status='pending', returning the row via .select(); claim succeeded iff a row came back. Return type changed from the plan's Promise<void> to Promise<boolean> so 178-02's finalize flow can gate dispatch on the claim result. markCancelled/markRefused stay Promise<void> (single .eq('id', id), never conditioned on prior status) -- the correction was scoped to markConfirmed only, the one primitive that gates an irreversible send."
  - "FAIL-CLOSED rate limit (ratified decision, adopted): checkAgenticSendRateLimit returns false when Redis is unconfigured (isRedisAvailable() check, short-circuits before calling rateLimit()) or when rateLimit() itself fails open internally after a transient Redis error (detected via its count:0 sentinel -- a real evaluated request always has count >= 1 since INCR runs first). Every other limit in lib/ratelimit.ts fails OPEN; this one is inverted because agentic sends are real-money, irreversible dispatches to a third party with no second gate to bound a false ALLOW, whereas the per-send owner confirmation gate already bounds the UX cost of an occasional false BLOCK."
  - "resolvePendingByChannelRef adds .order('created_at', {ascending:false}).limit(1) (INFO item, adopted) instead of a single-row lookup -- owner_phone has no UNIQUE constraint (unlike token), so this is multi-pending safe: if an owner somehow has more than one pending draft, the newest wins. resolveByToken keeps a single .maybeSingle() lookup since token IS UNIQUE at the schema level."
  - "Migration numbered 20260721000005 -- verified on disk that 000001-000004 were already taken by Phases 172/175/176/177 before creating it."
  - "computeBodyHash joins fields as `${length}:${value}` per field, separated by '|', rather than a bare concatenation -- prevents a different (clientId, channel, subject, body) tuple from re-partitioning into an identical hash input."

requirements-completed: [AGENT-01, AGENT-02, AGENT-03]

duration: ~20min
completed: 2026-07-22
---

# Phase 178 Plan 01: Agentic Send Confirmation State Machine Summary

**`agentic_send_confirmations` table + `lib/notifications/agentic-send-confirm.ts`: a durable, hash-bound, never-throw-on-read confirmation state machine with an atomic claim-before-dispatch primitive and a fail-closed per-company rate limit, fully unit-tested (61 tests).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T00:12:00Z (approx, first task commit 00:13:19-04:00)
- **Completed:** 2026-07-22T04:19:29Z (00:19:29-04:00)
- **Tasks:** 2 (Task 2 executed as TDD: RED then GREEN)
- **Files modified:** 4 (1 migration created, 1 module created, 1 test file created, 1 existing file edited)

## Accomplishments
- `agentic_send_confirmations` table: service-role-only confirmation ledger with a CHECK constraint enforcing exactly one channel binding (`owner_phone` XOR `token`) per `trigger_source`.
- `lib/notifications/agentic-send-confirm.ts`: hash-bound create/resolve/claim/cancel/refuse state machine, a pure multilingual (en/pt/es) confirm/cancel classifier, a non-silent gate-refusal explainer, and a fail-closed per-company rate limit wrapper.
- CLAIM-BEFORE-DISPATCH: `markConfirmed` is now an atomic conditional claim (not a plain status write) -- proven under a simulated concurrent race where exactly one of two simultaneous claims on the same pending row wins.
- FAIL-CLOSED rate limiting: `checkAgenticSendRateLimit` blocks (rather than allows) agentic sends when Redis is unconfigured or errors, a deliberate inversion of every other limit in `lib/ratelimit.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration + rate-limit config** - `0e055a62` (feat)
2. **Task 2 RED: failing tests for agentic-send-confirm** - `c0447e5b` (test)
3. **Task 2 GREEN: agentic-send-confirm implementation** - `33fdce9c` (feat)

_TDD task: RED (failing tests, module didn't exist) then GREEN (implementation, all 61 tests pass). No REFACTOR commit needed -- implementation was clean on first pass except one test-isolation fix folded into the GREEN commit (see Deviations)._

## Files Created/Modified
- `supabase/migrations/20260721000005_phase178_agentic_send_confirmations.sql` - Confirmation state-machine table, idempotent, NOT applied to remote (manual-apply project convention).
- `lib/ratelimit.ts` - Added `agenticSendPerCompanyPerDay` to `LimitName` union and `limits` config (max 10, window 86400).
- `lib/notifications/agentic-send-confirm.ts` - The state machine module (see key-decisions for the two adopted corrections).
- `tests/unit/notifications/agentic-send-confirm.test.ts` - 61 tests: pure functions (hash, binding verification, classifier, explainer) with zero mocks; DB-backed functions against hand-built `SupabaseClient` mocks; a concurrent-claim race test; both rate-limit fail-closed modes.

## Decisions Made
See `key-decisions` in frontmatter for the two adopted plan-checker corrections (CLAIM-BEFORE-DISPATCH, FAIL-CLOSED rate limit) and the three adopted INFO items (order/limit multi-pending safety, migration numbering verified on disk, config-driven rate-limit value).

## Deviations from Plan

### Adopted Corrections (pre-authorized, not autonomous Rule 1-3 fixes)

**1. [Plan-checker correction 1] markConfirmed is an atomic conditional claim, not a plain status write**
- **Found during:** Task 2 (plan interfaces specified `markConfirmed(...): Promise<void>`)
- **Issue:** A plain `UPDATE ... WHERE id = ?` status write has a read-then-write race: two callers could both read "pending" and both proceed to dispatch, double-sending a real message.
- **Fix:** `markConfirmed` now issues `UPDATE ... SET status='confirmed' WHERE id=? AND status='pending'` (both conditions in the WHERE clause via chained `.eq()`), returns the affected row via `.select('id')`, and resolves `Promise<boolean>` (claim succeeded iff a row came back) instead of `Promise<void>`.
- **Files modified:** lib/notifications/agentic-send-confirm.ts, tests/unit/notifications/agentic-send-confirm.test.ts
- **Verification:** New test "two concurrent claims on the same pending row -> exactly one wins" (`Promise.all` of two `markConfirmed` calls against a synchronous compare-and-swap mock) passes; the mock's check-and-flip happens the instant `.select()` is invoked (before either call awaits), correctly modeling DB-level atomicity under JS's run-to-first-await semantics.
- **Committed in:** 33fdce9c (Task 2 GREEN commit)

**2. [Plan-checker correction 2] checkAgenticSendRateLimit fails CLOSED, not open**
- **Found during:** Task 2 (plan interfaces described `rateLimit()`'s existing fail-open posture as the model to follow)
- **Issue:** Every other limit in `lib/ratelimit.ts` fails open (allows the request) when Redis is unavailable -- correct for those (internal cost controls with other backstops), wrong for agentic sends (irreversible real-money dispatches to a third party with no other backstop besides the per-send owner confirmation, which only bounds the cost of a false BLOCK, not a false ALLOW).
- **Fix:** `checkAgenticSendRateLimit` calls `isRedisAvailable()` first and returns `false` immediately if Redis isn't configured (never even calls `rateLimit()`). If Redis is configured but `rateLimit()` still fails open internally (e.g. a transient error after the availability check passed), the wrapper detects this via `rateLimit()`'s own `count: 0` sentinel (a real evaluated request always has `count >= 1`, since INCR runs before the max comparison) and returns `false` there too.
- **Files modified:** lib/notifications/agentic-send-confirm.ts, tests/unit/notifications/agentic-send-confirm.test.ts
- **Verification:** Two dedicated tests -- "Redis unconfigured -> false (never calls rateLimit)" and "Redis errors mid-request (count:0) -> false" -- both pass, alongside pass-through tests for the genuine allow/block cases.
- **Committed in:** 33fdce9c (Task 2 GREEN commit)

### Auto-fixed Issues

**3. [Rule 1 - Bug] Test-isolation fix: global `afterEach` cleared call history, not just spy implementations**
- **Found during:** Task 2 GREEN, first test run (60/61 passed; "Redis unconfigured -> never calls rateLimit" failed because a prior test's `mockRateLimit` calls were still in its call history)
- **Issue:** `afterEach(() => vi.restoreAllMocks())` restores `vi.spyOn` originals but does not clear `vi.fn()` mock call history created by `vi.mock(...)` factories -- `mockRateLimit`'s call count leaked across tests within the same describe block.
- **Fix:** Changed the global `afterEach` to `vi.clearAllMocks(); vi.restoreAllMocks()`.
- **Files modified:** tests/unit/notifications/agentic-send-confirm.test.ts
- **Verification:** Re-ran the suite -- 61/61 pass.
- **Committed in:** 33fdce9c (folded into the Task 2 GREEN commit, since it was found and fixed before that commit was made)

---

**Total deviations:** 2 pre-authorized plan-checker corrections (adopted per execution instructions) + 1 auto-fixed test-isolation bug (Rule 1).
**Impact on plan:** No scope creep -- both corrections were explicitly pre-authorized to override the plan's literal text, and the test-isolation fix is confined to the new test file.

## Issues Encountered
- A `Write` tool call embedded an actual NUL byte in `lib/notifications/agentic-send-confirm.ts`: the file content originally used a JSON-escaped ` ` delimiter inside `computeBodyHash`'s doc comment/implementation, which the tool's JSON parameter parsing decoded into a real null character in the emitted file (confirmed via `grep` reporting "binary file matches" and a Node.js byte-offset check). Resolved by removing the file and rewriting `computeBodyHash` to join fields as `${length}:${value}` separated by `|` instead of any null/escape-sequence delimiter -- functionally equivalent collision-avoidance, no escape-sequence risk. No production impact (caught before any commit).

## User Setup Required
None - no external service configuration required. Note: the migration is NOT applied to the remote database by this plan (project convention: migrations are applied manually). It must be applied by hand before Plan 178-02's code path can write real rows.

## Next Phase Readiness
- `lib/notifications/agentic-send-confirm.ts` exposes the exact function signatures Plan 178-02 (draft/confirm/cancel orchestrator), 178-03 (WhatsApp turn-taking), and 178-04 (MCP token round-trip) bind to, with one intentional signature change from the original plan interfaces: `markConfirmed` returns `Promise<boolean>` (claim success), not `Promise<void>` -- 178-02's finalize flow should treat a `false` return as "someone else already claimed or cancelled this row" and refuse to dispatch, not retry the write.
- The `agentic_send_confirmations` migration must be applied to the remote database by hand before 178-02 can create real rows (ships inert otherwise, per this repo's manual-migration convention).
- No blockers identified for 178-02/178-03/178-04.

---
*Phase: 178-agentic-send*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: supabase/migrations/20260721000005_phase178_agentic_send_confirmations.sql
- FOUND: lib/notifications/agentic-send-confirm.ts
- FOUND: tests/unit/notifications/agentic-send-confirm.test.ts
- FOUND commit: 0e055a62
- FOUND commit: c0447e5b
- FOUND commit: 33fdce9c
