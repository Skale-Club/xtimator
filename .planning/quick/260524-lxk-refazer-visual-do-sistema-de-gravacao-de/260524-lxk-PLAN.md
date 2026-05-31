---
quick_id: 260524-lxk
type: execute
wave: 1
depends_on: []
files_modified:
  - components/workspace/audio/waveform-visualizer.tsx
  - components/workspace/audio/voice-recorder.tsx
  - components/capture/capture-recorder.tsx
  - components/workspace/ai-input-group/ai-voice-dialog.tsx
  - components/workspace/estimate/refine-estimate-dialog.tsx
autonomous: true
requirements:
  - QUICK-LXK-01  # Shared VoiceRecorder with glass + glow brand visual language
  - QUICK-LXK-02  # WaveformVisualizer visual upgrade (gradient + glow + soft animation)
  - QUICK-LXK-03  # Plug shared VoiceRecorder into the 3 existing consumers without touching MediaRecorder lifecycle
must_haves:
  truths:
    - "All 3 voice surfaces (capture, ai-voice-dialog, refine-dialog) share the same visual language as text-describe.tsx (glass card + shadow-glow-brand on the mic)"
    - "Waveform shows a brand-gradient fill and a subtle glow while recording, and a calm idle baseline when not recording"
    - "Existing recording behavior is unchanged: getUserMedia permission errors, AudioContext on user gesture, Web Speech preview, 10-min hard cap in capture-recorder, 2-min cap in refine-dialog, cleanup on unmount/dialog close, beforeunload guard, track mute/inactive handlers"
    - "tsc and existing unit tests still pass with no API change to WaveformVisualizer"
  artifacts:
    - path: "components/workspace/audio/voice-recorder.tsx"
      provides: "Presentational shared VoiceRecorder (mic + waveform + timer) — does NOT own MediaRecorder"
      exports: ["VoiceRecorder"]
    - path: "components/workspace/audio/waveform-visualizer.tsx"
      provides: "Upgraded waveform (gradient bars, glow, soft idle animation) with unchanged API"
      contains: "WaveformVisualizer"
  key_links:
    - from: "components/capture/capture-recorder.tsx"
      to: "components/workspace/audio/voice-recorder.tsx"
      via: "JSX import in RecorderBody (replaces inline waveform + mic button block)"
      pattern: "import.*VoiceRecorder.*voice-recorder"
    - from: "components/workspace/ai-input-group/ai-voice-dialog.tsx"
      to: "components/workspace/audio/voice-recorder.tsx"
      via: "JSX import (replaces timer + waveform + circular mic block)"
      pattern: "import.*VoiceRecorder.*voice-recorder"
    - from: "components/workspace/estimate/refine-estimate-dialog.tsx"
      to: "components/workspace/audio/voice-recorder.tsx"
      via: "JSX import (replaces voice section UI; keeps photos section as-is)"
      pattern: "import.*VoiceRecorder.*voice-recorder"
---

<objective>
Refazer o visual do sistema de gravação de voz para usar a mesma linguagem **glass + brand glow** já estabelecida em `components/projects/text-describe.tsx` (Card variant="glass", `shadow-glow-brand`, `--gradient-brand`).

Criar UM componente compartilhado `VoiceRecorder` (puramente apresentacional — recebe `analyser`, `isRecording`, `elapsedMs`, `onToggle` + slots opcionais) e plugar nos três consumidores atuais. Melhorar o `WaveformVisualizer` com gradiente brand, glow sutil e baseline animado quando idle — preservando a API atual (`analyser`, `isRecording`, `height`).

**Não tocar** em nenhuma lógica de MediaRecorder / AudioContext / Web Speech / hard cap / permissões / cleanup. Toda a state machine de gravação continua nos consumidores (capture-recorder, ai-voice-dialog, refine-estimate-dialog).

Purpose: Os três pontos de gravação hoje têm tratamentos visuais inconsistentes e crus comparados ao resto do app já redesenhado (glass / glow). O refine-dialog é o mais feio. Unificar reduz divergência futura e melhora drasticamente a percepção de qualidade.

