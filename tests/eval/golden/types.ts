/**
 * tests/eval/golden/types.ts
 *
 * SEED-057 Phase F: the golden set. Every case is SYNTHETIC and anonymised:
 * invented first names only, no addresses, phone numbers, emails or keys. A case
 * carries
 *   - the post-ingestion inputs (what the estimator would be handed),
 *   - the rubric expectations (sections, concepts, stated quantities, a total band,
 *     whether it must surface assumptions / open questions), and
 *   - a hand-written REFERENCE answer, which CI scores to keep the rubric honest
 *     (a rubric nobody validates drifts) and which a live run is compared against.
 *
 * Helper module (not a *.test.ts): never collected as a suite.
 */
import type { PlaybookId } from '@/lib/ai/playbooks'
import type { EstimateOutput } from '@/lib/ai/types'

export type GoldenLanguage = 'en' | 'pt'

/** A kind of line the estimate must contain, matched on any of the lowercase fragments. */
export interface ConceptExpectation {
  /** Shown in the failure message. */
  label: string
  /** Lowercase, accent-free substrings; any one inside an item description satisfies it. */
  any: string[]
}

/** A quantity the source states (or implies exactly), to be matched within a tolerance. */
export interface QuantityExpectation extends ConceptExpectation {
  value: number
  /** The canonical (US) unit the line must use, in every language. */
  unit?: string
  /** Defaults to 0.2 (plus or minus 20 percent). */
  tolerance?: number
}

export interface GoldenCase {
  id: string
  language: GoldenLanguage
  trade: PlaybookId
  description: string
  inputs: {
    transcripts: string[]
    photoDescriptions?: string[]
  }
  /** Set on the deliberately under-specified cases. */
  ambiguity?: 'missing_dimension' | 'unclear_scope'
  expect: {
    /** Lowercase words; each must appear in some section title. */
    sections: string[]
    concepts: ConceptExpectation[]
    quantities?: QuantityExpectation[]
    /** Inclusive band for the subtotal (sum of quantity x unit price, before tax). */
    total: [min: number, max: number]
    /** The model must have written at least one assumption. */
    needsAssumptions?: boolean
    /** The model must have raised at least one open question. */
    needsOpenQuestions?: boolean
  }
  reference: EstimateOutput
}
