// lib/ai/types.ts
import type { EstimateOutput } from './schema'

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
  price_source: 'price_book' | 'ai_estimate' | 'researched'  // D-03: required on every item; 'researched' added in Phase 105 (v4.6, dormant until Phase 108)
  // TAX-02 — optional per-item classification input mirroring lineItemSchema. The AI
  // labels labor vs materials; omission is valid (server defaults taxable=true in Plan 130-02).
  taxable?: boolean
  tax_category?: 'labor' | 'materials' | 'other' | null
  // DISC-01 — optional per-item line discount INPUT (amount), mirroring lineItemSchema.
  discount?: number
  // MARK-01 — optional per-item cost + markup_pct INPUTS mirroring lineItemSchema. The AI
  // supplies cost + markup; the SERVER derives unit_price = round2(cost × (1 + markup_pct/100)).
  cost?: number
  markup_pct?: number
}

export type EstimateSectionOutput = {
  title: string
  items: LineItemOutput[]
}

// EstimateOutput is single-sourced from the zod schema (GUARD-01) — imported at the
// top and re-exported here so every existing `import { EstimateOutput } from './types'`
// keeps working while the schema in `./schema.ts` remains the only definition (the
// validator and the type can never drift). LineItemOutput / EstimateSectionOutput
// above stay as the structurally-compatible item/section shapes used by callers.
export type { EstimateOutput }

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
  /**
   * GUARD-01 schema-repair hint. Set ONLY by the schema-retry seam
   * (provider-with-fallback.ts) on the single corrective re-call after the first
   * invalid output. When present, the adapter appends it to the user content it
   * builds. Absent on the happy path (valid first time = no hint, no retry).
   */
  retryHint?: string
  /**
   * Phase 110 (COST-01): non-LLM correlation context for cost capture. NEVER
   * derived from model output — threaded from the Inngest job through the graph
   * state → generate node → service. Absent → cost is still recorded with null
   * ids. Rides INSIDE EstimateInput so the AIProvider.generateEstimate signature
   * stays unchanged.
   */
  costContext?: {
    attemptId?: string | null
    companyId?: string | null
    projectId?: string | null
  }
}

export type RefineEstimateInput = {
  existingEstimate: EstimateOutput  // Current estimate structure
  instruction: string               // User's refinement request
  priceBookItems: PriceBookEntry[]  // Company's price book
  currencyCode?: string
  /**
   * GUARD-01 schema-repair hint (see EstimateInput.retryHint). Set only by the
   * schema-retry seam on the single corrective re-call; appended to user content.
   * Refine inherits the same retry seam in Phase 101 for free.
   */
  retryHint?: string
  /**
   * Phase 101 (HARD-02/UNIFY-02): builder-relevant company context the refine node
   * (101-03) threads from companyId so the shared prompt builder gets the same
   * language/industry/project context as generate — the strongest UNIFY-02
   * equivalence. All OPTIONAL and additive (non-breaking for existing callers).
   */
  industry?: string | null
  language?: 'en' | 'pt' | 'es'
  projectName?: string
  /**
   * Fix (refine credit attribution): non-LLM correlation context for cost
   * capture, mirroring EstimateInput.costContext above. NEVER derived from
   * model output — threaded from the refine route through the graph state →
   * refine node → provider so the OpenRouter/Gemini adapter can attribute the
   * captured real cost to the refine request's own attemptId/companyId instead
   * of a random id + null companyId. Absent → cost is still recorded, just
   * uncorrelated (pre-fix behavior).
   */
  costContext?: {
    attemptId?: string | null
    companyId?: string | null
    projectId?: string | null
  }
}
