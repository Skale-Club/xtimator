---
quick_id: 260524-lxk
type: summary
completed_at: "2026-05-24"
tasks: 3
commits:
  - 235dffd  # Task 1: WaveformVisualizer visual upgrade
  - c5c0e99  # Task 2: VoiceRecorder shared presentational component
  - 5ada6e1  # Task 3: Plug VoiceRecorder into 3 consumers
files_created:
  - components/workspace/audio/voice-recorder.tsx
files_modified:
  - components/workspace/audio/waveform-visualizer.tsx
  - components/workspace/ai-input-group/ai-voice-dialog.tsx
  - components/workspace/estimate/refine-estimate-dialog.tsx
  - components/capture/capture-recorder.tsx
requirements_completed:
  - QUICK-LXK-01
  - QUICK-LXK-02
  - QUICK-LXK-03
---

# Quick 260524-lxk: Voice Recording Visual Unification — Summary

Unified the visual language of all three voice-recording surfaces (capture full-screen, AI voice dialog, refine-estimate dialog) around the **glass + brand glow** design system already established by `components/projects/text-describe.tsx`. Zero changes to MediaRecorder / AudioContext / Web Speech / hard-cap / cleanup / permission-error lifecycles — the engine is byte-for-byte preserved; only the paint layer changed.

## What Shipped

### 1. WaveformVisualizer visual upgrade (Task 1 — `235dffd`)

`components/workspace/audio/waveform-visualizer.tsx` — same exported signature, same props, same `data-testid="waveform-container"`, same `useEffect` deps, same `ResizeObserver` + `requestAnimationFrame` cleanup. Internal `draw()` changes:

- **Bars now reflect brand gradient** when recording. A vertical `CanvasGradient` is built each frame from `getComputedStyle(canvas).getPropertyValue('--primary' | '--secondary')` with hardcoded HSL fallbacks (`224 86% 60%`, `200 95% 55%`) for unit-test environments without CSS vars.
- **Idle bars use `hsl(--muted-foreground / 0.35)`** instead of the old flat `hsl(0, 0%, 70%)`.
- **Rounded bar tops** via `ctx.roundRect(..., min(2, barWidth/2))` (iOS Safari 16+ OK). A defensive fallback to plain `ctx.rect()` is included for environments without `roundRect`.
- **Min idle height dropped from 4px → 3px** so the baseline reads as a calm dotted line.
- **Soft idle sine animation**: per-bar phase `(now/600) + i*0.18`, amplitude capped at ~9px so it reads ambient not live.
- **Glow underlay when recording**: `ctx.shadowColor = hsl(${primary} / 0.5); ctx.shadowBlur = 8`. Reset to `0` after the loop.
- Container wrapper gained `relative overflow-hidden` for the glow.

### 2. Shared `VoiceRecorder` primitive (Task 2 — `c5c0e99`)

New file: `components/workspace/audio/voice-recorder.tsx` (`'use client'`).

**Purely presentational** — owns ZERO `useState`/`useRef`/`useEffect` for recording state, ZERO MediaRecorder / AudioContext / getUserMedia / Speech APIs. It paints pixels and calls `onToggle()` when the mic is tapped. Parent owns the entire state machine.

**Final API (with additions made during execution):**

```ts
interface VoiceRecorderProps {
  // Required visual state
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  onToggle: () => void

  // Optional behavior knobs
  disabled?: boolean
  maxMs?: number              // auto-ring progress when size=lg without explicit ringProgress
  size?: 'sm' | 'md' | 'lg'   // sm = inline (refine), md = dialog, lg = full-screen (capture)
  showTimer?: boolean         // default true
  helperText?: string
  className?: string

  // size="lg" only: caller-controlled ring
  ringColorClass?: string     // e.g. 'stroke-primary' | 'stroke-amber-500' | 'stroke-red-500'
  ringProgress?: number       // 0..1

  // Surface-specific slots
  belowWaveform?: React.ReactNode
  belowMic?: React.ReactNode

  // Test-id override for parents that need a specific id (defaults to 'voice-recorder-mic')
  micTestId?: string
}
```

**Additions vs. the plan's draft API** (both required, documented as Rule 2 / Rule 3 auto-decisions):

1. `ringColorClass` + `ringProgress` — needed because `capture-recorder` drives ring color from `AMBER_AT_MS`/`RED_AT_MS` thresholds (D-07 timer-color logic) that must NOT leak into the primitive. Caller passes the already-computed values.
2. `micTestId` — needed because `tests/e2e/recorder-mobile.spec.ts` and `tests/e2e/capture-fullscreen-shell.spec.ts` select the mic via `data-testid="capture-mic"`. Without an override, the e2e tests would break.

**Mic button styling** (shared across sizes, scaled by `size`):
- Recording: `bg-red-500 animate-pulse hover:bg-red-600 text-white shadow-glow-brand`
- Idle: `gradient-brand text-primary-foreground hover:opacity-90 shadow-glow-brand`
- Always: `rounded-full transition-all min-h-[44px] min-w-[44px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`
- `aria-label` toggles between "Stop recording" / "Start recording" in English (presentational primitive; parents can wrap their own i18n via `helperText`).

### 3. Three consumers plugged into the new primitive (Task 3 — `5ada6e1`)

