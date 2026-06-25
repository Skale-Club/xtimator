# Deferred Items — Phase 131 Discounts

## Out-of-scope pre-existing issues (not caused by 131-03)

- `tests/unit/inngest/generate-estimate-job.test.ts(150,66)` — TS2348 `Value of type 'Mock<Procedure | Constructable>' is not callable`. Pre-existing on clean tree (verified via `git stash` + `tsc --noEmit`). Unrelated to discount wiring; a vitest mock typing issue in an Inngest job test. Not fixed here.
