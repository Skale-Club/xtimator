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

export type EstimateOutput = {
  suggested_project_name: string
  suggested_client_name?: string | null
  summary: string
  notes?: string
  timeline?: string
  payment_terms?: string
  warranty_terms?: string
  sections: EstimateSectionOutput[]
}

export type EstimateInput = {
  industry: string | null
  projectName: string
  projectType: string | null
  targetBudget: number | null
  clientName: string | null
  clientAddress: string | null
  transcripts: string[]
  photoDescriptions: string[]
  priceBookItems: PriceBookEntry[]  // empty array = no injection (D-10)
  currencyCode?: string
  defaultPaymentTerms: string | null
  defaultWarrantyTerms: string | null
  /**
   * Phase 52 (SEED-016): target language for AI-generated copy.
   * Defaults to 'en'. EstimateOutput must be in this language.
   */
  language?: 'en' | 'pt' | 'es'
}

export type RefineEstimateInput = {
  existingEstimate: EstimateOutput  // Current estimate structure
  instruction: string               // User's refinement request
  priceBookItems: PriceBookEntry[]  // Company's price book
  currencyCode?: string
}
