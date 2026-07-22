# Deferred Items — Phase 176

Out-of-scope discoveries logged per the executor's scope-boundary rule (not fixed, not blocking).

## 176-05: Pre-existing bare `tsc --noEmit` drift (unrelated test files)

**Found during:** 176-05 verification (`npx tsc --noEmit`, full-repo, run in addition to the plan's scoped `tsc -p tsconfig.ci.json` which is clean).

**Not caused by this plan.** None of the errors are in `app/api/webhooks/twilio/route.ts` or `tests/unit/webhooks/twilio-inbound.test.ts`. All are pre-existing in files this plan never touched:

- `tests/unit/ai/photo-extraction-call.test.ts(39,58)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/ai/vision-truncation.test.ts(28,58)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/billing/derived-duration.test.ts(136,76)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/billing/transcribe-short-circuit.test.ts(61,76)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/inngest/analyze-photos-cost.test.ts(81,76)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/inngest/analyze-photos-coverage.test.ts(53,76)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/inngest/analyze-photos-structured.test.ts(67,76)` — TS2556 spread-argument-must-be-tuple
- `tests/unit/schemas/estimate-bounds.test.ts(132,9)` and `(154,9)` — TS2322 `unit: null` not assignable to `unit: string`

**Note for future cleanup:** the project memory (`project_ci_gates_scoped_not_bare.md`) recorded bare `tsc --noEmit` as CLEAN on 2026-07-15. It has since drifted (8 errors as of 2026-07-21/22, phase 176 execution), confirming the memory's own warning that `tsconfig.ci.json` excluding `tests/**` lets test-type drift rot invisibly to CI. Not fixed here — out of scope for 176-05 (Twilio inbound webhook route), which only touches `app/api/webhooks/twilio/route.ts` and its own new test file.