Output: 1 novo componente `voice-recorder.tsx`, 1 upgrade visual em `waveform-visualizer.tsx`, 3 consumidores plugando o novo componente.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/projects/text-describe.tsx
@components/ui/card.tsx
@components/workspace/audio/waveform-visualizer.tsx
@components/workspace/ai-input-group/ai-voice-dialog.tsx
@components/workspace/estimate/refine-estimate-dialog.tsx
@components/capture/capture-recorder.tsx

<design_tokens>
From app/globals.css (lines 307-405):
- `--glass-bg`, `--glass-bg-strong`, `--glass-bg-light`, `--glass-border` (light + dark scoped)
- `--gradient-brand` = `linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)`
- Utility classes: `.gradient-brand` (background-image), `.shadow-glow-brand` (box-shadow: var(--glow-brand))
- `Card variant="glass"` already wraps content with glass-bg + glass-border + backdrop-blur + shadow-glass

Reference patterns to mirror (from text-describe.tsx):
- Wrapping container: `<Card variant="glass" className="...">`
- Primary CTA: `<Button variant="primary" size="lg" className="...">` with gradient-brand background
- Focus state: `focus-visible:border-[hsl(var(--primary))] focus-visible:shadow-glow-brand`
</design_tokens>

<interfaces>
Current WaveformVisualizer API (MUST be preserved — verbatim signature):
```ts
interface WaveformVisualizerProps {
  analyser: AnalyserNode | null
  isRecording: boolean
  height?: number  // defaults to 96
}
export function WaveformVisualizer(props: WaveformVisualizerProps): JSX.Element
```

New VoiceRecorder API (presentational only, NO MediaRecorder ownership):
```ts
interface VoiceRecorderProps {
  // Required visual state — owned by parent
  analyser: AnalyserNode | null
  isRecording: boolean
  elapsedMs: number
  onToggle: () => void

  // Optional behavior knobs
  disabled?: boolean
  maxMs?: number              // for ring progress; if omitted, no ring rendered
  size?: 'sm' | 'md' | 'lg'   // sm = inline (refine dialog), md = dialog, lg = full-screen (capture)
  showTimer?: boolean         // default true
  helperText?: string         // e.g. "Tap to start recording" / "up to 2 min"
  className?: string

  // Optional slots for surface-specific extras (live transcript, "or" divider, etc.)
  belowWaveform?: React.ReactNode
  belowMic?: React.ReactNode
}
export function VoiceRecorder(props: VoiceRecorderProps): JSX.Element
```
The parent ALWAYS owns: getUserMedia, AudioContext, MediaRecorder, Speech Recognition, ticker, hard cap, cleanup, error toasts. VoiceRecorder ONLY paints pixels and calls `onToggle()` when the mic is tapped.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Visual upgrade to WaveformVisualizer (no API change)</name>
  <files>components/workspace/audio/waveform-visualizer.tsx</files>
  <action>
Upgrade the canvas drawing in `waveform-visualizer.tsx` while keeping the exported signature, props, and `data-testid="waveform-container"` EXACTLY as they are today.

Visual changes inside the `draw()` loop:

1. **Bar fill — brand gradient when recording, muted when idle.** Replace the flat `ctx.fillStyle = isRecording ? 'hsl(0, 84%, 60%)' : 'hsl(0, 0%, 70%)'` with a vertical `CanvasGradient` built from the CSS `--primary` and `--secondary` HSL triplets so the bars reflect `--gradient-brand`. Read the variables once per `draw()` via `getComputedStyle(canvas).getPropertyValue('--primary')` and `--secondary` (fall back to a hardcoded `224 86% 60%` and `200 95% 55%` if either returns empty — important for unit tests where CSS vars are not loaded). Build:
   ```ts
   const grad = ctx.createLinearGradient(0, 0, 0, height)
   grad.addColorStop(0, `hsl(${primary})`)
   grad.addColorStop(1, `hsl(${secondary})`)
   ```
   Use `grad` when `isRecording`. When idle, use `hsl(var(--muted-foreground) / 0.35)` equivalent — read `--muted-foreground` the same way, with fallback `215 16% 47%` at alpha `0.35`.

