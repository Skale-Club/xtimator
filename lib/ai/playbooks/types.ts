// lib/ai/playbooks/types.ts
//
// SEED-057 Phase B: a trade playbook is PLAIN DATA the business owner can
// review in a pull request. It tells the estimator how a given trade lays out
// an estimate (section order, what is always itemised, default exclusions,
// quantity formulas) and carries one compact worked example. The prompt builder
// (lib/ai/prompt-sections.ts) renders it; the structure score
// (lib/estimate/quality/structure-score.ts) and the company-history concept keys
// read the same data, so there is exactly one definition of "a good roofing
// estimate".

export type PlaybookId =
  | 'cleaning'
  | 'painting'
  | 'landscaping'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'roofing'
  | 'remodel'
  | 'general'

/** A line the trade almost always needs; the structure score looks for it. */
export interface MandatoryLine {
  /** Shown to the owner when the line is missing: "No disposal or haul-away line". */
  label: string
  /** Lowercase substrings; any one inside an item description satisfies it. */
  match: string[]
}

export interface ExampleItem {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  confidence: 'low' | 'medium' | 'high'
  /** Where the quantity comes from. */
  basis: string
}

export interface ExampleSection {
  title: string
  items: ExampleItem[]
}

export interface Playbook {
  id: PlaybookId
  /** Display name used in the prompt heading. */
  label: string
  /** Lowercase words/phrases that signal the trade in free text (en/pt/es). */
  keywords: string[]
  /** Lowercase company.industry / project_type values that map to this trade. */
  aliases: string[]
  /** Section titles in the order they should appear. */
  sections: string[]
  /** What must always be its own line when it applies. */
  alwaysItemise: string[]
  /** Scope that is excluded unless the walkthrough says otherwise. */
  defaultExclusions: string[]
  /** Typical unit per kind of task: [task, unit]. */
  units: Array<[task: string, unit: string]>
  /** Quantity formulas, one sentence each. */
  formulas: string[]
  /** Lines the structure score expects (prep, disposal, cleanup, permits...). */
  mandatory: MandatoryLine[]
  /**
   * Synonym groups used to collapse equivalent wording into one concept key
   * (company history, price research): every word in a group maps to the first.
   */
  synonyms: string[][]
  /** One compact worked example (5-8 items) showing the structure contract. */
  example: {
    scenario: string
    sections: ExampleSection[]
    assumptions: string[]
    exclusions: string[]
    openQuestion: string
  }
}
