---
phase: 176-end-customer-consent-optout-quiet-hours
verified: 2026-07-22T02:32:12Z
status: passed
score: 13/13 phase-scoped must-have truths verified
re_verification:
  previous_status: none
  previous_score: n/a
verdict: >
  All five plans' deliverables are verified correct, substantive, wired, and
  test-backed. The consent/suppression MECHANISM (schema, signature+keyword
  primitives, timezone+quiet-hours guard, pre-send gate, inbound webhook) is
  complete and honors STOP/quiet-hours by construction. PASSED as the legal
  PREREQUISITE gate. IMPORTANT CAVEAT (not a Phase-176 defect): the literal
  CUST-03 wording "suppression check before EVERY send ... can never be
  messaged by any path — manual or agentic" is NOT yet globally enforced —
  the gate is intentionally not wired into any send path yet, and the legacy
  app/api/estimates/[id]/send-sms/route.ts still calls sendSms() with zero
  consent/suppression check. That enforcement-wiring is an explicitly recorded
  Phase-177 prerequisite. Until Phase 177 lands, a suppressed recipient CAN
  still be messaged via the un-migrated legacy manual path.
human_verification:
  - test: "Apply migration 20260721000003 to prod Supabase and verify schema"
    expected: "6 sms_* columns on clients + phone_normalized generated column + client_message_events table with RLS"
    why_human: "Deploy is CI->GHCR->Coolify; migrations applied manually per project convention — migration ships inert, no CI step runs it"
  - test: "Real Twilio STOP reply end-to-end"
    expected: "clients.sms_opted_out_at sets and client_message_events logs the event"
    why_human: "No live Twilio number/Messaging Service exists yet (Phase 177 provisions it); phase ships unit-tested against mocked/forged payloads only"
  - test: "Twilio Console 'A Message Comes In' URL byte-matches prod resolveBaseUrl(request) + '/api/webhooks/twilio'"
    expected: "Byte-exact match; else signature verification fails 100% silently"
    why_human: "Depends on live APP_ORIGIN/NEXT_PUBLIC_SITE_URL at deploy time, not testable in CI"
phase_177_prerequisites_confirmed:
  - "Legacy app/api/estimates/[id]/send-sms/route.ts must be migrated onto assertSendAllowed()/SendPermit (recorded in 176-04-SUMMARY, 176-04-PLAN <output>, VALIDATION.md)"
  - "SendPermit must be adopted as the typed recipient argument on Phase 177 sendCustomerMessage()/sendSms wrapper (recorded in 176-04-SUMMARY)"
hardening_recommendations:
  - "SendPermit brand is a string-literal (readonly __brand: 'SendPermit'), not a non-exported unique symbol — so the type is NOT strictly unconstructable outside the module: an external caller can satisfy it with a plain object literal. No exported factory leaks today (grep confirms SendPermit is referenced only in the gate + its test), so the guard holds by convention now, but when Phase 177 makes the permit load-bearing it should be upgraded to a unique-symbol brand for a true compile-time bypass guarantee."
---

# Phase 176: End-Customer Consent, Opt-Out & Quiet Hours — Verification Report

**Phase Goal:** Consent tracked/honored; no suppressed or out-of-hours send possible (CUST-03, CUST-04). This is the HARD LEGAL PREREQUISITE GATE before Phases 177/178.
**Verified:** 2026-07-22T02:32:12Z
**Status:** PASSED (phase-scoped deliverables) — with a load-bearing enforcement caveat deferred to Phase 177.
**Re-verification:** No — initial verification.

## Automated Gate Results (real, re-run)

