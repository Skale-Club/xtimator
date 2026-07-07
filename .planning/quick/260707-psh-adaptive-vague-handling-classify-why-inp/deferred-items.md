# Deferred items — quick-260707-psh

Out-of-scope discoveries logged per the executor's scope-boundary rule (pre-existing,
not caused by this plan's changes — not fixed here).

## 1. `tests/unit/actions/attempt-outcome.test.ts` — 2 pre-existing failures (unrelated to psh)

- **Tests:** `pending: only started/succeeded intermediate rows → pending with lastStep/lastStatus`
  and `never throws: a read failure degrades to pending instead of propagating`.
- **Cause:** 260707-o7a added `completedSteps`/`activeStepStartedAt` as REQUIRED fields on the
  `pending` `AttemptOutcome` variant, but these two specific assertions in this test file were not
  updated to expect the new 4-key pending shape (they still assert the old 2-key
  `{ state: 'pending', lastStep, lastStatus }`).
- **Verified pre-existing:** reproduced with `git stash` against the state immediately after this
  plan's Task 1 commit (3ec0f973) — same 2 failures, same assertion diffs, before any Task 2 edit
  landed.
- **Not fixed here:** out of scope per the scope-boundary rule (not caused by psh's changes). A
  one-line update to each assertion (add `completedSteps: [...]`/`activeStepStartedAt: null|...`)
  would close this the next time `tests/unit/actions/attempt-outcome.test.ts` is touched with
  broader test-suite context.

## 2. `tests/unit/ai/` — order-dependent flakiness in 2 unrelated test files (pre-existing)

- **Tests:** `tests/unit/ai/empty-output-guards.test.ts > analyzePhotoOR — empty-output guard (D2)
  > ok response with empty content → rejects with "Photo analysis produced no description"` and
  `tests/unit/ai/transcribe-fallback.test.ts > transcribeAudioOR — OpenRouter primary, OpenAI
  fallback > primary — OpenRouter transcription success returns its text`.
- **Symptom:** both pass in isolation (`npx vitest run <file>` alone) but intermittently fail
  (~8s duration, suggesting a real network attempt / timeout rather than the mocked `global.fetch`)
  when the full `tests/unit/ai/` directory runs together — some other pre-existing file in that
  directory reassigns `global.fetch = vi.fn()` without full restoration, leaking across files
  under Vitest's worker/thread pool.
- **Verified pre-existing:** reproduced with `tests/unit/ai/needs-details.test.ts` (this plan's new
  file) temporarily removed from the directory — the SAME 2 failures still occur, so this plan's
  new test file is not the leak source.
- **Not fixed here:** out of scope per the scope-boundary rule — pre-existing test-isolation
  flakiness unrelated to psh's changes.
