---
phase: 177-end-customer-send-path
plan: 03
subsystem: notifications
tags: [twilio, sms, platform-config, admin-panel, server-actions]

# Dependency graph
requires:
  - phase: 104-notifications-foundation
    provides: sendSms() / getTwilioConfig() proven Twilio REST-over-fetch pattern this plan mirrors
provides:
  - "getTwilioCustomerMessagingConfig(): reads metadata.customer_messaging_service_sid from the twilio platform_integrations row"
  - "sendCustomerSms(to, body): dispatches end-customer SMS via a dedicated Twilio Messaging Service SID, refuses (no fetch) when unconfigured"
  - "Admin panel field (SMS category) to set/clear the dedicated Messaging Service SID"
affects: [178-customer-send-funnel, sendCustomerMessage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-identity Twilio config: getTwilioConfig() (shared owner fromPhone) vs getTwilioCustomerMessagingConfig() (dedicated MessagingServiceSid) as structurally separate sibling readers of the same encrypted 'twilio' key, never cross-falling-back"
    - "@internal doc-comment convention marking a low-level send primitive as funnel-restricted (sendCustomerSms -> must route through sendCustomerMessage() in Phase 178)"

key-files:
  created:
    - app/admin/integrations/twilio-customer-messaging-form.tsx
  modified:
    - lib/platform-config.ts
    - lib/sms/client.ts
    - tests/unit/sms/client.test.ts
    - app/admin/integrations/actions.ts
    - app/admin/integrations/integration-category-content.tsx
    - lib/admin/integrations-providers.ts

key-decisions:
  - "sendCustomerSms() unconfigured path returns before any fetch call — proven at the unit-test level via a fetchMock.not.toHaveBeenCalled() assertion, making the 'never falls back to the shared number' guarantee testable, not just documented."
  - "Twilio Messaging Service SID validated with /^MG[0-9a-fA-F]{32}$/, empty string allowed to clear (mirrors saveTelegramChatId's empty-allowed pattern) so the operator can disable end-customer SMS from the panel without deleting the whole twilio integration row."

patterns-established:
  - "Pattern: sibling platform-config readers reading the SAME encrypted key + DIFFERENT metadata field, each with its own null contract (see getTwilioConfig vs getTwilioCustomerMessagingConfig)."

requirements-completed: [CUST-02]

# Metrics
duration: 6min
completed: 2026-07-22
---

# Phase 177 Plan 03: Dedicated Customer Messaging Service Summary

**`sendCustomerSms()` dispatches end-customer SMS via a dedicated Twilio Messaging Service SID (never the shared owner `fromPhone`), refusing to send with zero fetch calls when unconfigured — configurable only from `/admin/integrations` -> SMS, never an env var.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-22T03:05:00Z (approx, first commit 2026-07-22T03:05:50Z)
- **Completed:** 2026-07-22T03:11:00Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments
- `getTwilioCustomerMessagingConfig()` added to `lib/platform-config.ts`, reading `metadata.customer_messaging_service_sid` (a field distinct from `from_phone`) from the same `twilio` `platform_integrations` row, returning `null` when unset.
- `sendCustomerSms(to, body)` added to `lib/sms/client.ts` as a structurally separate sibling of `sendSms()`: dispatches with `MessagingServiceSid` (never `From`), and refuses to send — no fetch call at all — when the dedicated Messaging Service is unconfigured.
- Admin panel: new `TwilioCustomerMessagingForm` field under SMS -> Twilio, backed by `saveTwilioCustomerMessagingServiceSid()` server action (validates `MG` + 32 hex, preserves existing encrypted ciphertext, empty allowed to clear).
- 5 new unit tests added to `tests/unit/sms/client.test.ts` proving: correct POST body shape (`MessagingServiceSid=`/`To=`/`Body=`, no `From=`), success path, the no-fetch-when-unconfigured safety property, and never-throw on rejected/non-ok fetch. All 5 pre-existing `sendSms()` tests still pass (regression-clean).

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing sendCustomerSms tests** - `e5d1ddc3` (test)
2. **Task 1 GREEN: getTwilioCustomerMessagingConfig() + sendCustomerSms()** - captured in concurrent commit `f77f2132` (see Deviations — a sibling 177-02 executor's commit picked up my staged changes due to shared git index; content verified present and correct)
3. **Task 2: admin panel field** - `9295a1f1` (feat) — note this commit also includes files from sibling executors (see Deviations); my task-2 changes are the `app/admin/integrations/*` and `lib/admin/integrations-providers.ts` files

**Plan metadata:** this commit (docs: complete 177-03 plan)

_Note: TDD Task 1 used the standard RED->GREEN flow; REFACTOR was not needed (implementation was minimal and clean on first pass)._

## Files Created/Modified
- `lib/platform-config.ts` - Added `TwilioCustomerMessagingConfig` type + `getTwilioCustomerMessagingConfig()`, mirroring `getTwilioConfig()`'s shape but reading `metadata.customer_messaging_service_sid`
- `lib/sms/client.ts` - Added `sendCustomerSms(to, body)`, dispatching via `MessagingServiceSid`; carries the `@internal` doc-comment directing future callers to `sendCustomerMessage()` (Phase 178)
- `tests/unit/sms/client.test.ts` - New `describe('lib/sms/client — sendCustomerSms()')` block, 5 tests
- `app/admin/integrations/actions.ts` - Added `saveTwilioCustomerMessagingServiceSid()` server action
- `app/admin/integrations/twilio-customer-messaging-form.tsx` - New admin form field (plain `Input`, copies `xphere-config-form.tsx` structure)
- `app/admin/integrations/integration-category-content.tsx` - Fetches `customer_messaging_service_sid` alongside `from_phone` in the same query; renders `TwilioCustomerMessagingForm` under the existing `showFromPhone` gate
- `lib/admin/integrations-providers.ts` - SMS category description updated to mention both sending identities

## Decisions Made
- Kept `sendCustomerSms()` in the same file as `sendSms()` (not a new file) per the plan's explicit interface spec — same never-throw shape, same REST-over-fetch convention, easiest to audit side-by-side that neither ever references the other's identity field.
- Did not add a dedicated `getTwilioCustomerMessagingConfig()` unit test file, per the plan's explicit instruction — its behavior is proven indirectly through the `sendCustomerSms()` mocked-module tests, consistent with `getTwilioConfig()` having no dedicated test either.

## Deviations from Plan

### Concurrency: sibling executors' commits captured my staged changes

This session ran with 4 sibling 177-phase executors plus a 174-04 executor active **in the same working directory** (no worktree isolation — consistent with the known Windows MAX_PATH constraint). Git's staging index is a single shared mutable resource across all of them. Twice during this plan, a concurrent executor's `git commit` (likely `git commit -a` or a broad `git add`) ran between my `git add <my-files>` and my own `git commit`, and absorbed my already-staged changes into their commit:

1. **Task 1 GREEN** (`lib/platform-config.ts`, `lib/sms/client.ts`): my `git commit` reported nothing-to-commit; `git log -- lib/sms/client.ts` showed the changes landed inside a sibling commit `f77f2132` ("feat(177-02): customer_messages audit table migration + types"). Verified: content is correct and complete (`grep` confirms `sendCustomerSms`/`getTwilioCustomerMessagingConfig` present, tests pass, tsc clean).
2. **Task 2** (`app/admin/integrations/actions.ts`, `integration-category-content.tsx`, `twilio-customer-messaging-form.tsx`, `lib/admin/integrations-providers.ts`): my commit `9295a1f1` succeeded but also pulled in 3 files I did not stage — two sibling `-SUMMARY.md` files and one sibling test file — that were sitting staged/untracked in the shared index at commit time.

No content was lost or corrupted in either case — every file I intended to change is present, correct, and verified (tests + tsc). The only issue is commit-message attribution: some of my work is recorded under sibling commit messages, and one of my commits carries extra files not authored by this plan. Per instructions (no destructive git operations, no force-push, do not push), I did not attempt to rewrite history to "fix" this — doing so against a live, shared, multi-executor index would risk far worse damage than the cosmetic misattribution. Flagging this for the orchestrator: **future concurrent GSD runs in this environment need either worktree isolation restored (once the path-length issue is solved) or a locking/serialization mechanism around git add+commit**, since pathspec-scoping `git add` alone does not protect `git commit` from picking up other processes' concurrently-staged files.

**Total deviations:** 1 (concurrency/tooling, not a code defect)
**Impact on plan:** None on functional correctness — all CUST-02 code is present, tested, and type-checked. Impact is limited to commit-history attribution/cleanliness.

## Issues Encountered
None beyond the concurrency note above.

## User Setup Required

**Operational gate — no code action required, but real end-customer SMS cannot send until this is done:**

1. In the Twilio Console, provision a new **Messaging Service** dedicated to end-customer SMS (separate from the existing shared owner-notification number). Enable **Advanced Opt-Out** on it.
2. Copy its SID (`MG` + 32 hex characters) into `/admin/integrations` -> SMS -> "Customer Messaging Service" -> save.
3. Until step 2 is done, `getTwilioCustomerMessagingConfig()` returns `null` and `sendCustomerSms()` correctly and safely returns `{ ok: false, error: 'messaging_service_unconfigured' }` without ever calling fetch or falling back to the shared number.

No environment variables involved — this is a DB-only (`platform_integrations`), admin-panel-managed value, consistent with every other platform integration in this codebase.

## Next Phase Readiness
- The CUST-02 send primitive (`sendCustomerSms`) is ready for Phase 178 to wire behind a single funnel (`sendCustomerMessage()`), which is the ONLY sanctioned caller per the `@internal` doc-comment now on `sendCustomerSms()`.
- The dedicated-identity safety property (unconfigured -> refuse, never reroute) is unit-test-proven, so Phase 178's funnel can rely on it without re-verifying at that layer.
- Real end-customer SMS sending remains dormant until the operator provisions the Messaging Service SID per "User Setup Required" above.

---
*Phase: 177-end-customer-send-path*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: lib/platform-config.ts
- FOUND: lib/sms/client.ts
- FOUND: app/admin/integrations/twilio-customer-messaging-form.tsx
- FOUND: app/admin/integrations/actions.ts
- FOUND: tests/unit/sms/client.test.ts
- FOUND: `saveTwilioCustomerMessagingServiceSid` in actions.ts
- FOUND: `getTwilioCustomerMessagingConfig` in platform-config.ts
- FOUND: commit e5d1ddc3 (RED)
- FOUND: commit f77f2132 (GREEN, captured by sibling executor — see Deviations)
- FOUND: commit 9295a1f1 (Task 2)
