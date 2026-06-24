/**
 * Phase 110 (COST-02): Whisper/STT cost is COMPUTED — the provider (OpenAI
 * whisper-1) returns only text, no usage/cost. cost = minutes × rate.
 *
 * The rate is a MODULE CONST this phase (env-overridable). Phase 111 (BILLCFG)
 * moves it into the runtime billing_config; this const becomes the fallback.
 * OpenAI whisper-1 list price ≈ $0.006/min — VERIFY before charging (CALIB-02).
 * Measure-only: this module computes the real cost only — no charging arithmetic.
 */
export const WHISPER_USD_PER_MINUTE = Number(
  process.env.WHISPER_USD_PER_MINUTE ?? '0.006'
)

/**
 * Returns USD cost for `durationSeconds` of audio, or null when the duration is
 * unknown/zero/invalid. NULL (not 0) so calibration can exclude unknowns from
 * the mean (null vs 0 discipline).
 */
export function computeWhisperCostUsd(
  durationSeconds: number | null | undefined
): number | null {
  const s = typeof durationSeconds === 'number' ? durationSeconds : 0
  if (!(s > 0)) return null
  return (s / 60) * WHISPER_USD_PER_MINUTE
}