2. **Rounded bars + min height.** Replace `ctx.fillRect(x, y, barWidth, barHeight)` with a rounded-rect path using `ctx.roundRect(x, y, barWidth, barHeight, Math.min(2, barWidth / 2))` (supported in all modern browsers; iOS Safari 16+ OK). Bump min `barHeight` from 4 to 3 so idle baseline reads as a calm dotted line instead of chunky.

3. **Soft idle animation.** When `!isRecording`, animate a gentle sine wave so the bars don't all sit at exactly 3px (looks dead). Use `performance.now()` to derive a per-bar phase: `const phase = (now / 600) + i * 0.18; const idleAmp = (Math.sin(phase) + 1) / 2 * 6 + 3` and use `idleAmp` instead of the hard-coded `value = 128` branch. Keep amplitude small (max ~9px) so it's clearly "ambient" not "live".

4. **Glow underlay when recording.** Before drawing bars, when `isRecording`, paint a soft glow by setting `ctx.shadowColor = \`hsl(${primary} / 0.5)\`` and `ctx.shadowBlur = 8` on the gradient bar pass. Reset `ctx.shadowBlur = 0` for the idle pass.

5. **Container className.** Update the wrapper `<div>` to add `relative overflow-hidden` and keep `w-full data-testid="waveform-container"`. Keep the canvas as-is. Do NOT add Tailwind classes that depend on `dark:` because the gradient is read from CSS vars (which already scope per theme).

DO NOT change:
- Component name, export, props interface, default `height = 96`
- The ResizeObserver pattern
- The `requestAnimationFrame` / `cancelAnimationFrame` cleanup
- The `imageRendering: 'pixelated'` style on canvas
- `useEffect` deps array shape

Per CLAUDE.md secret rule: no secrets touched.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    User sanity: open any of the 3 recording surfaces, idle bars show subtle wave, recording bars show brand-gradient with glow. Check both light and dark themes.
  </verify>
  <done>
WaveformVisualizer renders rounded gradient bars with brand colors + glow while recording, calm sine-animated bars while idle, API unchanged, no tsc errors, `data-testid` preserved.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create shared VoiceRecorder presentational component</name>
  <files>components/workspace/audio/voice-recorder.tsx</files>
  <action>
Create a NEW file `components/workspace/audio/voice-recorder.tsx` with `'use client'` at the top. This component is **purely presentational** — it owns ZERO MediaRecorder / AudioContext / getUserMedia / Speech / timer logic. It only paints pixels and calls `props.onToggle()` when the mic button is tapped.

Implement the exact `VoiceRecorderProps` interface from `<interfaces>` above. Imports: `React`, `Mic`, `MicOff` from `lucide-react`, `WaveformVisualizer` from `'@/components/workspace/audio/waveform-visualizer'`, `Card` from `'@/components/ui/card'`, `cn` from `'@/lib/utils'`. Optional: `CircularProgressRing` from `'@/components/capture/circular-progress-ring'` only when `size === 'lg'` AND `maxMs` is provided.

Visual structure (per `size`):

- **`size="sm"`** (inline, used inside refine-dialog voice card): height-40 waveform row, small mic button (h-9 w-9 rounded-full) on the LEFT, waveform stretches to the right, timer (mm:ss) at far right in `font-mono text-xs text-muted-foreground`. No Card wrapper at this size (parent already has one).

- **`size="md"`** (used inside ai-voice-dialog): timer at top in `text-3xl font-mono text-foreground`, waveform middle (height=72), large circular mic button (h-16 w-16) centered below, helperText below mic in `text-xs text-muted-foreground`. Wrap the whole thing in `<Card variant="glass" className="p-6 space-y-4 items-center text-center">`.

- **`size="lg"`** (used inside capture-recorder full-screen): waveform full-width (height=80) at top, then timer slot (rendered ONLY if `showTimer` — capture passes its own `<CaptureTimer />` via `belowWaveform`, so default `showTimer` to `true` but capture-recorder will set it `false` and pass timer through `belowWaveform`), then the mic button wrapped in `CircularProgressRing` if `maxMs` provided (progress = `Math.min(elapsedMs / maxMs, 1)`), then helperText. Wrap in `<Card variant="glass" className="p-6 mx-auto w-full max-w-md flex flex-col items-center gap-4">`.

