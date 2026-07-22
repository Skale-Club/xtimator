---
phase: 176-end-customer-consent-optout-quiet-hours
plan: 04
subsystem: notifications
tags: [sms-compliance, consent, quiet-hours, tdd, branded-type, supabase]

# Dependency graph
requires:
  - phase: 176-01
    provides: "clients.sms_opted_out_at/sms_consent_status/state/phone columns"
  - phase: 176-03
    provides: "resolveRecipientZones() + isWithinQuietHours() pure quiet-hours guard"
provides:
  - "assertSendAllowed(companyId, clientId, channel) -> Promise<SendGateResult> — the single pre-send gate composing suppression -> consent -> quiet-hours"
  - "SendPermit branded type — opaque success token, no exported constructor besides the gate"
  - "isConsentSendable(status, unknownIsSendable?) — pure, independently-tested UNKNOWN_CONSENT_IS_SENDABLE wiring"
affects: ["177 (sendSms()/sendEmail() wrapper — MUST call this gate and type its recipient param as SendPermit)", "178 (agentic sendCustomerMessage())"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Branded/opaque return type (SendPermit) as a structural bypass guard — success can only be produced by the gate function itself, turning 'call the gate first' from a code-review convention into a TypeScript compile-time requirement for downstream callers"
    - "Pure flag-wiring helper (isConsentSendable) isolates a future legal/config flip (UNKNOWN_CONSENT_IS_SENDABLE) to one function, independently proven under test with an explicit flag-flip case, instead of an inline comparison"
    - "Never-throw, fail-closed DB read (mirrors lib/notifications/preferences.ts's try/catch + console.warn shape) — any read error or unexpected exception returns { allowed: false }, never throws to caller, never defaults to allowed: true"
    - "Cheapest/most-decisive check first, time-dependent check last — suppression (single column) and consent are checked before the timezone-resolution + quiet-hours work runs, so a blocked-for-other-reasons client never pays that cost and the companies-table fetch is skipped entirely when short-circuited"

key-files:
  created:
    - lib/notifications/customer-send-gate.ts
    - tests/unit/notifications/customer-send-gate.test.ts
  modified: []

key-decisions:
  - "companies.state fetched as a second query (not a Supabase embed join) — clients doesn't denormalize company state, and a second query keeps the mock/test shape identical to the clients query's .select().eq().maybeSingle() pattern"
  - "A companies-table read error is treated as non-fatal (companyState falls back to null and resolveRecipientZones() still tries the client-state/area-code tiers) rather than an immediate fail — only a genuinely unresolvable zone (all three tiers empty) produces 'unresolvable_timezone'; a clients-table read error or missing row is fail-closed via 'client_not_found', including for any unexpected exception (network failure, etc.) caught by the outer try/catch, per the plan's 'client_not_found or similar' guidance"
  - "Ordering-proof test asserts svc.companiesQuery.select was never called when suppression short-circuits (rather than mocking out resolveRecipientZones/isWithinQuietHours) — proves the REAL companies fetch + REAL quiet-hours evaluation never runs, a stronger proof than asserting a mocked pure function wasn't called"

patterns-established:
  - "Pattern: any function that returns a capability token as proof of a passed guard should brand the type and refuse to export any other way to construct it — reusable for future gates (e.g. an eventual email-send permit)"

requirements-completed: [CUST-03, CUST-04]

# Metrics
duration: 3min
completed: 2026-07-22
---

# Phase 176 Plan 04: Pre-Send Compliance Gate (assertSendAllowed) Summary

**`assertSendAllowed()` composes suppression -> consent -> quiet-hours against live DB state and returns a branded `SendPermit` on success — the one function Phase 177/178's actual SMS send primitives will require as a typed argument, making a bypass a compile error instead of a review convention.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-22T02:20:00Z (approx.)
- **Completed:** 2026-07-22T02:22:56Z
- **Tasks:** 1
- **Files modified:** 2 (both new)

## Accomplishments
- `isConsentSendable(status, unknownIsSendable?)` is the wired, independently-tested home for Operational Decision #2: `'granted'` always sendable, `'revoked'` NEVER overridden by the flag even when flipped, `'unknown'` returns the flag's value (proven by an explicit flag-flip test), any unexpected status fails closed.
- `assertSendAllowed(companyId, clientId, channel)` composes the full gate in the load-bearing order (client_not_found -> suppressed -> no_consent -> unresolvable_timezone -> quiet_hours -> allowed), reading LIVE `clients`/`companies` rows via `requireServiceClient()` on every call — no caching.
- The tenant-scope query proof (`.eq('id', clientId).eq('company_id', companyId)`) and the short-circuit ordering proof (a suppressed + would-fail-quiet-hours client returns `'suppressed'`, and the `companies` fetch never runs) are both explicit assertions, not incidental behavior.
- `SendPermit` is a branded, opaque success token — `{ __brand: 'SendPermit', clientId, channel, grantedAt }` — with no exported constructor besides `assertSendAllowed` itself, ready for Phase 177/178 to type their send-primitive's recipient parameter against.
- 16/16 planned test cases pass (7 `isConsentSendable` + 9 `assertSendAllowed`); `tsc -p tsconfig.ci.json --noEmit` is clean.

## Task Commits

TDD RED -> GREEN (no REFACTOR needed — GREEN was clean on first pass):

1. **Task 1 RED: failing tests for assertSendAllowed composition + isConsentSendable** — content committed, but see Deviations: a concurrent sibling process's broad commit (`8d359f76`, `docs(173): create phase plan`) swept up this staged file before this executor's own commit ran. The test file's content, history, and correctness are unaffected — it is fully tracked and was verified RED (`Failed to resolve import "@/lib/notifications/customer-send-gate"`) before that sibling commit landed.
2. **Task 1 GREEN: implement assertSendAllowed + SendPermit + isConsentSendable** - `24e4b989` (feat)

**Plan metadata:** (this commit) docs(176-04): complete pre-send compliance gate plan

## Files Created/Modified
- `lib/notifications/customer-send-gate.ts` - `assertSendAllowed()`, `SendPermit` type, `SendGateResult` interface, `isConsentSendable()`, `UNKNOWN_CONSENT_IS_SENDABLE`
- `tests/unit/notifications/customer-send-gate.test.ts` - 16 tests: 7 pure `isConsentSendable` cases (including both flag-flip proofs) + 9 `assertSendAllowed` composition cases (not-found, suppressed, no_consent x2, unresolvable_timezone, quiet_hours, allowed+permit shape, ordering short-circuit proof, tenant-scope query proof)

## Decisions Made
See `key-decisions` in frontmatter (companies-fetch error non-fatal fallback; second-query vs embed-join choice; ordering-proof assertion strategy).

## Deviations from Plan

### Auto-fixed Issues

None — the implementation matches the plan's interfaces block exactly (composition order, `SendGateResult`/`SendPermit` shapes, `isConsentSendable` semantics).

### Process deviation (concurrency, not a code deviation)

**1. RED-phase test commit absorbed into an unrelated sibling commit**
- **Found during:** Task 1, immediately after staging the RED test file
- **Issue:** `git add tests/unit/notifications/customer-send-gate.test.ts` staged the file correctly and the subsequent pathspec-scoped `git commit -- tests/unit/notifications/customer-send-gate.test.ts` was issued, but a concurrent sibling executor's own commit (`8d359f76 docs(173): create phase plan`, working on unrelated Phase 173 planning docs) landed in between and — per `git show --stat` — that commit's diff includes `tests/unit/notifications/customer-send-gate.test.ts` verbatim, meaning the sibling's commit operation picked up this executor's already-staged file. This executor's own `git commit` for the RED step then had nothing left to commit ("nothing added to commit but untracked files present").
- **Fix:** No code fix needed — the file's content is byte-identical to what was written and tested RED, is correctly tracked in git history (just under the sibling's commit hash/message instead of a dedicated `test(176-04): ...` commit), and the plan's actual behavioral requirement (RED before GREEN) was satisfied and verified via `npx vitest run` before any implementation code existed. The GREEN implementation commit (`24e4b989`) is clean and contains only `lib/notifications/customer-send-gate.ts`, verified via `git show --stat`.
- **Files modified:** None beyond the two files already listed.
- **Impact:** Cosmetic only — the RED test commit's message/attribution is `docs(173): create phase plan` instead of `test(176-04): ...`. No functional or correctness impact; documented here for traceability.

