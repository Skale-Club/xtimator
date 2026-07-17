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

/**
 * Phase 167 (BILL-02) — server-derived audio duration. Byte size is the ONLY
 * signal a dishonest client cannot lie about: declaring 1 second on a 10-minute
 * blob previously cost/debited/entitlement-checked against the DECLARED value
 * (round(0.045) = 0 credits — the v4.19 audit's D2 finding, "one credit funds
 * unlimited transcription").
 *
 * OPUS BLOCKER FIX: browsers record with NO `audioBitsPerSecond` configured —
 * the real bitrate is whatever the browser's own default happens to be,
 * commonly in the 64-128 kbps band (NOT a conservative-sounding 32 kbps). A LOW
 * assumed bitrate would make `byteEstimateMinutes` an OVER-estimate for honest
 * recordings, FALSELY up-clamping (and falsely rejecting via the BILL-06
 * entitlement cap) perfectly legitimate short clips. Therefore this derivation:
 *
 *   - Assumes the HIGH end of the plausible bitrate band (128_000 bps
 *     default) so `byteEstimateMinutes` is a conservative LOWER BOUND on the
 *     true audio duration — any real bitrate <=128k makes an honest declared
 *     duration >= byteEstimateMinutes (the byte estimate never over-claims
 *     against an honest declaration).
 *   - Clamps ONE-SIDED for billing purposes: `byteEstimateMinutes` is used
 *     ONLY when `declared < byteEstimateMinutes` (the under-declaration
 *     exploit — the 1s-on-10-min case). It NEVER up-clamps beyond a declared
 *     value that is already >= the byte estimate, and it NEVER down-clamps an
 *     over-declaration — declaring MORE than the true duration only costs the
 *     declarer, never the platform, so there is nothing to correct.
 *
 * Example: an honest 5-minute take encoded at 96 kbps has
 * byteEstimateMinutes ≈ 3.75 min < declared 5 min → 'declared' (safe, no
 * false clamp). The 1s-on-10-min exploit: declared ≈0.017 min vs
 * byteEstimateMinutes ≈2.5-10 min (any real bitrate) → 'byte_clamp' catches it
 * regardless of the true encoding bitrate.
 */
export interface DeriveAudioMinutesInput {
  /** Client-declared duration in seconds (recordings.duration_seconds). null/<=0 is treated as unknown. */
  declaredSeconds: number | null
  /** Downloaded audio blob size in bytes (the untrusted-client-proof signal). */
  blobBytes: number
  /** Assumed encoding bitrate in bits/sec. Default 128_000 — a conservative HIGH-end assumption (see file header). */
  bitrateBps?: number
}

export interface DeriveAudioMinutesResult {
  minutes: number
  /** 'byte_clamp' when the declared duration was replaced by the byte-derived floor (under-declaration). */
  source: 'declared' | 'byte_clamp'
}

/**
 * byteEstimateMinutes = blobBytes * 8 / bitrateBps / 60.
 * declared null/<=0 OR declared < byteEstimate → byteEstimate (source 'byte_clamp').
 * else → declared (source 'declared') — NEVER down-clamped, NEVER up-clamped beyond declared.
 */
export function deriveAudioMinutes(
  input: DeriveAudioMinutesInput
): DeriveAudioMinutesResult {
  const bitrateBps = input.bitrateBps ?? 128_000
  const byteEstimateMinutes = (input.blobBytes * 8) / bitrateBps / 60
  const declaredMinutes =
    typeof input.declaredSeconds === 'number' && input.declaredSeconds > 0
      ? input.declaredSeconds / 60
      : null

  if (declaredMinutes === null || declaredMinutes < byteEstimateMinutes) {
    return { minutes: byteEstimateMinutes, source: 'byte_clamp' }
  }
  return { minutes: declaredMinutes, source: 'declared' }
}
