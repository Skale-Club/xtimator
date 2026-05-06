---
phase: 18-voice-first-project-onboarding
plan: "02"
subsystem: capture-recorder
tags: [voice, recorder, capture, stepper, waveform, workspace-tabs]
dependency_graph:
  requires: [18-01]
  provides: [capture-recorder-ui, waveform-full-width, workspace-tab-deep-link]
  affects: [app/(capture)/projects/[id]/capture, app/(app)/projects/[id], components/workspace]
tech_stack:
  added: []
  patterns:
    - "Wall-clock timer: performance.now() baseline in setInterval(tick, 250) — immune to background tab throttling (RESEARCH Pattern 4)"
    - "SVG progress ring: stroke-dasharray + stroke-dashoffset with Tailwind colorClass prop (RESEARCH Pattern 3)"
    - "Stage machine: sequential awaits with setStage() calls between awaits — D-13, no SSE needed (RESEARCH Pattern 5)"
    - "Controlled Tabs: useSearchParams().get('tab') drives activeTab state; router.replace keeps URL in sync"
    - "ResizeObserver-driven WaveformVisualizer: dynamic width + barCount = Math.max(48, Math.floor(width / 6))"
key_files:
  created:
    - components/capture/circular-progress-ring.tsx
    - components/capture/capture-timer.tsx
    - components/capture/capture-stepper.tsx
    - components/capture/capture-failure.tsx
    - components/capture/capture-recorder.tsx
  modified:
    - components/workspace/audio/waveform-visualizer.tsx
    - components/workspace/project-workspace.tsx
    - app/(app)/projects/[id]/page.tsx
    - app/(capture)/projects/[id]/capture/capture-client.tsx
    - tests/unit/processing-stepper.test.tsx
    - tests/unit/transcript-reveal.test.tsx
    - tests/unit/recorder-warning-thresholds.test.ts
    - tests/unit/recorder-duration-cap.test.ts
decisions:
  - "No in-recording cancel by design: Skip button is idle-only escape; once recording starts only auto-stop or failure-stage Edit manually is available (CONTEXT Discretion + Pitfall 4 race prevention)"
  - "Failure state uses separate CaptureFailure component (not inline in stepper) per D-14: clean retry/manual split"
  - "runPipeline called from MediaRecorder.onstop handler so blob is assembled before pipeline starts"
  - "AMBER_AT_MS exported from capture-timer.tsx so both timer and recorder reference same constants; recorder also exports HARD_CAP_MS + WARN_AT_MS for test coverage"
metrics:
  duration: 12min
  completed: "2026-05-05"
  tasks: 3
  files: 9
---

# Phase 18 Plan 02: Voice-First Capture Recorder UI + Pipeline + Workspace Tab Wiring Summary

**One-liner:** Full-screen voice recorder with SVG ring, color-escalating timer, 10-min wall-clock cap, 4-stage pipeline stepper with transcript reveal, and tab-deep-link support on the workspace.

## What Was Built

### Task 1: Presentational Components + WaveformVisualizer Extension

Five new/modified files deliver the visual building blocks for the capture screen:

- **`components/capture/circular-progress-ring.tsx`** — Tailwind-only SVG ring: track (stroke-muted) + progress arc (colorClass prop). Children slot centers the mic button. `stroke-dasharray={circumference}` + `strokeDashoffset = circumference * (1 - progress)` pattern from RESEARCH Pattern 3.

- **`components/capture/capture-timer.tsx`** — MM:SS timer with color escalation: `text-primary` below 8:00, `text-amber-500` at 8:00–9:30, `text-red-500` at 9:30+. Exports `AMBER_AT_MS = 480000` and `RED_AT_MS = 570000` per D-07.

- **`components/capture/capture-stepper.tsx`** — 4-stage stepper (Saving recording, Transcribing, Analyzing, Generating estimate) with done/active/failed/pending states and transcript reveal block (D-10, D-11). Exports `STAGES`, `STAGE_LABELS`, `StageKey`.

- **`components/capture/capture-failure.tsx`** — Retry (≤2 attempts, shows count) + Edit manually buttons per D-14. Retry hidden when `retriesUsed >= 2`.

- **`components/workspace/audio/waveform-visualizer.tsx`** — Extended with `ResizeObserver`-driven dynamic width, optional `height` prop (default 96px for backward compat), dynamic `barCount = Math.max(48, Math.floor(width / 6))`. Backward compatible with existing audio-tab usage.

