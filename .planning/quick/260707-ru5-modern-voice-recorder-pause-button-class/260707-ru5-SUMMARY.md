---
task: 260707-ru5
title: Modern voice recorder — pause-aware clock + REC/stop/pause controls
subsystem: capture
tags: [capture, recording, i18n, pause, ui]
dependency-graph:
  requires: [260707-grq (duration=0 fix, elapsedMsRef snapshot-before-stop)]
  provides: [computeElapsedMs, SUPPORTS_PAUSE gate, capture-pause testid, CaptureTimer className prop]
  affects:
    - components/capture/capture-recorder.tsx
    - components/capture/capture-timer.tsx
    - components/workspace/audio/voice-recorder.tsx (all consumers: inline-audio-recorder, ai-voice-dialog, refine-estimate-dialog)
tech-stack:
  added: []
  patterns: [pure-helper-for-testability, feature-gate-via-prototype-check, cn-twMerge-className-override]
key-files:
  created:
    - tests/unit/capture/compute-elapsed.test.ts
  modified:
    - components/capture/capture-recorder.tsx
    - components/capture/capture-timer.tsx
    - components/workspace/audio/voice-recorder.tsx
    - components/projects/inline-audio-recorder.tsx
    - lib/i18n/translations.ts
decisions:
  - "Recording overlay and idle popup canvas are ONE surface — dropped bg-background/80 backdrop-blur-md in favor of bg-background (post-approval user addendum)"
  - "Pause button replaces Camera in the same footprint (h-12 w-12) only when SUPPORTS_PAUSE; falls back to the pre-existing Camera-always-visible binary UX when unsupported"
  - "Idle FAB uses ring-1 ring-border (not a second border-* class) to avoid a twMerge conflict with the fixed border-4 border-background geometry class"
metrics:
  duration: "~50 min"
  completed: 2026-07-07
---

# Quick Task 260707-ru5: Modern voice recorder — pause-aware clock + REC/stop/pause controls Summary

Pause-aware wall-clock recording timer (MediaRecorder.pause/resume backed by a pure `computeElapsedMs` helper) plus a modern classic-REC-dot / stop-square+ping-halo visual language for the popup's mic button and all shared `VoiceRecorder` consumers, with the recording overlay now rendered as one visual surface with the idle popup canvas rather than a separate layer.

## What was built

