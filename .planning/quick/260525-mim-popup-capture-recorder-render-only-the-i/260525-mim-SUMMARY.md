---
quick_id: 260525-mim
subsystem: ui
tags: [react, nextjs, capture-recorder, popup-flow, single-modality, ux]

# Dependency graph
requires:
  - quick_id: prior-single-modal-new-project-flow
    provides: StepModalitySelect (Record / Describe / Photos cards) + EstimateCreationPopup URL contract (?capture=audio|text|photos&projectId=<id>) + CaptureRecorder.variant='popup'
provides:
  - Optional `mode?: CaptureMode` prop on CaptureRecorder + RecorderBody
  - Single-modality rendering in the estimate-creation popup (only the matching input UI is shown)
  - Narrow-cast pattern (`mode as CaptureMode` guarded by `isOpen`) for threading URL param into the recorder
  - Conditional render structure in RecorderBody (audio | text | photos | OR divider | always-visible language+generate)
  - Backward compatibility for legacy fullscreen `/projects/[id]/capture` route (no mode prop -> all three blocks + OR divider render as before)
affects:
  - Future single-modality UX work in EstimateCreationPopup
  - Any consumer of CaptureRecorder that wants to lock to one input modality

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional prop with documented `undefined === legacy layout` contract for backward-compatible UI gating"
    - "Cross-component type import (CaptureMode imported from the popup file that owns the URL-param contract)"
    - "Plain JSX conditional gating: `{(mode === 'audio' || mode === undefined) && (...)}`"

key-files:
  created: []
  modified:
    - components/projects/estimate-creation-popup.tsx
    - components/capture/capture-recorder.tsx

key-decisions:
  - "CaptureMode is imported from the popup file (already exported) rather than re-declared, so the source-of-truth for the URL-param contract stays in estimate-creation-popup.tsx"
  - "Narrow cast `mode as CaptureMode` is guarded by `isOpen` (which already implies `isCaptureMode(mode)`), avoiding an unnecessary runtime branch at the JSX site"
  - "OR divider is fully omitted in single-mode popup paths (not just visually hidden) - the surrounding `px-4` wrapper is dropped entirely so vertical spacing stays clean between the audio/text/photos block and the language selector"
  - "EstimateLanguageSelector + Generate Estimate button are ALWAYS visible across all four scenarios (audio popup, text popup, photos popup, legacy fullscreen). `hasAnyInput` already gates the button correctly per mode because only the visible input can be populated"
  - "`mode` defaults to undefined on CaptureRecorderProps + RecorderBodyProps. The legacy fullscreen `/capture` route (`app/(capture)/projects/[id]/capture/capture-client.tsx`) does not pass `mode`, so its render is byte-identical to pre-PR behavior"

patterns-established:
  - "Optional discriminator prop with `undefined === legacy fallback` semantics - useful pattern when introducing single-mode variants on components that previously rendered everything"

requirements-completed:
  - QUICK-260525-mim-01

# Metrics
duration: 16min
completed: 2026-05-25
---

# Quick 260525-mim: Single-modality estimate-creation popup Summary

**Estimate-creation popup now renders only the input UI matching the modality picked on StepModalitySelect (audio / text / photos), while the legacy fullscreen `/capture` route still renders all three inputs with the OR divider.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-05-25T19:16:02Z
- **Completed:** 2026-05-25T19:32:23Z
- **Tasks:** 1 of 2 (Task 2 is a checkpoint:human-verify - auto-approved under `workflow.auto_advance: true`)
- **Files modified:** 2

## Accomplishments

- Threaded `CaptureMode` from the URL param through the popup into `<CaptureRecorder mode={captureMode} ... />` in `estimate-creation-popup.tsx`.
- Added optional `mode?: CaptureMode` prop on both `CaptureRecorderProps` and `RecorderBodyProps` in `capture-recorder.tsx`, with documented `undefined === legacy all-three-inputs layout` semantics.
- Gated the audio / text / photos input blocks in `RecorderBody` on `mode`:
  - Audio block: `mode === 'audio' || mode === undefined`
  - Text block: `mode === 'text' || mode === undefined`
  - Photos block: `mode === 'photos' || mode === undefined`
  - OR divider: `mode === undefined` only (fully omitted in single-mode popup paths)
- Preserved EstimateLanguageSelector + Generate Estimate button as always-visible across all four scenarios.
- No changes to pipeline / actions / lib / schema / migrations - pure visual gating.

## Task Commits

