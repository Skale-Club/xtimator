---
task: 260707-shg
title: Modern scrolling amplitude-history waveform (replace the oscilloscope)
subsystem: capture
tags: [audio, capture, canvas, waveform, ui]
dependency-graph:
  requires: [260707-ru5 (pause-aware recording clock; popup passes isRecording={isRecording && !isPaused})]
  provides: [lib/audio/waveform-history.ts pure helpers, freeze-on-pause waveform semantics]
  affects:
    - components/workspace/audio/waveform-visualizer.tsx
    - components/capture/capture-recorder.tsx
    - components/workspace/audio/voice-recorder.tsx (consumer, unchanged)
tech-stack:
  added: []
  patterns: [amplitude-history-buffer-in-ref, instance-identity-reset-vs-toggle-reset, pure-helper-for-testability]
key-files:
  created:
    - lib/audio/waveform-history.ts
    - tests/unit/audio/waveform-history.test.ts
  modified:
    - components/workspace/audio/waveform-visualizer.tsx
    - components/capture/capture-recorder.tsx
decisions:
  - "Buffer stores raw 0..1 rms values (not pre-computed pixel heights) so a resize re-normalizes existing history against the new canvas height instead of distorting it"
  - "Bars are right-aligned (newest flush against the right edge); when the buffer hasn't reached maxBars yet, older bars simply don't reach as far left — this naturally reads as 'grows from the right, scrolls left once full' without special-casing the partial-buffer case"
  - "Buffer reset is keyed on AnalyserNode INSTANCE identity (ref comparison), not on isRecording — pause/resume reuses the same instance and preserves history; only a genuinely new take (new AnalyserNode from startRecording) clears it"
  - "Frozen (paused, buffer non-empty) state paints once and does NOT re-schedule requestAnimationFrame — saves CPU/battery and is a correct-by-construction implementation of 'no new samples, no animation'"
metrics:
  duration: "~35 min"
  completed: 2026-07-07
---

# Quick Task 260707-shg: Modern scrolling amplitude-history waveform Summary

Replaced the per-frame oscilloscope waveform (`getByteTimeDomainData` line trace redrawn every animation frame) with an iOS Voice Memos / WhatsApp-style scrolling amplitude-history: rounded, brand-gradient bars committed every 60ms from the peak RMS of that window, scrolling right-to-left, freezing in place on pause, and a quiet breathing center-line for true idle — all behind the exact same `WaveformVisualizer` public props API.

## What was built

**Task 1 — `WaveformVisualizer` rewrite + pure helpers (`components/workspace/audio/waveform-visualizer.tsx`, new `lib/audio/waveform-history.ts`):**
- New pure, exported helpers (canvas/DOM-agnostic, in `lib/audio/waveform-history.ts`):
  - `rmsFromTimeDomain(data: Uint8Array): number` — RMS of a time-domain buffer (values 0-255 centered on 128), returns 0..1.
  - `normalizeAmplitude(rms, halfHeight, minBar = MIN_BAR): number` — boosts (×4) + soft power curve (pow 0.8) + clamps to `[minBar, halfHeight]`; silence always renders as a `MIN_BAR` (2px) dot.
  - `pushBar(buffer, value, maxBars): number[]` — immutable append with circular-buffer trim (drops oldest once `maxBars` exceeded); newest value is always the last array element.
  - Shared geometry/timing constants: `BAR_WIDTH = 3`, `BAR_GAP = 3`, `BAR_INTERVAL_MS = 60`, `MIN_BAR = 2`.
