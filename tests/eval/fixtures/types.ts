/**
 * tests/eval/fixtures/types.ts
 *
 * EVAL-01 — typed golden-fixture schema. A self-contained, no-network dataset
 * modelled at the POST-INGESTION boundary: each case carries the (already
 * transcribed / vision-analyzed) inputs plus the raw create_estimate tool JSON
 * the mocked provider returns, and the quality thresholds the engine output must
 * meet. Synthetic data ONLY (no real PII/keys → gitleaks-safe).
 *
 * Helper module (NOT a *.test.ts) — never collected as a suite by the vitest
 * `include` glob (which is scoped to tests/eval/**\/*.test.ts).
 */

/** A single golden eval case. */
export interface EvalCase {
  /** Stable identifier, used as the describe.each label and the mock key. */
  id: string
  /** Which input modality this case exercises. */
  modality: 'audio' | 'photo' | 'text' | 'mixed'
  /** Human-readable description of the scenario. */
  description: string
  /** Post-ingestion inputs fed to the real engine (deterministic, no network). */
  inputs: {
    /** Audio-derived transcripts (post-Whisper / post-transcribeAudioOR). */
    transcripts?: string[]
    /** Vision-derived photo descriptions (post-analyzePhotoOR). */
    photoDescriptions?: string[]
    /** Raw text / "describe in your own words" prompts. */
    texts?: string[]
  }
  /**
   * The raw create_estimate tool JSON the mocked provider returns (pre-normalize).
   * Intentionally loose (Record<string, unknown>) so the schema metric genuinely
   * validates it — a fixture that drifts from estimateOutputSchema is CAUGHT.
   */
  providerResponse: Record<string, unknown>
  /** The quality thresholds this case's output must meet. */
  expected: {
    /** estimateOutputSchema.safeParse(providerResponse).success */
    schemaValid: boolean
    /** persisted estimate must have >= this many line items across sections */
    minLineItems: number
    /** server-recalculated grand total must be > 0 */
    positiveTotal: boolean
    /** isVagueEstimate verdict on the persisted estimate */
    isVague: boolean
  }
}
