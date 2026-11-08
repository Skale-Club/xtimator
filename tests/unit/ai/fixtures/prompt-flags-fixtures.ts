import type { EstimateInput } from '@/lib/ai/types'

/** Fixtures for the flags-off byte-identity test (Phase 4a). */
export const FULL_INPUT: EstimateInput = {
  industry: 'roofing',
  projectName: 'Smith Roof',
  projectType: 'Roofing',
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: '12 Oak St',
  transcripts: ['Tear off the old shingles on the garage roof and install new architectural shingles. About 900 sq ft.'],
  photoDescriptions: ['Garage roof, curled shingles, one vent pipe'],
  prompts: ['Please include ridge vent'],
  priceBookItems: [
    { name: 'Architectural shingles install', unit: 'sq ft', unit_price: 5.5, folder_name: 'Roofing', currency_code: 'USD' },
    { name: 'Interior painting', unit: 'sq ft', unit_price: 2.1, folder_name: 'Painting', currency_code: 'USD' },
    { name: 'Dumpster rental', unit: 'each', unit_price: 450, folder_name: null, currency_code: 'USD' },
  ] as EstimateInput['priceBookItems'],
  currencyCode: 'USD',
  language: 'en',
  aiBlocks: { timeline: true, notes: false },
  knowledge: [{ title: 'House rule', body: 'Minimum charge 500' }],
  qualityHints: ['Add a disposal line'],
  extraInstructions: 'WhatsApp addendum text',
}

export const FIXTURES: Record<string, { input: EstimateInput; mode: 'generate' | 'refine' }> = {
  generateFull: { input: FULL_INPUT, mode: 'generate' },
  refineFull: { input: FULL_INPUT, mode: 'refine' },
  generateNoBook: { input: { ...FULL_INPUT, priceBookItems: [], knowledge: undefined, qualityHints: undefined, extraInstructions: undefined }, mode: 'generate' },
}
