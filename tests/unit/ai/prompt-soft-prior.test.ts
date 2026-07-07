import { describe, expect, it } from 'vitest'
import type { EstimateInput } from '@/lib/ai/types'
import { buildSystemPrompt } from '@/lib/ai/prompt-builder'
import { estimateOutputSchema } from '@/lib/ai/schema'

/**
 * QUICK-mv1-01 — adaptive trade inference (industry as a SOFT PRIOR).
 *
 * Production evidence: a company configured with industry=electrical received
 * sofa-cleaning requests and produced electrical-biased estimates because the
 * generate-mode opening asserted "You are a professional estimator for a
 * electrical business" (identity, not prior). The opening now states the company
 * "primarily works in {industry}" but instructs the model to ALWAYS estimate the
 * work actually requested, and to return detected_trade (the trade of the
 * REQUEST itself, independent of the configured industry).
 *
 * The refine-mode opening must NOT gain the soft-prior paragraph — only the
 * generate-mode opening changes (HARD-02/UNIFY-02 byte-stability caveat in
 * prompt-builder.ts).
 */

const baseInput: EstimateInput = {
  industry: 'electrical',
  projectName: 'Test Project',
  projectType: null,
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: null,
  transcripts: ['Deep clean a 3-seat sofa and two armchairs'],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

describe('buildSystemPrompt — industry as soft prior (generate mode)', () => {
  it('states the industry as a soft prior and instructs faithful-to-request estimating', () => {
    const prompt = buildSystemPrompt(baseInput)
    expect(prompt).toContain('primarily works in electrical')
    // The faithful-to-request instruction — the core of the soft prior.
    expect(prompt).toContain('ALWAYS estimate the work that is actually requested')
    expect(prompt).toContain('price it faithfully for that trade')
    // The old identity phrasing (and its "a electrical" grammar bug) is gone.
    expect(prompt).not.toContain('estimator for a electrical business')
    expect(prompt).not.toMatch(/estimator for an? \w+ business/)
  })

  it('falls back to "general services" when industry is null', () => {
    const prompt = buildSystemPrompt({ ...baseInput, industry: null })
    expect(prompt).toContain('primarily works in general services')
  })

  it('instructs the model to return detected_trade independent of the company trade', () => {
    const prompt = buildSystemPrompt(baseInput)
    expect(prompt).toContain('Also return detected_trade')
    expect(prompt).toContain("independent of the company's primary trade")
  })
})

describe('buildSystemPrompt — refine mode is unaffected (no soft-prior leak)', () => {
  it('refine-mode opening contains neither the soft-prior paragraph nor the detected_trade instruction', () => {
    const refine = buildSystemPrompt(baseInput, { mode: 'refine' })
    const refineOpening = refine.split('\n\n## Language')[0]
    expect(refineOpening).not.toContain('primarily works in')
    expect(refineOpening).not.toContain('detected_trade')
    // The refine opening still carries its own role/task sentence.
    expect(refineOpening).toContain('Update the existing estimate')
  })
})

// A fully-valid raw object (the shape the create_estimate tool returns).
function validRaw(): Record<string, unknown> {
  return {
    suggested_project_name: 'Garcia Sofa Cleaning',
    summary: 'Deep cleaning of upholstered furniture.',
    sections: [
      {
        title: 'Labor',
        items: [
          {
            description: 'Deep clean 3-seat sofa',
            quantity: 1,
            unit: 'each',
            unit_price: 120,
            price_source: 'ai_estimate',
          },
        ],
      },
    ],
  }
}

describe('estimateOutputSchema — detected_trade is optional (legacy-safe)', () => {
  it('parses successfully WITH detected_trade and preserves the value', () => {
    const raw = validRaw()
    raw.detected_trade = 'cleaning'
    const result = estimateOutputSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.detected_trade).toBe('cleaning')
  })

  it('parses successfully WITHOUT detected_trade (legacy/cached outputs)', () => {
    const result = estimateOutputSchema.safeParse(validRaw())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.detected_trade).toBeUndefined()
  })
})