Wave 0 test stubs replaced with real assertions: 17 unit tests passing across 4 test files.

### Task 2: Full-Screen CaptureRecorder + Pipeline Wiring

**`components/capture/capture-recorder.tsx`** (~280 lines) — The complete voice-first recorder:

- **Timer**: `performance.now()` baseline + `setInterval(tick, 250)` for wall-clock accuracy regardless of background tab throttling (RESEARCH Pattern 4)
- **Duration cap**: Auto-stop at `HARD_CAP_MS = 600000ms` with `toast.info`; 60s warning at `WARN_AT_MS = 540000ms` with `toast.warning` (D-06, D-07)
- **Color escalation**: ring + timer share the same thresholds — neutral below 8:00, amber 8:00–9:30, red 9:30+ (D-07)
- **Pitfall guards**: `visibilitychange` fires `tick()` on tab return; `beforeunload` blocks navigation while recording; `mute`/`inactive` track events detect permission revoke (Pitfalls 1, 2, 3)
- **Pipeline** (`runPipeline`): `saving` → Storage upload + `createRecording` → `transcribing` → `transcribeRecording` → D-15 empty-transcript guard → `setTranscript` → `analyzing` → `fetch('/api/generate-estimate')` → `generating` → `done` → `router.push(/projects/${id}?tab=estimate&estimate=${id})` (RESEARCH Pattern 5, D-13 stage-split timing)
- **Failure UX**: `failAt(stage, msg)` drives `CaptureFailure` with retry + edit manually (D-14)
- **AbortController**: wired to generate-estimate fetch; aborted on unmount (Pitfall 4)
- **Skip button**: visible only at `stage === 'idle' && !isRecording && !audioBlob` (D-16, Pitfall 4)
- **Design decision**: no in-recording cancel — documented with comment near `handleToggleRecording`

**`app/(capture)/projects/[id]/capture/capture-client.tsx`** updated to: `return <CaptureRecorder project={project} companyId={companyId} projectId={project.id} />`. Placeholder removed.

### Task 3: Workspace Tab-Switch Awareness

**`components/workspace/project-workspace.tsx`** converted from `defaultValue="overview"` to controlled `<Tabs value={activeTab} onValueChange={handleValueChange}>`:
- `useSearchParams().get('tab')` initializes `activeTab`
- `useEffect` syncs when `queryTab` changes (e.g., redirect from `/capture`)
- `router.replace` keeps URL in sync on manual tab click
- `ALLOWED_TABS` whitelist prevents invalid tab values

**`app/(app)/projects/[id]/page.tsx`** extended to:
- Accept `searchParams: Promise<{ tab?: string; estimate?: string }>`
- Read `rawTab`, validate against `ALLOWED_TABS`, default to `'overview'`
- Forward `defaultTab` through `ProjectTabs` into `<ProjectWorkspace />`

**Impact**: `router.push('/projects/${id}?tab=estimate&estimate=${estimateId}')` from the recorder now lands the user on the Estimate tab without any manual click — closes Checker Blocker 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript discriminated union type narrowing for server action error field**
- **Found during:** Task 2
- **Issue:** `createRecording` and `transcribeRecording` return `{ data: X } | { error: string }`. TypeScript could not narrow `.error` as `string` (typed as `string | undefined` in the union branch).
- **Fix:** Added `?? 'fallback message'` after `.error` access and `as string` cast on `.data.id` where Supabase generics loosened the type.
- **Files modified:** `components/capture/capture-recorder.tsx`
- **Commit:** e8a710b (same task commit)

## Known Stubs

None. All pipeline connections are wired to real server actions and the generate-estimate API route.

## Self-Check: PASSED

All files created and verified:
- FOUND: components/capture/circular-progress-ring.tsx
- FOUND: components/capture/capture-timer.tsx
- FOUND: components/capture/capture-stepper.tsx
- FOUND: components/capture/capture-failure.tsx
- FOUND: components/capture/capture-recorder.tsx
- FOUND: components/workspace/audio/waveform-visualizer.tsx (modified)
- FOUND: components/workspace/project-workspace.tsx (modified)

All commits verified:
- 884af89: feat(18-02): build presentational capture components and extend WaveformVisualizer
- e8a710b: feat(18-02): build full-screen CaptureRecorder and wire into capture-client
- 0bd4548: feat(18-02): make workspace tab-switch-aware via controlled Tabs + searchParams sync

Tests: 17/17 passing (recorder-duration-cap, recorder-warning-thresholds, processing-stepper, transcript-reveal)