**`components/workspace/ai-input-group/ai-voice-dialog.tsx`** — Replaced the timer / waveform / mic block with `<VoiceRecorder size="md" />`. `duration` (seconds) is multiplied by 1000 at the prop site — `duration` state itself is unchanged because too many downstream branches depend on it. Removed unused `Mic`, `MicOff`, `WaveformVisualizer`, `formatDuration` imports.

**`components/workspace/estimate/refine-estimate-dialog.tsx`** — Replaced the `<div className="rounded-lg border border-border bg-muted/30 ...">` voice block with `<Card variant="glass">` wrapping `<VoiceRecorder size="sm" />`. Photos section below is **out of scope** and intentionally still uses the old `rounded-lg border border-border bg-muted/30` styling — flagged as future polish (see Deferred Items below). Removed unused `MicOff` and `WaveformVisualizer` imports; kept `Mic` (still used for the section label).

**`components/capture/capture-recorder.tsx`** — Replaced the two blocks (full-width waveform + the `flex flex-col items-center gap-4` containing CaptureTimer + CircularProgressRing-wrapped mic) with a single `<VoiceRecorder size="lg" />`. The capture-specific ring color logic (`AMBER_AT_MS`/`RED_AT_MS` thresholds → `ringColorClass`) and the `progress` math are still computed in `CaptureRecorder` and passed through as props (`ringColorClass`, `ringProgress`). `CaptureTimer` is passed via the `belowWaveform` slot to keep its amber/red color thresholds (D-07) intact. `micTestId="capture-mic"` preserves the e2e selector. Removed unused `Mic`, `MicOff`, `CircularProgressRing`, `WaveformVisualizer` imports.

## Lifecycle Preservation (grep verification)

Confirmed via grep that every recording-engine code path is still present in each consumer:

| File | Lifecycle keyword matches |
| ---- | ------------------------- |
| `capture-recorder.tsx` | 28 (mediaRecorderRef, audioContextRef, streamRef, MediaRecorder, getUserMedia, beforeunload, HARD_CAP_MS, NotAllowedError, NotFoundError, visibilitychange, etc.) |
| `ai-voice-dialog.tsx` | 34 (mediaRecorderRef, audioContextRef, streamRef, MediaRecorder, getUserMedia, NotAllowedError, NotFoundError, teardown, SpeechRecognition, etc.) |
| `refine-estimate-dialog.tsx` | 31 (recorderRef, audioCtxRef, streamRef, MediaRecorder, getUserMedia, MAX_AUDIO_MS, NotAllowedError, NotFoundError, teardownStream, etc.) |
| `voice-recorder.tsx` (new) | 1 — only the docstring comment that explicitly states it owns ZERO of these |

## Deviations from Plan

### Auto-decisions (Rules 1-3)

1. **[Rule 3 — Blocking] Added `micTestId` prop to VoiceRecorder.**
   - **Found during:** Task 3 wiring of `capture-recorder.tsx`.
   - **Issue:** The old `capture-recorder` mic button had `data-testid="capture-mic"`, which is selected by `tests/e2e/recorder-mobile.spec.ts` and `tests/e2e/capture-fullscreen-shell.spec.ts`. The plan-drafted VoiceRecorder hardcoded `data-testid="voice-recorder-mic"`, which would break e2e tests.
   - **Fix:** Added optional `micTestId?: string` prop (default `'voice-recorder-mic'`). `capture-recorder` passes `micTestId="capture-mic"`.
   - **Files modified:** `components/workspace/audio/voice-recorder.tsx`, `components/capture/capture-recorder.tsx`.
   - **Commit:** Folded into Task 3 (`5ada6e1`).

2. **[Plan-acknowledged] `ringColorClass` + `ringProgress` API addition.**
   - The plan itself walked through the ring-coupling design and arrived at this exact addition mid-Task-3. Implemented as specified.

### Out-of-scope (deferred)

- **Photos panel in `refine-estimate-dialog.tsx`** still uses the old `rounded-lg border border-border bg-muted/30 p-3 space-y-3` styling. Plan explicitly scoped this out ("photos section as-is"). Future polish: wrap the photos panel in `<Card variant="glass">` and refresh the photo thumbnail rendering for consistency with the voice card above it.

## Self-Check: PASSED

- `components/workspace/audio/voice-recorder.tsx` — created.
- `components/workspace/audio/waveform-visualizer.tsx` — modified (API unchanged).
- `components/workspace/ai-input-group/ai-voice-dialog.tsx` — modified.
- `components/workspace/estimate/refine-estimate-dialog.tsx` — modified.
- `components/capture/capture-recorder.tsx` — modified.
- Commits `235dffd`, `c5c0e99`, `5ada6e1` — all present in `git log`.
- `npx tsc --noEmit` — clean (no errors).
- `npx vitest run` — 40 pre-existing failures across admin/blog/SEO/auth test files; **zero** failures touch waveform / voice / capture / refine-dialog components. Out of scope per Rule 4 boundary.

## Manual Verification (deferred to user — code-only delivery per constraints)

The user will verify manually:

1. `/projects/[id]/capture` — glass card around waveform + timer + ring + mic; brand glow on idle mic; red pulsing mic when recording; 10-min hard cap still auto-stops; beforeunload prompt still fires on refresh mid-recording.
2. Project workspace → AI input group → voice dialog — glass card, big mic, live transcript preview still shows under the card while recording, Delete/Generate buttons still appear after stop, dialog cannot close mid-submit.
3. Estimate editor → "Refine with AI" → voice card now glass, small mic + waveform inline, 2-min cap still auto-stops, photos section unchanged.