Mic button styling (shared across sizes, scale by `size`):
- When `isRecording`: `bg-red-500 animate-pulse hover:bg-red-600 text-white shadow-glow-brand`
- When idle: `gradient-brand text-primary-foreground hover:opacity-90 shadow-glow-brand`
- Always: `rounded-full flex items-center justify-center transition-all min-h-[44px] min-w-[44px]` and `disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`
- `aria-label` switches between "Stop recording" and "Start recording" (DO NOT call t() here — accept English strings; parents that want i18n can wrap their own helperText. Keep aria-label English; this is a presentational primitive)
- `data-testid="voice-recorder-mic"` always present (for parents that need to drive it from tests)

Render `belowWaveform` slot between waveform and mic (size md/lg), and `belowMic` slot below the helperText. These slots are how consumers inject surface-specific extras (live transcript preview, "or" divider, photos panel, etc.) without coupling them into this primitive.

Timer rendering: helper inline `function fmt(ms: number): string { const s = Math.floor(ms / 1000); const mm = Math.floor(s / 60); const ss = s % 60; return \`${mm}:${String(ss).padStart(2, '0')}\` }` — DO NOT import `formatDuration` (which takes seconds, not ms — would be a bug source).

Export named: `export function VoiceRecorder(props: VoiceRecorderProps)`.

DO NOT:
- Call `useState`, `useEffect`, `useRef` for any recording-related state (component is stateless apart from possibly memo'd computed values)
- Import MediaRecorder, AudioContext, or any speech API
- Add `disabled` logic beyond visual styling — `onToggle` is parent's responsibility to guard

Per CLAUDE.md: no secrets.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    Component compiles standalone, no runtime errors when imported (verified in Task 3).
  </verify>
  <done>
`components/workspace/audio/voice-recorder.tsx` exists, exports `VoiceRecorder`, supports `sm | md | lg`, renders waveform + mic + optional ring + slots, owns ZERO recording logic, tsc clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Plug VoiceRecorder into all 3 consumers (preserve every lifecycle line)</name>
  <files>components/workspace/ai-input-group/ai-voice-dialog.tsx, components/workspace/estimate/refine-estimate-dialog.tsx, components/capture/capture-recorder.tsx</files>
  <action>
Replace ONLY the visual JSX block in each of the three consumers. Every single `useRef`, `useEffect`, `useCallback`, `useState`, `mediaRecorderRef`, `audioContextRef`, `streamRef`, `chunksRef`, `mimeTypeRef`, `speechRecognitionRef`, `timerIntervalRef`/`tickIntervalRef`/`tickRef`, `startTimeRef`/`startedAtRef`, `teardown`/`teardownStream`/`stopRecording`, `startRecording`, `handleToggleRecording`, `runPipeline`, `handleGenerate`, `submit`, dialog `onOpenChange` close-mid-submit guard, `beforeunload` listener, track mute/inactive listener, `visibilitychange` listener, unmount cleanup, hard-cap auto-stop, permission error toast/setError, Web Speech API setup — **stays byte-for-byte intact**. We are swapping a paintbrush, not rewiring the engine.

---

**A) `components/workspace/ai-input-group/ai-voice-dialog.tsx`**

In the JSX returned (currently between `<DialogHeader>` close and `</DialogContent>`), find the `<div className="space-y-4">` block. Replace these three sibling blocks:
- `{/* Timer */}` div with the 3xl mono `formatDuration(duration)`
- `{/* Waveform */}` `<WaveformVisualizer analyser={analyser} isRecording={isRecording} />`
- `{/* Mic button (big circular toggle) */}` flex+button block

with a single:

```tsx
<VoiceRecorder
  size="md"
  analyser={analyser}
  isRecording={isRecording}
  elapsedMs={duration * 1000}
  onToggle={handleToggleRecording}
  disabled={isSubmitting || (!!audioBlob && !isRecording)}
  helperText={isRecording ? t('Tap to stop') : t('Tap to start recording')}
/>
```

Keep ALL siblings below (live transcript preview, after-stop Delete/Generate row, submission progress, error display) UNTOUCHED. Add `import { VoiceRecorder } from '@/components/workspace/audio/voice-recorder'`. Remove the now-unused `WaveformVisualizer` import IF no other usage remains in this file (grep first — there should be only the one site). Also remove the now-unused `Mic, MicOff` imports IF no other usage remains. KEEP `formatDuration` import — it's still used elsewhere? Grep within the file; if only that site used it, remove. Do NOT remove `Loader2, Sparkles, Trash2` — still used below.