- `WaveformVisualizer` internals rebuilt around an amplitude-history buffer (`bufferRef`, a ref — not React state, so the rAF loop mutates it every frame without re-rendering):
  - While `isRecording && analyser`: each animation frame samples `rmsFromTimeDomain`, tracks the frame's PEAK rms (`peakRmsRef`) and elapsed time since the last committed bar (`accumMsRef`, driven by `performance.now()` deltas that only ever accumulate while this recording rAF loop is actually running — pause tears the loop down, so paused wall-clock time is never counted). Every `BAR_INTERVAL_MS`, the peak is committed via `pushBar` and the accumulators reset.
  - Render: bars are right-aligned (newest flush against the canvas's right edge), rounded (`ctx.roundRect` with a plain-`rect` fallback for older environments — same fallback pattern as before), drawn with the existing brand gradient (`--primary` → `--secondary`, read once per effect run exactly as before) and a linear per-bar opacity fade by age (`ctx.globalAlpha`, 1.0 newest → 0.35 oldest, denominator `maxBars - 1` so the fade rate stays constant regardless of how full the buffer currently is). No `shadowBlur`/glow.
  - `isRecording=false` with a non-empty buffer (pause): paints the frozen buffer once and does **not** re-schedule `requestAnimationFrame` — no new samples, no clearing, no animation.
  - `isRecording=false` with an empty buffer (true idle / never recorded): a single 1px `--muted-foreground` center line with a very subtle breathing alpha oscillation (0.22..0.35 over a ~2.2s period) — replaces the old busy per-bar sine-wave idle animation.
  - Buffer reset is a **separate** effect keyed on `analyser !== analyserInstanceRef.current` (an identity/reference comparison) — this fires only when a genuinely new `AnalyserNode` is created (new recording take via `startRecording()`), never on an `isRecording` toggle (pause/resume reuses the same instance), which is exactly what freeze-on-pause requires.
  - `ResizeObserver`-driven width measurement and the CSS-var-read-once-per-effect-run pattern are both preserved unchanged from the previous implementation.
  - Public props (`{ analyser, isRecording, height? }`) are byte-for-byte unchanged — `voice-recorder.tsx` (sm/md/lg) and `capture-recorder.tsx` compile and render with zero consumer-side edits beyond Task 2's intentional height/width tweak.

**Task 2 — Waveform as the hero of the popup recording state (`components/capture/capture-recorder.tsx`):**
- The `isHorizontal` recording overlay's `WaveformVisualizer` grows from `height={80}` to `height={100}`.
- Its wrapping container changes from a fixed `w-full min-w-[280px]` to `w-full max-w-md`, matching the popup's existing content width elsewhere so the new bars keep a consistent gap/scale against the popup's own padding.
- Nothing else in the overlay changed (timer, status text, action bar were already modernized in 260707-ru5). `VoiceRecorder`'s three internal call sites (sm=30/40, md=72, lg=80) were left untouched per the plan — the new render scales cleanly by `height` prop, confirmed by reading (no code change needed there).

**Task 3 — Test coverage (`tests/unit/audio/waveform-history.test.ts`, new file):**
- `rmsFromTimeDomain`: silence (`Uint8Array` filled with 128) → ~0; full-scale alternating 0/255 square wave → >0.95; empty buffer → defensive 0 (avoids NaN); a constant half-amplitude offset → proportional mid-range value.
- `normalizeAmplitude`: silence → exactly `MIN_BAR`; respects a custom `minBar` floor; clamps loud/over-driven input (rms up to 10) to `halfHeight`; monotonically non-decreasing as rms increases; never renders below the floor even for a tiny positive rms.
- `pushBar`: appends as the newest (last) element; drops the oldest once `maxBars` is exceeded; stays bounded across 20 repeated pushes into a 5-slot buffer; is immutable (input array reference and contents untouched after the call); `maxBars=1` edge case keeps only the newest value.
- 14 new test cases, all passing.

## Deviations from Plan

None — plan executed exactly as written. Two implementation details were left to the executor's judgment where the plan's Portuguese description was directional rather than prescriptive (documented above as decisions, not deviations): (1) buffer stores raw rms rather than pre-normalized pixel heights, and (2) the exact "partial buffer" alignment behavior (right-anchored, grows left as it fills) — both fully consistent with the plan's stated intent and the manual-verification checklist (bars scroll right-to-left following speech; silence = low dots; pause freezes; resume continues; stop/re-record clears).

## Auth Gates

None encountered.

## Verification

- `npx vitest run tests/unit/audio/ tests/unit/capture/` — **36/36 passed** (5 test files: the 14 new `waveform-history.test.ts` cases + 22 pre-existing capture tests, all still green).
- `npx tsc --noEmit` — output is byte-identical to the pre-change baseline (41 pre-existing, unrelated errors in billing/whatsapp/chat/estimate/observability test files — confirmed via a saved baseline + `diff`). Zero new errors from any touched or created file.
- `npx eslint` on all touched/created files (`waveform-visualizer.tsx`, `lib/audio/waveform-history.ts`, `capture-recorder.tsx`, `tests/unit/audio/waveform-history.test.ts`) — 0 new problems. `capture-recorder.tsx` retains exactly the same pre-existing 2 "Compilation Skipped" React Compiler errors + 3 `react-hooks/exhaustive-deps` warnings it had before this task (unrelated to the touched lines, confirmed identical to the pre-edit run).
- No pre-existing tests render `WaveformVisualizer`/`VoiceRecorder`/`CaptureRecorder` as a mounted component (jsdom has no `canvas` package installed, so `getContext('2d')` returns `null` and the effect no-ops — same behavior the previous implementation relied on), so there was no risk of breaking DOM-rendering tests; confirmed via `grep` across `tests/`.
- Browser preview was not exercised for this task — canvas rendering was validated by code review + the pure-helper unit tests, consistent with the plan's own "Verificação manual pós-deploy" section, which explicitly defers visual verification to after deploy.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `lib/audio/waveform-history.ts` (created)
- FOUND: `components/workspace/audio/waveform-visualizer.tsx` (rewritten)
- FOUND: `components/capture/capture-recorder.tsx` (modified — height 80→100, container w-full max-w-md)
- FOUND: `tests/unit/audio/waveform-history.test.ts` (created)
- FOUND commit `db3e5dbc`: feat(audio): scrolling amplitude-history waveform — rounded bars, freeze on pause, quiet idle
- FOUND commit `8abdbdc9`: feat(capture): waveform as the hero of the recording state (height/width)
- FOUND commit `d1d908f2`: test(audio): waveform history helpers coverage