1. **Task 1: Thread CaptureMode prop and gate RecorderBody inputs** - `fa6ce8b` (feat) — landed on `main` via a concurrent agent that ran the same plan in parallel. The worktree-isolated executor produced an identical change at `382b691`; the orchestrator detected the duplicate and discarded the redundant worktree branch.
2. **Task 2: Manual UX verification** - `checkpoint:human-verify` auto-approved under `workflow.auto_advance: true` (no commit; verification deferred to human walk-through)

## Files Created/Modified

- `components/projects/estimate-creation-popup.tsx` - Narrows `searchParams.get(CAPTURE_PARAM)` to `CaptureMode` via `mode as CaptureMode` (guarded by `isOpen`) and forwards it as `mode={captureMode}` into `<CaptureRecorder />`.
- `components/capture/capture-recorder.tsx` - Imports `type CaptureMode` from the popup file; adds optional `mode?: CaptureMode` to `CaptureRecorderProps` and `RecorderBodyProps`; threads `mode` through the function signature and into `<RecorderBody mode={mode} ... />`; gates the audio / OR-divider / text / photos JSX blocks on `mode`. Pipeline state, callbacks, useEffects, recording lifecycle, and language selector / Generate button are untouched.

## Decisions Made

- Imported `CaptureMode` from `@/components/projects/estimate-creation-popup` rather than re-declaring - single source of truth for the URL-param contract.
- Cast `mode as CaptureMode` in the popup (no extra runtime branch) - safe because the JSX only renders when `isOpen === true`, which already implies `isCaptureMode(mode)`.
- Dropped the OR divider entirely (including its `px-4` wrapper) in single-mode paths - avoids leftover vertical whitespace between the chosen input and the language selector.
- Kept `disabled={!hasAnyInput}` on the Generate button unchanged - `hasAnyInput` naturally reflects the right state per mode because only the visible input can be populated.

## Deviations from Plan

None - plan executed exactly as written. Implementation, file scope, and verification commands match the plan one-for-one.

## Issues Encountered

- **Toolchain quirk (non-functional):** The Edit/Write tools in this session reported success but the underlying disk file was not actually being updated (verified via `md5sum` and direct `grep` on the on-disk bytes, while the Read tool returned the would-have-been content). Resolved by applying all 9 edits via a Node script invoked through the Bash tool (`fs.readFileSync` / `fs.writeFileSync` with explicit `\r\n` line endings to match the existing CRLF encoding). The final on-disk state matches the plan exactly and `npx tsc --noEmit` is clean.
- **Pre-existing staged changes:** The `git reset --soft 1fbe293...` worktree-rebase step left changes from the previous quick task (260525-lt5) staged. Those were unstaged before committing so the worktree commit touched exactly the two intended files.
- **Parallel-agent collision:** While the worktree executor was running, a concurrent agent landed the same plan on `main` as commit `fa6ce8b` (identical scope, identical conditional gates). The orchestrator kept the version already on `main`, discarded the worktree branch, restored an unrelated stray edit to `components/capture/capture-stepper.tsx`, and cleaned a `// EDIT TEST MARKER 12345` + `void captureMode` debug line that the executor's filesystem-bypass workaround had left in `estimate-creation-popup.tsx`.

## Verification

- `npx tsc --noEmit` - passes with no output (clean exit). No new TypeScript errors.
- `git diff --stat` for the task commit shows exactly two files changed:
  - `components/capture/capture-recorder.tsx` (~132 lines impacted)
  - `components/projects/estimate-creation-popup.tsx` (+4 / 0)
- No changes under `lib/`, `app/api/`, schemas, or migrations.
- Task 2 manual UX walk-through is the checkpoint:human-verify - auto-approved under `workflow.auto_advance: true`; the human verifier should walk through the four scenarios listed in the plan to confirm visual behavior.

## Self-Check: PASSED

- FOUND: `components/projects/estimate-creation-popup.tsx` contains `captureMode` (lines 60, 130) and `mode as CaptureMode` narrowing.
- FOUND: `components/capture/capture-recorder.tsx` contains `import type { CaptureMode }` (line 31), `mode?: CaptureMode` on both prop interfaces (lines 60, 551), `mode` in CaptureRecorder destructure (line 79), `mode={mode}` forwarded to RecorderBody (line 499), and four `mode === ...` conditional gates around audio / OR-divider / text / photos blocks (lines 559, 579, 588, 600).
- FOUND: commit `fa6ce8b` (`feat: implement single-modality input rendering in CaptureRecorder based on selected mode`) on `main` — applies the identical conditional gates this plan called for.
- FOUND: `npx tsc --noEmit` exits clean.

---
*Quick task: 260525-mim*
*Completed: 2026-05-25*
