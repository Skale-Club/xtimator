# Phase 46: Typed Error Handling Foundation — SUMMARY

**Status:** ✅ COMPLETE (2026-05-11)
**Milestone:** v2.1 WhatsApp Launch-Readiness
**Seed harvested:** SEED-014

## What was built

Foundational typed error system used by all subsequent v2.1 phases. Replaces ad-hoc try/catch + "Something went wrong" generic responses with structured errors that carry HTTP status, user-facing message, and contextual metadata.

### Files created

- `lib/errors/codes.ts` — `ErrorType` + `Surface` type unions, status map, default + per-code message maps
- `lib/errors/index.ts` — `XtimatorError` class, `asResponse()` for HTTP routes, helper functions (`throwIfNotFound`, `throwIfForbidden`, `throwIfBadRequest`, `asInternal`)
- `lib/errors/whatsapp.ts` — `handleWhatsAppError()` adapter for sending contextual error messages via WhatsApp instead of JSON
- `tests/unit/errors/errors.test.ts` — 17 tests covering the class, response transformation, ZodError, helpers
- `tests/unit/errors/whatsapp-adapter.test.ts` — 7 tests covering WhatsApp adapter behavior

## Key design decisions

- **Composite codes** `${type}:${surface}` — e.g. `tier_limit:estimates`. Allows targeted user messages per concern (UX) without exploding the type/surface enums (clean code).
- **`logOnly` flag for internal errors** — internal errors return generic message to user (no info leakage) but log full stack server-side.
- **`asResponse()` handles three input types** — `XtimatorError` (typed), `ZodError` (validation), unknown (fallback to 500). Single wrapper at route handler edge.
- **`handleWhatsAppError()` never throws** — failures to deliver the error message are swallowed and logged. Don't compound errors in error paths.
- **Helper functions are TypeScript assertions** — `throwIfNotFound` narrows `T | null` to `T`, eliminating non-null assertions downstream.

## Success criteria

| Criterion | Status |
|---|---|
| Any handler can `throw new XtimatorError(...)` + caller `asResponse(err)` returns correct status + JSON | ✅ |
| WhatsApp handler can `handleWhatsAppError(err, fromPhone)` for contextual user message | ✅ |
| ZodError → 400 with field list | ✅ |
| Internal errors hide details from user, log full stack server-side | ✅ |
| Test coverage | ✅ 24/24 passing |

## Downstream usage

- Phase 47 (rate limiting) — throws `XtimatorError('rate_limit', surface, ...)` with `meta.retryAfter`
- Phase 48 (debounce) — buffer errors thrown as `XtimatorError('internal', 'whatsapp', ...)`
- Phase 49 (typing/read) — Meta API failures wrapped via `asInternal('whatsapp', cause)` (fire-and-forget caller swallows)
- Phase 50 (OTP) — invalid/expired code → `XtimatorError('bad_request', 'whatsapp', ...)` with `meta.attemptsRemaining`
- Phase 51 (edit commands) — unknown command → `XtimatorError('bad_request', 'whatsapp', ...)` with help text in meta
- Phase 52 (language) — invalid language → `XtimatorError('bad_request', 'estimates', ...)` with `meta.allowed`

## Open follow-ups

- Refactoring existing endpoints (`generate-estimate`, `analyze-photos`, etc.) to use the new system is **deferred** — coexists peacefully with old try/catch. Refactor as phases touch each endpoint.
- WhatsApp adapter currently calls `sendWhatsAppMessage` from `lib/whatsapp/client.ts` — circular dep risk if errors thrown from `client.ts` propagate back. Mitigated: adapter swallows send failures so no infinite loop possible.
