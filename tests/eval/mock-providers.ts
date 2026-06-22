/**
 * tests/eval/mock-providers.ts
 *
 * EVAL-02 — deterministic provider mocks. The harness mocks ONLY the provider
 * seam (getAIProviderWithFallback) + the raw-binary ingestion seam
 * (transcribeAudioOR/analyzePhotoOR); the REAL service + graph + Phase-100
 * normalize/schema/anchoring/totals run. Outputs are keyed by the ACTIVE case so
 * the per-case runner can set which fixture's providerResponse is returned before
 * invoking the engine.
 *
 * Helper module (NOT a *.test.ts) — never collected as a suite.
 */
import type { AIProvider } from '@/lib/ai/provider.interface'
import type { EstimateOutput } from '@/lib/ai/types'
import type { EvalCase } from './fixtures/types'

/**
 * Module-scope "active case" — the per-case runner sets this immediately before
 * invoking the real engine; the mock provider reads it to return the right
 * fixture's providerResponse. Single-threaded per test file, reset per case.
 */
let activeCase: EvalCase | null = null

export function setActiveCase(c: EvalCase | null): void {
  activeCase = c
}

export function getActiveCase(): EvalCase | null {
  return activeCase
}

/** The provider returns the active case's raw create_estimate JSON as EstimateOutput. */
function currentResponse(): EstimateOutput {
  if (!activeCase) {
    throw new Error('mock-providers: no active eval case set before engine invoke')
  }
  // The provider seam returns an already-EstimateOutput-typed result (schema runs
  // inside the real adapter in prod; here we supply the fixture JSON directly).
  return activeCase.providerResponse as unknown as EstimateOutput
}

/** Deterministic AIProvider keyed by the active fixture. */
export function makeMockProvider(): AIProvider {
  return {
    async generateEstimate(): Promise<EstimateOutput> {
      return currentResponse()
    },
    async refineEstimate(): Promise<EstimateOutput> {
      return currentResponse()
    },
  }
}

/** Deterministic transcribe stub (only used if a case exercises raw-audio ingestion). */
export async function mockTranscribeAudioOR(): Promise<string> {
  return activeCase?.inputs.transcripts?.join('\n') ?? ''
}

/** Deterministic photo-analysis stub (only used if a case exercises raw-photo ingestion). */
export async function mockAnalyzePhotoOR(): Promise<string> {
  return activeCase?.inputs.photoDescriptions?.join('\n') ?? ''
}