NOTE: `duration` is in seconds in this file. VoiceRecorder takes ms. Multiply by 1000 at the prop site (do NOT change `duration` itself — too many sites depend on it).

---

**B) `components/workspace/estimate/refine-estimate-dialog.tsx`**

Find the `{/* Voice */}` block — the `<div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">` that wraps the Mic label + waveform-when-recording + Record/Stop/Re-record button + voice-note-ready row.

Replace that ENTIRE outer `<div>` (Voice section only — do NOT touch the Photos section below it) with:

```tsx
<Card variant="glass" className="p-4 space-y-3">
  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
    <Mic className="h-4 w-4" /> Voice note
    <span className="text-xs text-muted-foreground font-normal ml-auto">
      up to {maxSeconds}s
    </span>
  </div>
  <VoiceRecorder
    size="sm"
    analyser={analyser}
    isRecording={recState === 'recording'}
    elapsedMs={elapsedMs}
    onToggle={recState === 'recording' ? stopRecording : startRecording}
    disabled={isSubmitting}
    maxMs={MAX_AUDIO_MS}
  />
  {audioBlob && recState === 'idle' && (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">
        Voice note ready · {elapsedSeconds}s
      </span>
      <button
        type="button"
        onClick={() => { setAudioBlob(null); setElapsedMs(0) }}
        className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        disabled={isSubmitting}
      >
        Remove
      </button>
    </div>
  )}
</Card>
```

Imports: add `VoiceRecorder` from `'@/components/workspace/audio/voice-recorder'` and `Card` from `'@/components/ui/card'`. Remove `MicOff` import (no longer used after replacing the Record/Stop button). Keep `Mic` (still used for the section label). Keep `WaveformVisualizer` import only if still used elsewhere in file — grep; it is NOT (it was only in the voice block we just replaced), so remove that import too. The Photos `<div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">` block stays exactly as-is for now (out of scope; mention in summary that photos panel could be glass-wrapped later).

DO NOT touch: `MAX_AUDIO_MS` constant, `startRecording`, `stopRecording`, `submit`, photo handlers, `useEffect` cleanup, the `tickRef` 100ms interval with hard-cap auto-stop, `recorder.onstop` → setAudioBlob → teardownStream → setRecState('idle') sequence.

---

**C) `components/capture/capture-recorder.tsx`**

In the `RecorderBody` function (bottom of file), find the two blocks at the top:
1. `{/* Waveform — visualization for recording (D-08) */}` div with `<WaveformVisualizer analyser={analyser} isRecording={isRecording} height={80} />`
2. `{/* PRIMARY ACTION: Timer + Mic button — front and center... */}` `<div className="flex flex-col items-center gap-4 pt-4 pb-6">` containing `<CaptureTimer>`, `<CircularProgressRing>` wrapping the mic `<button>`, and the helper `<p>`.

Replace BOTH blocks with a single:

```tsx
<div className="px-4 pt-4 pb-2">
  <VoiceRecorder
    size="lg"
    analyser={analyser}
    isRecording={isRecording}
    elapsedMs={elapsedMs}
    onToggle={onToggle}
    maxMs={HARD_CAP_MS}
    showTimer={false}
    helperText={isRecording ? t('Tap to stop recording') : t('Tap to start recording')}
    belowWaveform={<CaptureTimer elapsedMs={elapsedMs} />}
  />
</div>
```

