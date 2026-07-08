/**
 * Pure helpers for the scrolling amplitude-history waveform (260707-shg).
 *
 * Kept side-effect free and canvas/DOM-agnostic on purpose: WaveformVisualizer
 * (components/workspace/audio/waveform-visualizer.tsx) is the only caller,
 * but living in `lib/` lets these be unit tested without jsdom/AudioContext
 * mocking.
 *
 * Rendering model:
 * - `rmsFromTimeDomain` reduces one analyser frame to a single 0..1 amplitude.
 * - The visualizer accumulates the PEAK rms seen over a BAR_INTERVAL_MS
 *   window, then commits it as one bar via `pushBar` — this is what turns a
 *   60fps oscilloscope into a much slower, readable amplitude history (like
 *   iOS Voice Memos / WhatsApp), instead of redrawing every frame.
 * - `normalizeAmplitude` converts a raw rms value into a pixel bar height at
 *   DRAW time (not at commit time), so the history buffer stores
 *   resolution-independent 0..1 values that stay correct if the canvas is
 *   resized.
 */

/** Bar geometry (px): width of each bar and the gap between consecutive bars. */
export const BAR_WIDTH = 3
export const BAR_GAP = 3

/** Minimum rendered bar height (px) — keeps silence visible as a small dot. */
export const MIN_BAR = 2

/** How often (ms) a new bar is committed to the history buffer. */
export const BAR_INTERVAL_MS = 60

/** Exaggerates quiet signal before the soft power curve so speech reads clearly. */
const AMPLITUDE_BOOST = 4

/** Soft compression curve exponent — brings up quiet sounds without blowing out loud ones. */
const AMPLITUDE_CURVE = 0.8

/**
 * RMS amplitude (0..1) from a Uint8Array time-domain buffer (values 0-255,
 * centered on 128 for silence: `getByteTimeDomainData` output).
 */
export function rmsFromTimeDomain(data: Uint8Array): number {
  if (data.length === 0) return 0
  let sumSquares = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sumSquares += v * v
  }
  return Math.sqrt(sumSquares / data.length)
}

/**
 * Normalizes a raw RMS value (0..1, typically from `rmsFromTimeDomain`) into
 * a bar height in px, clamped to `halfHeight` (bars are drawn centered on the
 * canvas's vertical midline, so a bar's pixel height can never exceed half
 * the canvas height without clipping). A soft power curve makes quiet sounds
 * more visible without letting loud sounds blow out the top; `minBar` keeps
 * near-silence rendered as a small visible dot rather than nothing.
 */
export function normalizeAmplitude(rms: number, halfHeight: number, minBar: number = MIN_BAR): number {
  const boosted = Math.min(Math.max(rms, 0) * AMPLITUDE_BOOST, 1)
  const h = Math.pow(boosted, AMPLITUDE_CURVE) * halfHeight
  return Math.max(minBar, Math.min(h, halfHeight))
}

/**
 * Appends a new bar value to the circular history buffer, dropping the
 * oldest entries once `maxBars` is exceeded (the scrolling effect — newest
 * value is always the LAST element). Immutable: returns a new array, never
 * mutates `buffer`.
 */
export function pushBar(buffer: number[], value: number, maxBars: number): number[] {
  const next = buffer.concat(value)
  if (next.length > maxBars) {
    return next.slice(next.length - maxBars)
  }
  return next
}
