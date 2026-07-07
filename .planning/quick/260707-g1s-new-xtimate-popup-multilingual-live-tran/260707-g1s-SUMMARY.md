---
phase: quick-260707-g1s
plan: 01
subsystem: capture
tags: [ui, speech-recognition, i18n, recorder-popup]
requires: []
provides:
  - "Device-locale live transcript preview in New Xtimate recorder popup"
  - "Conditional blank-estimate CTA (hidden while typing/recording)"
affects: [components/capture/capture-recorder.tsx]
tech-stack:
  added: []
  patterns:
    - "Web Speech API live preview language driven by navigator.language (device/spoken), decoupled from estimate output language"
key-files:
  created: []
  modified:
    - components/capture/capture-recorder.tsx
decisions:
  - "Live transcript preview follows navigator.language, independent of estimateLanguage (which controls only generated output)"
  - "Blank-estimate CTA render-gated on !descriptionText.trim() && !isRecording (no new props — both already in RecorderBody scope)"
metrics:
  duration: "~8m"
  completed: 2026-07-07
requirements: [QUICK-g1s-01, QUICK-g1s-02]
---

# Phase quick-260707-g1s Plan 01: New Xtimate Popup Multilingual Live Transcript + Conditional Blank-Estimate CTA Summary

Two surgical, in-style edits to `components/capture/capture-recorder.tsx`: the Web Speech API live-transcript preview now follows the user's device/spoken language via `navigator.language` (instead of being hard-locked to the estimate OUTPUT language), and the "Or start with a blank estimate" button is hidden once the user starts typing or while recording — giving the free-writing textarea the full canvas.

## What Was Built

**Fix 1 — Multilingual live preview (inside `startRecording`, ~line 918):**
Replaced `recognition.lang = estimateLanguage === 'pt' ? 'pt-BR' : estimateLanguage === 'es' ? 'es-ES' : 'en-US'` with `recognition.lang = navigator.language || 'en-US'`. Updated the adjacent comment to explain the preview follows the device/spoken language, independent of `estimateLanguage`. The code path is browser-only (guarded upstream by `navigator.mediaDevices`), so no SSR guard is needed. This shared `startRecording` serves both the horizontal and stacked layouts, so both benefit.

**Fix 2 — Conditional blank-estimate CTA (RecorderBody `isHorizontal`, ~line 1135):**
Changed the render gate from `{onStartBlank && (` to `{onStartBlank && !descriptionText.trim() && !isRecording && (`. Inner `<div>`/`<button>` markup unchanged. `descriptionText` and `isRecording` were already destructured in the `RecorderBody` signature (line 1117), so no new props were introduced.

## Tasks Completed

| Task | Name                                                             | Commit    | Files                                   |
| ---- | --------------------------------------------------------------- | --------- | --------------------------------------- |
| 1    | Multilingual live preview + conditional blank-estimate button   | 992f54d7  | components/capture/capture-recorder.tsx |

## Verification

- **grep (Fix 1):** `919:        recognition.lang = navigator.language || 'en-US'` — present.
- **grep (Fix 2):** `1135:           {onStartBlank && !descriptionText.trim() && !isRecording && (` — present.
- **eslint:** `npx eslint components/capture/capture-recorder.tsx` → 5 problems (2 errors, 3 warnings). Baseline HEAD version had 6 problems (3 errors, 3 warnings). **Zero new lint problems introduced** — in fact one fewer, since removing the `estimateLanguage` reference cleared a pre-existing missing-dependency flag. All remaining errors/warnings are pre-existing React Compiler `preserve-manual-memoization` / `exhaustive-deps` issues on `tick` (351), a `useEffect` (397), and `startRecording` (862) relating to the `t` translation function — unrelated to this task and out of scope.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Notes

- Server-side transcription (`lib/inngest/functions/transcribe-audio.ts`, `lib/ai/openrouter-client.ts`) and the stacked (non-horizontal) layout markup were intentionally left untouched, per plan scope.
- Manual sanity check (optional, not blocking): with estimate output set to English but speaking another language, the live preview should follow the spoken language; typing in the textarea or recording hides the blank-estimate button; clearing the textarea (when not recording) shows it again.

## Self-Check: PASSED

- FOUND: components/capture/capture-recorder.tsx
- FOUND commit: 992f54d7
