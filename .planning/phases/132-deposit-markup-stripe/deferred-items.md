# Deferred items — Phase 132

Out-of-scope discoveries logged during execution (not fixed; not caused by the current plan).

## 132-01

- **Pre-existing tsc error** in `tests/unit/inngest/generate-estimate-job.test.ts(150,66)`:
  `TS2348: Value of type 'Mock<Procedure | Constructable>' is not callable.`
  Confirmed present on the parent commit (`git stash` baseline) — a vitest mock-typing
  issue unrelated to DEP-01. All Vitest runs pass; this is a type-only annotation gap in a
  test mock. Defer to a dedicated test-typing cleanup.