**Task 1 — Pause-aware clock (`components/capture/capture-recorder.tsx`):**
- New pure, exported helper: `computeElapsedMs(accumulatedMs, segmentStartMs, nowMs)` — `accumulatedMs + (segmentStartMs === null ? 0 : nowMs - segmentStartMs)`.
- `startTimeRef` replaced by `accumulatedMsRef` (sum of completed segments) + `segmentStartRef` (current segment's start, `null` = paused/idle). New `isPaused` state.
- `tick()` and `stopRecording()` now derive elapsed via `computeElapsedMs` — the WARN/AMBER/RED/HARD_CAP thresholds count only actually-recorded time; pause freezes the value (interval keeps running but the value is a no-op React update).
- `pauseRecording()` (new): guards `rec.state === 'recording'`, accumulates the just-finished segment, nulls `segmentStartRef`, snapshots `elapsedMsRef`, calls native `MediaRecorder.pause()`. Deliberately does **not** touch stream/tracks/AudioContext — the permission-revoked guard needs the track alive during pause.
- `resumeRecording()` (new): guards `rec.state === 'paused'`, calls `rec.resume()`, sets a fresh `segmentStartRef = performance.now()`.
- `stopRecording()`: still snapshots `elapsedMsRef` **before** `mediaRecorder.stop()` (260707-grq duration=0 fix preserved) — now via `computeElapsedMs`, valid from both `'recording'` and `'paused'` states.
- `startRecording()`: resets `accumulatedMsRef = 0` and `isPaused = false` alongside the existing `elapsedMsRef`/`chunksRef` reset.
- `SUPPORTS_PAUSE` — SSR-safe module-level gate (`typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function'`) — used by Task 2's UI to degrade gracefully on browsers without pause support.

**Task 2 — Modern controls + "one canvas" integration (`capture-recorder.tsx`, `capture-timer.tsx`, `voice-recorder.tsx`, `inline-audio-recorder.tsx`, `translations.ts`):**
- Popup FAB (`data-testid="capture-mic"`): idle = `bg-background/80 backdrop-blur-xl ring-1 ring-border hover:bg-background group` glass button with a `gradient-danger` REC dot that scales on hover; recording = `gradient-danger text-white relative` with a `bg-red-500/30 animate-ping motion-reduce:hidden` halo + white rounded-square (replaces the dated `animate-pulse` Mic/MicOff icon pair); paused = same stop square, halo suppressed, `opacity-80`. Aria-labels now go through `t()`.
- Left action-bar slot: Camera (idle) swaps to a Pause/Resume button (`data-testid="capture-pause"`, lucide `Pause`/`Play`, `fill-current`) in the **same `h-12 w-12` footprint** during recording — but only when `SUPPORTS_PAUSE`; otherwise Camera stays exactly as before (binary UX preserved for unsupported browsers).
- **Post-approval addendum applied**: the recording overlay is no longer a visually separate layer — background dropped from `bg-background/80 backdrop-blur-md` to plain `bg-background` (same as the idle textarea canvas); the glass bottom action bar remains the shared visual anchor across both states; typographic scale matches the popup (timer `text-5xl sm:text-6xl font-light`, not a mismatched giant mono).
- Status text: `t('Paused')` in `text-amber-500/80 font-medium not-italic` (static) vs `t('Listening...')` in the existing pulsing italic style.
- **Fixed the nested `<p>` bug**: `CaptureTimer` (which renders its own `<p>`) is now rendered directly instead of being wrapped in another `<p>`. `CaptureTimer` gained an additive `className` prop, merged via `cn()` **after** the base classes so twMerge resolves the size-class conflict; `data-testid="capture-timer"` and the `AMBER_AT_MS`/`RED_AT_MS` exports are untouched.
- Waveform: `isRecording={isRecording && !isPaused}` — pause falls back to the idle "breathing" animation (visually "frozen" without any visualizer code changes — `waveform-visualizer.tsx` was not touched).
- Generate button: unchanged (`disabled={!hasAnyInput || isRecording}` already covers paused, since `isRecording` stays true throughout pause).
- `components/workspace/audio/voice-recorder.tsx` (shared presentational primitive — no recording state, `onToggle` stays binary, no pause here): removed `Mic`/`MicOff`; idle = `bg-background/70 border border-border backdrop-blur-sm hover:bg-background group` glass with a `gradient-danger` dot (sm `h-3.5 w-3.5`, md `h-6 w-6`, lg `h-4 w-4`); recording = kept `bg-red-500 hover:bg-red-600`, swapped `animate-pulse` for an `animate-ping` halo (md/lg only — sm is too small to read cleanly) + a white rounded-square (sm `h-3 rounded-[3px]`, md `h-5 rounded-[5px]`, lg `h-4 rounded-[4px]`). Added `useTranslation()` for aria-labels. All consumers (stacked/fullscreen capture, inline-audio-recorder, ai-voice-dialog, refine-estimate-dialog) inherit the restyle automatically.
- `components/projects/inline-audio-recorder.tsx`: reworded its one helperText string that mentioned "mic" — `t('Tap the mic to start recording')` → `t('Tap to record')`.
- `lib/i18n/translations.ts` staticDict (pt/es): `Paused`, `Pause recording`, `Resume recording`, `Start recording`, `Stop recording`.

**Task 3 — Test coverage (`tests/unit/capture/compute-elapsed.test.ts`, new file):**
- Live segment `(0, 1000, 5000) = 4000`; frozen-while-paused `(4000, null, 999999) = 4000`; resumed `(4000, 10000, 12000) = 6000`; idle `(0, null, X) = 0`; a full multi-cycle record→pause→resume→pause→resume scenario; and a hard-cap regression proving a very long wall-clock pause never triggers `HARD_CAP_MS` early (frozen value stays below cap regardless of how long the pause lasts) or late (cap fires the instant *recorded* time — not wall-clock time — crosses 10:00).

## Deviations from Plan

None — plan executed exactly as written, including the post-approval "REQUISITO ADICIONAL DO USUÁRIO" addendum (recording overlay + idle popup as one canvas).

One incidental, in-scope clarification: the plan's "Renderizado só com SUPPORTS_PAUSE" note for the pause button was resolved as — when unsupported, the left slot keeps showing the ordinary Camera button (unchanged, always-available) rather than rendering nothing/blank during recording, since the "Edge cases" section states "sem suporte a pause (raro): botão não renderiza, UX atual binária preservada" (only the *new pause button* doesn't render; the existing UX is explicitly preserved).

