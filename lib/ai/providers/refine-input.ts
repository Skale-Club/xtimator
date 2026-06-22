// lib/ai/providers/refine-input.ts
//
// HARD-02 / UNIFY-02 — single mapping from RefineEstimateInput to an
// EstimateInput-shaped object so the SHARED prompt builder gets the same
// language/industry/price-book context refine and generate both rely on.
//
// Shared by all live adapters (openrouter/gemini/anthropic) so the refine path
// builds its builder input ONE way — no per-adapter drift. Plan 101-03's refine
// node resolves and threads language/industry/currencyCode/priceBookItems from
// companyId; the optional fields default safely when a caller omits them.
import type { EstimateInput, RefineEstimateInput } from '../types'

export function toRefineEstimateInput(input: RefineEstimateInput): EstimateInput {
  return {
    industry: input.industry ?? null,
    projectName: input.projectName ?? 'Estimate',
    projectType: null,
    targetBudget: null,
    clientName: null,
    clientAddress: null,
    transcripts: [],
    photoDescriptions: [],
    prompts: [],
    priceBookItems: input.priceBookItems,
    currencyCode: input.currencyCode,
    defaultPaymentTerms: null,
    defaultWarrantyTerms: null,
    language: input.language,
  }
}
