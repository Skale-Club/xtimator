// lib/ai/types.ts

export type PriceBookEntry = {
  folder_name: string | null
  name: string
  unit: string | null
  unit_price: number
  currency_code?: string | null
}

export type LineItemOutput = {
  description: string
  quantity: number
  unit?: string
  unit_price: number
  price_source: 'price_book' | 'ai_estimate'  // D-03: required on every item
}

export type EstimateSectionOutput = {
  title: string
  items: LineItemOutput[]
}

// EstimateOutput is single-sourced from the zod schema (GUARD-01). Re-exporting it
// here keeps every existing `import { EstimateOutput } from './types'` working while
// the schema in `./schema.ts` remains the only definition — the validator and the
// type can never drift. LineItemOutput / EstimateSectionOutput above stay as the
// structurally-compatible item/section shapes used by callers and normalize.
export type { EstimateOutput } from './schema'

export type EstimateInput = {
  industry: string | null
  projectName: string
  projectType: string | null
  targetBudget: number | null
  clientName: string | null
  clientAddress: string | null
  transcripts: string[]
  photoDescriptions: string[]
  /**
   * Free-form text prompts from non-recording inputs (MCP `create_estimate` tool,
   * WhatsApp text messages, future "describe in your own words" UI). Treated as
   * additional context alongside transcripts + photo descriptions.
   * (Phase 89 deferral closed 2026-05-27.)
   */
  prompts?: string[]
  priceBookItems: PriceBookEntry[]  // empty array = no injection (D-10)
  currencyCode?: string
  defaultPaymentTerms: string | null
  defaultWarrantyTerms: string | null
  /**
   * Phase 52 (SEED-016): target language for AI-generated copy.
   * Defaults to 'en'. EstimateOutput must be in this language.
   */
  language?: 'en' | 'pt' | 'es'
  /**
   * Admin-configured, platform-wide WhatsApp-only system prompt addendum.
   * Appended to the base system prompt by buildSystemPrompt(), AFTER the
   * price-book block and BEFORE the Security block. Only set for WhatsApp-channel
   * estimate generation; null/undefined for web + MCP.
   */
  extraInstructions?: string
}

export type RefineEstimateInput = {
  existingEstimate: EstimateOutput  // Current estimate structure
  instruction: string               // User's refinement request
  priceBookItems: PriceBookEntry[]  // Company's price book
  currencyCode?: string
}