## Auth Gates

None encountered.

## Verification

- `npx vitest run tests/unit/capture/ tests/unit/recorder-duration-cap.test.ts tests/unit/recorder-warning-thresholds.test.ts` — **30/30 passed** (24 pre-existing + 6 new `compute-elapsed.test.ts` cases).
- `npx tsc --noEmit` — no new errors in any touched file (`capture-recorder.tsx`, `capture-timer.tsx`, `voice-recorder.tsx`, `inline-audio-recorder.tsx`, `translations.ts`, `compute-elapsed.test.ts`). Pre-existing baseline errors in unrelated test files (billing, whatsapp, chat, estimate, etc.) are unchanged — confirmed identical via `git stash` comparison.
- `npx eslint` on all touched files — 0 new problems. `capture-recorder.tsx` retains exactly the same 2 pre-existing "Compilation Skipped" React Compiler errors + 3 `react-hooks/exhaustive-deps` warnings it had before this task (confirmed via `git stash` diff of lint output — same line content, just shifted line numbers from the added code). Between the Task 1 and Task 2 commits, `SUPPORTS_PAUSE`/`isPaused`/`pauseRecording`/`resumeRecording` were transiently unused (4 warnings) — fully resolved by the Task 2 commit wiring them into the UI.
- Manual/e2e verification (Playwright specs `tests/e2e/capture-fullscreen-shell.spec.ts`, `tests/e2e/recorder-mobile.spec.ts`) were inspected (not run — require a live browser) to confirm they only assert `data-testid="capture-mic"`/`"capture-timer"` presence/visibility, both of which are preserved.
- Exports confirmed stable: `finalizeDurationSeconds`, `MIN_RECORDING_MS` (via `capture-duration.test.ts`, untouched), `AMBER_AT_MS`/`RED_AT_MS` (via `recorder-warning-thresholds.test.ts`, imports from `capture-timer.tsx`, untouched).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `components/capture/capture-recorder.tsx` (modified, computeElapsedMs + SUPPORTS_PAUSE + UI wired)
- FOUND: `components/capture/capture-timer.tsx` (modified, className prop)
- FOUND: `components/workspace/audio/voice-recorder.tsx` (modified, REC-dot/stop-square restyle)
- FOUND: `components/projects/inline-audio-recorder.tsx` (modified, helperText reword)
- FOUND: `lib/i18n/translations.ts` (modified, 5 new pt/es entries)
- FOUND: `tests/unit/capture/compute-elapsed.test.ts` (created)
- FOUND commit `13990340`: feat(capture): pause-aware recording clock + pause/resume — computeElapsedMs, MediaRecorder pause
- FOUND commit `067f8ed3`: feat(capture): modern REC/stop/pause controls + recording state integrated with the popup canvas
- FOUND commit `ed818598`: test(capture): computeElapsedMs pause math coverage