This wires:
- `maxMs={HARD_CAP_MS}` → VoiceRecorder renders the `CircularProgressRing` around the mic with the same progress math (`elapsedMs / HARD_CAP_MS`)
- `showTimer={false}` + `belowWaveform={<CaptureTimer ... />}` → keep the existing CaptureTimer (it owns the amber/red color thresholds D-07 we must not duplicate)
- `ringColorClass` and `progress` props on `RecorderBody` become unused — remove them from `RecorderBodyProps`, the destructure, AND the call site in the parent JSX (`<RecorderBody analyser={...} isRecording={...} elapsedMs={...} ringColorClass={ringColorClass} progress={progress} onToggle={...} ...>`). Also remove the `ringColorClass` and `progress` computation lines in the parent `CaptureRecorder` body (lines around `const ringColorClass = ...` and `const progress = ...`). **Wait** — the ring color logic (amber/red thresholds at AMBER_AT_MS / RED_AT_MS) IS visible state that should still drive ring color. Pass it through: extend `VoiceRecorder` is out-of-scope (we don't want to leak that into the primitive). Instead, **keep** `ringColorClass` + `progress` computation in capture-recorder, and pass a `ringColorClass` prop into VoiceRecorder via a new optional prop. Update Task 2 retroactively? NO — instead: add the ring directly here by NOT using `maxMs` and instead passing the existing CircularProgressRing through `belowWaveform` alongside CaptureTimer. Revised replacement:

```tsx
<div className="px-4 pt-4 pb-2">
  <VoiceRecorder
    size="lg"
    analyser={analyser}
    isRecording={isRecording}
    elapsedMs={elapsedMs}
    onToggle={onToggle}
    showTimer={false}
    helperText={isRecording ? t('Tap to stop recording') : t('Tap to start recording')}
    belowWaveform={
      <div className="flex flex-col items-center gap-4">
        <CaptureTimer elapsedMs={elapsedMs} />
        <CircularProgressRing
          progress={progress}
          size={120}
          strokeWidth={6}
          colorClass={ringColorClass}
        >
          {/* empty children — the mic is rendered by VoiceRecorder below */}
          <span className="sr-only">recording progress</span>
        </CircularProgressRing>
      </div>
    }
  />
</div>
```

Wait — that double-renders the mic. Resolution: in `size="lg"`, VoiceRecorder renders its OWN mic button. The existing CircularProgressRing wrapped the mic. We need EITHER the ring around the mic OR a separate progress indicator. Simpler answer: keep the existing CircularProgressRing around the VoiceRecorder's mic by NOT using VoiceRecorder's `size="lg"` for capture-recorder, but use `size="md"` and wrap the entire thing's mic externally. That's awkward too.

**Final approach** — keep it simple. In Task 2, the `size="lg"` variant renders the mic. In capture-recorder we want the ring around that mic with capture-specific `ringColorClass`. Add to VoiceRecorderProps (Task 2): `ringColorClass?: string` and `ringProgress?: number` (both optional). When both are provided AND `size === 'lg'`, render the mic wrapped in `<CircularProgressRing progress={ringProgress} size={120} strokeWidth={6} colorClass={ringColorClass}>{mic}</CircularProgressRing>` instead of bare mic.

So the capture-recorder replacement becomes:

```tsx
<div className="px-4 pt-4 pb-2">
  <VoiceRecorder
    size="lg"
    analyser={analyser}
    isRecording={isRecording}
    elapsedMs={elapsedMs}
    onToggle={onToggle}
    showTimer={false}
    ringProgress={progress}
    ringColorClass={ringColorClass}
    helperText={isRecording ? t('Tap to stop recording') : t('Tap to start recording')}
    belowWaveform={<CaptureTimer elapsedMs={elapsedMs} />}
  />
</div>
```

**Action item for Task 2:** add `ringColorClass?: string` and `ringProgress?: number` to `VoiceRecorderProps` AND in the `size="lg"` render, conditionally wrap the mic in CircularProgressRing when both are provided. Import `CircularProgressRing` from `'@/components/capture/circular-progress-ring'`. (This single coupling is acceptable — it's the canonical progress widget already.)

Imports to update in capture-recorder.tsx: add `VoiceRecorder` from `'@/components/workspace/audio/voice-recorder'`. KEEP `WaveformVisualizer`, `CaptureTimer`, `CircularProgressRing` imports — `WaveformVisualizer` is removed from JSX so check if any other usage; if none, remove it. `CaptureTimer` still passed via slot. `CircularProgressRing` is now used INSIDE VoiceRecorder, not directly here — remove the import.

Remove `Mic, MicOff` imports if no other usage in this file (the bare button block is gone; grep before removing — `MicOff` is used elsewhere? No, only in that block. `Mic`? Same. Remove both).

DO NOT touch: `HARD_CAP_MS / WARN_AT_MS / AMBER_AT_MS / RED_AT_MS` constants, `tick`, `stopRecording`, `startRecording`, `handleToggleRecording`, `runPipeline`, `triggerEstimateGeneration`, `handleGenerate`, all 4 `useEffect`s (visibility, beforeunload, track mute, unmount cleanup), `ringColorClass` and `progress` derivation (still consumed via props), the `OR` divider, textarea, photo input, EstimateLanguageSelector, Generate button below — all stay verbatim.

---

**After all 3 edits, run:**
```bash
npx tsc --noEmit
```
Must be clean.

Per CLAUDE.md: no secrets touched in this task.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx vitest run --reporter=dot 2>nul</automated>
    User sanity (manual, after `bun run dev`):
      1. /projects/[id]/capture → see glass card around waveform+ring+mic, brand-glow on idle mic, red pulsing mic when recording, 10-min hard cap still auto-stops, beforeunload prompt still fires on refresh mid-recording
      2. Project workspace → AI input group → voice dialog opens with glass card, big mic, live transcript preview still shows under the card while recording, Delete/Generate buttons still appear after stop, dialog cannot close mid-submit
      3. Estimate editor → "Refine with AI" → voice card now glass, small mic + waveform inline, 2-min cap still auto-stops, photos section unchanged
  </verify>
  <done>
All 3 surfaces visually unified (glass card + brand glow), `npx tsc --noEmit` clean, existing unit tests pass, every preserved-logic checklist item still works in manual sanity check.
  </done>
</task>

</tasks>

<verification>
1. **No lifecycle drift:** grep each consumer for `mediaRecorderRef`, `audioContextRef`, `streamRef`, `getUserMedia`, `MediaRecorder`, `Speech`, `beforeunload`, `visibilitychange`, `'mute'`, `HARD_CAP_MS`, `MAX_AUDIO_MS`, `teardown`, `revoked`, `NotAllowedError`, `NotFoundError` — every match present BEFORE this plan must still be present AFTER.
2. **WaveformVisualizer signature unchanged:** `grep -n "interface WaveformVisualizerProps" components/workspace/audio/waveform-visualizer.tsx` shows same 3 fields.
3. **VoiceRecorder is presentational only:** `grep -E "useEffect|useRef|useState|MediaRecorder|AudioContext|getUserMedia|Speech" components/workspace/audio/voice-recorder.tsx` returns NO matches for the engine APIs (useState/useRef may exist only for purely visual concerns; ideally zero).
4. **Three consumers import the new component:** `grep -l "from '@/components/workspace/audio/voice-recorder'" components/capture/capture-recorder.tsx components/workspace/ai-input-group/ai-voice-dialog.tsx components/workspace/estimate/refine-estimate-dialog.tsx` returns all three.
5. `npx tsc --noEmit` clean.
6. `npx vitest run` — no regressions (no tests touch waveform/voice components directly today, but make sure nothing imports symbols we removed).
</verification>

<success_criteria>
- One new file: `components/workspace/audio/voice-recorder.tsx` (presentational shared mic+waveform+timer with `sm | md | lg` sizes and brand-glow styling).
- `waveform-visualizer.tsx`: same API, visually upgraded (gradient bars, glow when recording, soft idle animation).
- Three consumers now render `<VoiceRecorder ... />` instead of inline mic/waveform/timer JSX.
- Zero behavioral changes: every MediaRecorder / AudioContext / Web Speech / hard cap / cleanup / permission-error / track-mute / beforeunload / visibilitychange code path is byte-for-byte preserved.
- All three surfaces visually consistent with `text-describe.tsx` (Card glass + shadow-glow-brand + gradient-brand on primary CTA).
- `npx tsc --noEmit` passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260524-lxk-refazer-visual-do-sistema-de-gravacao-de/260524-lxk-SUMMARY.md` summarizing:
- New `VoiceRecorder` API shape (final prop list including any additions during execution)
- Visual upgrades to `WaveformVisualizer`
- Notes about the photos panel in refine-estimate-dialog (still using old `border-border bg-muted/30` — flagged as future polish, not in this scope)
- Confirmation that no lifecycle code paths were touched
</output>
