## Deferred (out-of-scope, discovered during 125-00)

Pre-existing `tsc --noEmit` errors in files NOT touched by Phase 125 (logged, not fixed — scope boundary):

- `tests/unit/ai/refine-shared-prompt.test.ts:49` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/observability.test.ts:38,58,66` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/step-runner.test.ts:50` — TS2322 StepRunner mock shape mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts:150` — TS2348 mock not callable

These predate 125-00 (last touched in phases 97/100/101) and do not affect the chat suite, which is fully green.
