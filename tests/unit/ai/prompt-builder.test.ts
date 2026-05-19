import { describe, expect, it } from 'vitest'
import type { EstimateInput } from '@/lib/ai/types'
import { buildSystemPrompt } from '@/lib/ai/prompt-builder'

const baseInput: EstimateInput = {
  industry: 'plumbing',
  projectName: 'Test Project',
  projectType: null,
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: null,
  transcripts: ['Replace water heater'],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

describe('buildSystemPrompt — price book injection', () => {
  it('no price book items → system prompt has no price book section', () => {
    const prompt = buildSystemPrompt({ ...baseInput, priceBookItems: [] })
    expect(prompt).not.toContain('## Your Company Price Book')
  })

  it('price book items present → system prompt contains folder_name-based list (no category prefix)', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      priceBookItems: [
        { folder_name: 'Labor', name: 'General Labor', unit: 'hr', unit_price: 65 },
        { folder_name: 'Materials', name: 'PVC Pipe 2in', unit: 'each', unit_price: 8.5 },
      ],
    })
    expect(prompt).toContain('## Your Company Price Book')
    expect(prompt).toContain('- Labor | General Labor | $65.00/hr')
    expect(prompt).toContain('- Materials | PVC Pipe 2in | $8.50/each')
  })

  it('items with null folder_name render as "Uncategorized"', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      priceBookItems: [
        { folder_name: null, name: 'Misc Hardware', unit: 'each', unit_price: 2.5 },
      ],
    })
    expect(prompt).toContain('- Uncategorized | Misc Hardware | $2.50/each')
  })

  it('price book items present → system prompt contains explicit matching instruction', () => {
    const prompt = buildSystemPrompt({
      ...baseInput,
      priceBookItems: [
        { folder_name: 'Labor', name: 'General Labor', unit: 'hr', unit_price: 65 },
      ],
    })
    expect(prompt).toContain('set price_source to "price_book"')
  })
})