| Check | Command | Result |
| ----- | ------- | ------ |
| Phase unit tests | `vitest run tests/unit/sms/ tests/unit/webhooks/twilio-inbound.test.ts tests/unit/notifications/{customer-send-gate,quiet-hours,timezone-derive}.test.ts` | **73 passed / 73** (7 files) |
| Scoped CI type-check | `tsc --noEmit -p tsconfig.ci.json` | **exit 0 (clean)** |
| Regression: WhatsApp + sms client (must stay green, untouched) | `vitest run tests/unit/whatsapp/ tests/unit/sms/client.test.ts` | **312 passed, 14 todo, 1 file skipped** — no regressions |

Test file breakdown (all green): `verify-webhook.test.ts`, `inbound-keywords.test.ts`, `timezone-derive.test.ts`, `quiet-hours.test.ts`, `customer-send-gate.test.ts`, `twilio-inbound.test.ts`, plus SMS dir. SUMMARY claims (22 + 16 + 16 + 14 = 68-ish) are consistent with the 73 observed.

## Goal Achievement — Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | `clients` carries consent state + suppression timestamp, independent of Twilio | ✓ VERIFIED | migration L44-51; 6 cols typed in database.types.ts L344-349 (Row/Insert/Update) |
| 2 | Inbound STOP/START/HELP recorded append-only, even when phone matches no client (never dropped) | ✓ VERIFIED | route L139-159 inserts a single `client_id:null, company_id:null` row when `matches.length===0`; test "unresolved-never-dropped" green |
| 3 | Suppression check is a single indexed read, not a scan | ✓ VERIFIED | partial index `idx_clients_sms_opted_out ... WHERE sms_opted_out_at IS NOT NULL` (migration L77); gate reads one column |
| 4 | Phone matched by normalized last-10 digits, not exact-string | ✓ VERIFIED | `phone_normalized` STORED generated col (migration L64-68); route L96-101 `.eq('phone_normalized', last10)` |
| 5 | Forged/tampered/missing signature always rejected | ✓ VERIFIED | verify-webhook.ts HMAC-SHA1; route L54-57 401+log; 6 signature tests green |
| 6 | Genuine signature always accepted | ✓ VERIFIED | independently-derived vector test green |
| 7 | Keyword classified into exactly one of stop/start/help/other, exact-match only (no NLP) | ✓ VERIFIED | inbound-keywords.ts exact Set membership after trim/strip/upper; "please STOP texting me" → other test green |
| 8 | Recipient timezone: state → area code → company state → fail-closed null | ✓ VERIFIED | timezone-derive.ts L125-153 three-tier + explicit `return null`; fail-closed test green |
| 9 | 7:59am/8:01pm blocked, 8:00am-7:59pm allowed | ✓ VERIFIED | quiet-hours.ts `hour>=8 && hour<20`; boundary tests (8pm exclusive, 8am inclusive) green |
| 10 | Split-timezone state evaluated most-restrictively (intersection) | ✓ VERIFIED | `zones.every(...)` L53; FL-style split-zone test green; DST via Intl (no hardcoded offset) test green |
| 11 | Suppressed client ALWAYS blocked regardless of consent/time | ✓ VERIFIED | gate L126-128 suppression checked FIRST; ordering short-circuit test proves companies fetch never runs |
| 12 | 'unknown' never silently sendable; flag provably gates it; 'revoked' never sendable | ✓ VERIFIED | isConsentSendable L74-82; both flag-flip proof tests green (unknown+true→sendable, revoked+true→still false) |
| 13 | STOP suppresses across ALL companies; START never manufactures consent; idempotent on MessageSid | ✓ VERIFIED | route L104-132 fan-out; START only restores 'granted' if prior 'revoked' (L125), 'unknown' stays 'unknown'; idempotency guard L80-87; all fan-out/idempotency tests green |

**Score:** 13/13 phase-scoped truths verified.

## CUST-03 Legal Guarantee Hand-Trace (as instructed)

