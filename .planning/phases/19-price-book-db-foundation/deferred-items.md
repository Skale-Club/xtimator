# Deferred Items — Phase 19

## Out of Scope Discoveries

### Pre-existing Test Failures (discovered during 19-01 execution)

**File:** `tests/unit/onboarding-schema.test.ts`
**Failures:** 2 tests checking `brandPrimaryColor` defaults to `#0D9488` but receive `#406EF1`
**Context:** These failures predate Phase 19. The brand color was updated to `#406EF1` in Phase 10 (global brand tokens) but the test expectations were not updated.
**Impact:** 12 total test failures across 4 files — all pre-existing, none caused by Phase 19 changes.
**Action needed:** Update test expectations to `#406EF1` in a separate fix/quick task.
**Out of scope because:** Not caused by Phase 19 changes; pre-existing in the codebase.
