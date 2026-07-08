# Phase 162 — Deferred Items

Out-of-scope findings surfaced during execution, logged per the GSD SCOPE BOUNDARY rule (not fixed under this plan; not introduced by it).

## Discovered during 162-02

### Pre-existing DialogDescription miss in components/workspace/project-workspace.tsx

- **Test:** `tests/unit/ci/warning-regressions.test.ts` > "gives every dialog an accessible description"
- **Failure:** `components/workspace/project-workspace.tsx: 1 missing` — a `<DialogContent>` without a matching `<DialogDescription>`.
- **Scope:** unrelated to the 162-02 client-picker consolidation; verified failing on the pre-162-02 tree via `git stash && npx vitest run tests/unit/ci/warning-regressions.test.ts` (same 1 failure).
- **Action:** left as-is. Belongs to whichever future plan touches `project-workspace.tsx` or an a11y polish milestone.

### Known Windows parallel-import flakes (documented — pass in isolation)

- `tests/unit/cleanup-route-auth.test.ts > returns 503 when CRON_SECRET is not configured`
- `tests/unit/ai/empty-output-guards.test.ts > analyzePhotoOR — empty-output guard (D2) > ok response with empty content → rejects...`
- `tests/unit/ai/transcribe-fallback.test.ts > transcribeAudioOR > primary — OpenRouter transcription success returns its text`

These fail intermittently under the full `npx vitest run tests/unit/` parallel schedule on Windows but pass reliably when re-run in isolation. Documented at the v4.11 milestone ship-notes; no new occurrence introduced by 162-02.