---

**Total deviations:** 0 code deviations; 1 process/concurrency note (commit attribution only, no functional impact).
**Impact on plan:** None on correctness or scope. All 16 must-have test cases pass exactly as specified.

## Issues Encountered
Sibling executor (176-05) was concurrently active in `app/api/webhooks/twilio/` per the concurrency warning — confirmed disjoint from this plan's files (`lib/notifications/customer-send-gate.ts`, `tests/unit/notifications/customer-send-gate.test.ts`) throughout; all `git add`/`git commit` calls were pathspec-scoped to this plan's exact files, and `git show --stat` was used to verify each commit's contents before moving on.

## User Setup Required
None - no external service configuration required. Pure application-layer module, no new dependencies.

## Next Phase Readiness

**Explicit Phase 177 prerequisite (per plan's `<output>` instruction):** `app/api/estimates/[id]/send-sms/route.ts` has ZERO consent/suppression check today (confirmed by direct code read in 176-RESEARCH.md) and is NOT migrated onto `assertSendAllowed()`/`SendPermit` by this plan. **Phase 177 MUST migrate this legacy route onto the gate** as part of building the new end-customer send path — it must not be left standing as a silent legacy exception to the "no send path may bypass the gate" invariant.

- `assertSendAllowed()` is fully unit-tested against a mocked service client and ready for Phase 177/178 to call directly.
- `SendPermit` is ready to be adopted as the typed recipient parameter on Phase 177's `sendSms()`/`sendEmail()` wrapper and Phase 178's agentic `sendCustomerMessage()`.
- 176-05's Twilio inbound webhook (concurrent sibling plan) is what will populate real `sms_opted_out_at`/`sms_consent_status` suppression data this gate reads — this plan's gate logic is independent of and already compatible with that data once it lands (same column names, same table).
- No blockers.

---
*Phase: 176-end-customer-consent-optout-quiet-hours*
*Completed: 2026-07-22*

## Self-Check: PASSED

Both files confirmed present on disk (`lib/notifications/customer-send-gate.ts`, `tests/unit/notifications/customer-send-gate.test.ts`). Implementation commit `24e4b989` confirmed in git log. RED test content confirmed present in git history via sibling commit `8d359f76` (see Deviations — concurrency, not a content issue).