**(a) Can any code path construct a SendPermit without passing through `assertSendAllowed`?**
- No exported factory/constructor other than the literal built inside `assertSendAllowed`'s success branch (customer-send-gate.ts L170-178). Grep confirms `SendPermit` is referenced ONLY in the gate module and its test — nothing else in the repo imports or produces one.
- CAVEAT (honest): the brand is `readonly __brand: 'SendPermit'` — a **string literal, not a unique symbol**. TypeScript structural typing therefore permits an external module to satisfy `SendPermit` with a hand-rolled object literal. The "cannot be constructed outside this module" comment overclaims. It does not matter yet (no send primitive consumes the permit — Phase 177), but should be upgraded to a symbol brand when the guard becomes load-bearing. Logged under `hardening_recommendations`.

**(b) STOP → suppression full loop:** webhook matches via `phone_normalized` last-10 (route L96-101) → fan-out `UPDATE ... sms_opted_out_at=now(), sms_consent_status='revoked'` per matched row across every company (L104-114) → gate reads `sms_opted_out_at` FIRST and returns `{allowed:false, reason:'suppressed'}` (customer-send-gate L126-128). Loop closed and verified end-to-end in code + tests.

**(c) START never manufactures consent:** route L124-129 — payload starts `{sms_opted_out_at:null}`; `sms_consent_status='granted'` set ONLY when `match.sms_consent_status==='revoked'`. An `'unknown'` row clears suppression but keeps `'unknown'`. Dedicated test asserts the update payload omits `sms_consent_status` for the unknown case. ✓

**(d) Unmatched inbound still logged:** route L139-158 — zero matches → one `client_message_events` row with `client_id:null, company_id:null, from_phone` set, keyword preserved. Never dropped. ✓

## CUST-04 Quiet-Hours Chain

- Fail-closed: `resolveRecipientZones` → `null` when no tier resolves → gate returns `'unresolvable_timezone'` (blocked); `isWithinQuietHours([])` → `false`. Both proven by tests. ✓
- DST/split-zone most-restrictive: per-zone `Intl.DateTimeFormat` (no hardcoded UTC offset) + `zones.every(...)` intersection. ✓
- Constants drive behavior: `QUIET_HOURS_START_HOUR=8` / `QUIET_HOURS_END_HOUR=20` are the sole comparison operands (quiet-hours.ts L54-55). ✓

## Webhook Security

| Property | Status | Evidence |
| -------- | ------ | -------- |
| HMAC-SHA1 (not SHA256) | ✓ | `createHmac('sha1', authToken)` verify-webhook.ts L35 |
| Signing URL via `resolveBaseUrl`, never `request.url` | ✓ | route L36; dedicated test uses `0.0.0.0:3000` request.url + mocked `resolveBaseUrl` and asserts the mocked value was used |
| Auth token from `platform_integrations`, no env in route | ✓ | grep `process.env` in route → **none**; `getTwilioConfig()` sources token via `getIntegrationKey('twilio')` (encrypted platform_integrations; dev-only env fallback per project convention) |
| 401 logged, never silent | ✓ | `console.warn` on both unconfigured (L43) and bad-signature (L55) branches; tests assert logging |
| Always-200 after auth (no retry-storm) | ✓ | mutation phase in try/catch returns 200 on error (L162-165); security boundary (steps 1-6) sits OUTSIDE the try so a forgery is always a hard 401 |

## Migration Correctness

| Requirement | Status | Evidence |
| ----------- | ------ | -------- |
| `phone_normalized` STORED generated + index | ✓ | L64-68 `GENERATED ALWAYS AS (...) STORED`; partial index L75 `WHERE phone_normalized <> ''` |
| `client_message_events` RLS | ✓ | `ENABLE ROW LEVEL SECURITY` L104 + SELECT-only company_members policy L111-112 (service-role writes bypass RLS) |
| `ON DELETE SET NULL` on both FKs | ✓ | company_id L88, client_id L89 both SET NULL (audit trail survives deletion) |
| Migration inert / idempotent | ✓ | `BEGIN`/`COMMIT`, `ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT EXISTS` throughout; not auto-applied (manual-apply convention documented in header) |
| CHECK constraints | ✓ | `sms_consent_status IN (granted,revoked,unknown)` L46; `keyword_type IN (stop,start,help,other)` L91 |
| types match migration; `phone_normalized` Row-only | ✓ | database.types.ts L342 Row-only (absent from Insert/Update — correct for a generated column) |

## Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
| ----------- | -------------- | ------ | -------- |
| CUST-03 — consent/suppression state + STOP honored + suppression check before EVERY send + no path (manual/agentic) can message a suppressed recipient | 176-01/02/04/05 | ⚠️ MECHANISM COMPLETE / ENFORCEMENT DEFERRED | Schema, inbound webhook, and pre-send gate all built & verified. BUT "before EVERY send / no path" is NOT yet true globally: the gate is wired into zero send paths, and legacy `send-sms/route.ts` L126 calls `sendSms()` with no gate. Enforcement is the recorded Phase-177 prerequisite. |
| CUST-04 — platform-wide quiet-hours guard | 176-03/04 | ⚠️ MECHANISM COMPLETE / ENFORCEMENT DEFERRED | `isWithinQuietHours` + `resolveRecipientZones` built, fail-closed, DST/split-zone correct, composed into the gate. Not yet enforced on any live send path (same Phase-177 wiring). |

Both requirements are correctly still marked **Pending** in REQUIREMENTS.md (L97-98) — consistent with mechanism-built-but-not-yet-enforced.

## Anti-Pattern Scan

| File | Finding | Severity |
| ---- | ------- | -------- |
| customer-send-gate.ts | `SendPermit` string-literal brand (soft brand, not unique-symbol) | ℹ️ Info / hardening for 177 |
| send-sms/route.ts (legacy, NOT a Phase-176 file) | Sends SMS with zero consent/suppression check — bypasses the new gate | 🛑 Blocker for the FULL CUST-03 wording, but out-of-scope for Phase 176 and explicitly recorded as a Phase-177 prerequisite |
| Phase-176 files (migration, lib/sms/*, lib/notifications/*, webhook route) | No TODO/FIXME/placeholder/stub; empty-array/null returns are all deliberate fail-closed or never-drop paths | none |

No stubs, no hollow artifacts, no orphaned code in Phase-176 deliverables. Every new module is imported/wired: primitives → webhook route; timezone/quiet-hours → gate.

## Residual Risks — confirmed honestly stated in SUMMARYs/runbook

- TOCTOU (benign): route L69-79 comment + migration COMMENT L98 + 176-05-SUMMARY. ✓
- Phone-format residual (<10-digit international/VOIP, shared last-10 across country codes): migration COMMENT L71 + route L91-97 + 176-05-SUMMARY. ✓
- Twilio Console URL byte-match: route header L20-25 + 176-05-SUMMARY "User Setup Required" + VALIDATION.md Manual-Only. ✓

## Gaps Summary

**No gaps against Phase 176's own scope** — all 13 must-have truths pass, all artifacts are substantive/wired/data-flowing, all key links verified, 73/73 tests green, tsc clean, no regressions.

**The single thing that must not be lost between phases:** Phase 176 delivers the *mechanism* to honor consent/quiet-hours, not global *enforcement*. Today, a suppressed or out-of-hours SMS is still physically possible via the un-gated legacy `app/api/estimates/[id]/send-sms/route.ts`. The full CUST-03/CUST-04 legal invariant only closes when Phase 177 (1) routes every send path (including that legacy route) through `assertSendAllowed()`, and (2) adopts (and preferably symbol-hardens) `SendPermit` as the typed send argument. Both are explicitly recorded prerequisites — verified present in 176-04-SUMMARY, 176-04-PLAN, and 176-VALIDATION.md.

---

_Verified: 2026-07-22T02:32:12Z_
_Verifier: Claude (gsd-verifier)_
