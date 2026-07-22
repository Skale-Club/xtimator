---
phase: 176-end-customer-consent-optout-quiet-hours
plan: 02
subsystem: sms
tags: [twilio, hmac-sha1, webhook-verification, keyword-classification, sms-opt-out]

# Dependency graph
requires: []
provides:
  - "lib/sms/verify-webhook.ts — verifyTwilioSignature(url, params, signature, authToken): boolean (HMAC-SHA1 over URL + sorted POST params, distinct from lib/whatsapp/verify.ts's HMAC-SHA256-over-raw-body)"
  - "lib/sms/inbound-keywords.ts — classifyInboundKeyword(body): 'stop' | 'start' | 'help' | 'other' (exact-match-after-normalize against Twilio's default keyword set)"
affects: ["176-05 (Twilio inbound webhook route — wires both primitives before any DB write)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Twilio webhook signature verification: HMAC-SHA1 over (URL + alphabetically-sorted key+value POST params concatenation), timing-safe compare, try/catch around timingSafeEqual for length-mismatch"
    - "Keyword classification: trim -> strip trailing punctuation -> uppercase -> exact Set membership (no substring/regex-contains/NLP matching)"

key-files:
  created:
    - lib/sms/verify-webhook.ts
    - lib/sms/inbound-keywords.ts
    - tests/unit/sms/verify-webhook.test.ts
    - tests/unit/sms/inbound-keywords.test.ts
  modified: []

key-decisions:
  - "Independently re-derived the plan's HMAC-SHA1 test vector via node -e crypto.createHmac before trusting it — confirmed eCuyHtyg3a75b82UK9L9Gj7IcfQ= is ground truth for the algorithm, not just self-consistent with this implementation"
  - "Did not import or adapt lib/whatsapp/verify.ts — Twilio's signing construction (URL + sorted params) is fundamentally different from Meta's (raw-body HMAC-SHA256), so building parallel/independent code avoids Pitfall B (silently wrong algorithm reuse)"

patterns-established:
  - "Pattern: pure, zero-I/O signature/classification primitives live in lib/sms/*.ts and are unit-tested in isolation before any route consumes them"

requirements-completed: [CUST-03]

# Metrics
duration: 6min
completed: 2026-07-22
---

# Phase 176 Plan 02: Twilio Webhook Signature Verification + Inbound Keyword Classification Summary

**HMAC-SHA1 Twilio webhook signature verification (URL + sorted-params construction) and exact-match STOP/START/HELP keyword classifier, both pure and fully unit-tested ahead of the 176-05 route.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-22T02:11:00Z (approx.)
- **Completed:** 2026-07-22T02:14:05Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- `verifyTwilioSignature()` correctly implements Twilio's HMAC-SHA1-over-(URL + sorted-key-value-concat) algorithm, independently verified against a self-derived test vector, not the WhatsApp HMAC-SHA256-over-raw-body pattern
- `classifyInboundKeyword()` performs exact-match-after-normalize classification against Twilio's literal default keyword set — never fuzzy/NLP/substring matching, so a sentence like "please STOP texting me" correctly resolves to `'other'` rather than falsely triggering suppression
- Both primitives are pure functions (no DB/network access), fully unit-tested (22 tests total), ready for 176-05 to wire into the actual webhook route

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: verifyTwilioSignature (TDD)**
   - `9233b9eb` test(176-02): add failing test for verifyTwilioSignature (HMAC-SHA1)
   - `973ef4d7` feat(176-02): implement verifyTwilioSignature (HMAC-SHA1)
2. **Task 2: classifyInboundKeyword (TDD)**
   - `df6bac1e` test(176-02): add failing test for classifyInboundKeyword
   - `13534672` feat(176-02): implement classifyInboundKeyword (Twilio default keyword set)

**Plan metadata:** (this commit) docs(176-02): complete Twilio webhook primitives plan

_No REFACTOR commits were needed — both GREEN implementations passed cleanly on first attempt._

## Files Created/Modified
- `lib/sms/verify-webhook.ts` - `verifyTwilioSignature(url, params, signature, authToken)`: HMAC-SHA1 over URL + alphabetically-sorted `key+value` POST param concatenation, base64-encoded, timing-safe compared against the `X-Twilio-Signature` header; catches `timingSafeEqual`'s length-mismatch throw
- `lib/sms/inbound-keywords.ts` - `classifyInboundKeyword(body)`: trims whitespace, strips trailing `.`/`!`/`?`/`,`, uppercases, then exact-matches against Twilio's stop/start/help keyword Sets; anything else (including sentence-embedded keywords) returns `'other'`
- `tests/unit/sms/verify-webhook.test.ts` - 6 tests: valid vector, tampered param, mangled signature, null signature, invalid-base64/wrong-length signature, out-of-order params still verify
- `tests/unit/sms/inbound-keywords.test.ts` - 16 tests: all 8 stop-class keywords (upper/lower/mixed case), all 3 start-class keywords, HELP, trailing-punctuation normalization, sentence-embedded rejection, empty/whitespace, unrelated text

## Decisions Made
- Independently re-derived the plan's test vector with `node -e` against Node's own `crypto.createHmac('sha1', ...)` before writing the implementation, confirming it's ground truth for the algorithm (per plan instructions) rather than trusting it blindly
- Built the SHA1/sorted-params construction from scratch rather than adapting `lib/whatsapp/verify.ts` (SHA256/raw-body) — the two algorithms share no reusable logic beyond the `timingSafeEqual` try/catch pattern

## Deviations from Plan

None - plan executed exactly as written. All 6 verify-webhook test cases and all 7 inbound-keywords test groups (16 individual assertions covering every keyword in every case-variant) implemented as specified; `npx tsc -p tsconfig.ci.json --noEmit` clean after each task.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Both modules are pure functions with no environment dependencies.

## Next Phase Readiness
- `verifyTwilioSignature` and `classifyInboundKeyword` are ready for 176-05 (Twilio inbound webhook route) to import and wire in directly: signature check before any DB write, keyword classification to decide stop/start/help/other handling
- No blockers. Both primitives were built and fully tested without needing the route to exist, per this plan's design (safe to run in parallel with 176-01/176-03)

---
*Phase: 176-end-customer-consent-optout-quiet-hours*
*Completed: 2026-07-22*

## Self-Check: PASSED

All 5 created files confirmed present on disk; all 4 task commit hashes (9233b9eb, 973ef4d7, df6bac1e, 13534672) confirmed in git log.
