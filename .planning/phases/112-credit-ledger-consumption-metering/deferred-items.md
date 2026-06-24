# Deferred Items — Phase 112

## Pre-existing (out of scope for Plan 04)

- `tests/unit/inngest/generate-estimate-job.test.ts(150,66)`: TS2348 `Value of type 'Mock<Procedure | Constructable>' is not callable`. Present on the 112-03 baseline (confirmed via `git stash` + `tsc`) — NOT introduced by the credit-debit wiring. A pre-existing test-mock typing issue in an unrelated test file. Out of scope per executor scope-boundary rule.
