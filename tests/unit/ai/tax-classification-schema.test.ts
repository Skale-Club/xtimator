import { describe, it, expect } from 'vitest'
import { estimateOutputSchema } from '@/lib/ai/schema'
import type { LineItemOutput } from '@/lib/ai/types'

// TAX-02 — the AI output contract carries OPTIONAL per-item taxable/tax_category
// classification input. The fields are additive: omitting them still validates
// byte-identically (no injected default — the SERVER applies taxable=true in
// Plan 130-02). The AI CLASSIFIES (labor vs materials); it never computes tax.

function buildOutput(item: Record<string, unknown>) {
  return {
    suggested_project_name: 'Smith Bathroom Remodel',
    summary: 'Remodel work',
    sections: [
      {
        title: 'Labor',
        items: [item],
      },
    ],
  }
}

const baseItem = {
  description: 'Demolition labor',
  quantity: 8,
  unit: 'hours',
  unit_price: 75,
  price_source: 'ai_estimate',
}

describe('TAX-02: AI output schema accepts optional per-item taxable/tax_category', () => {
  it('SUCCEEDS on an item WITH taxable:false + tax_category:"labor" and preserves both', () => {
    const r = estimateOutputSchema.safeParse(
      buildOutput({ ...baseItem, taxable: false, tax_category: 'labor' })
    )
    expect(r.success).toBe(true)
    if (r.success) {
      const parsed = r.data.sections[0].items[0]
      expect(parsed.taxable).toBe(false)
      expect(parsed.tax_category).toBe('labor')
    }
  })

  it('SUCCEEDS when both fields are OMITTED and injects NO default (retrocompat)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem }))
    expect(r.success).toBe(true)
    if (r.success) {
      const parsed = r.data.sections[0].items[0]
      // No injected default — undefined, so the byte-identical retrocompat path holds.
      expect(parsed.taxable).toBeUndefined()
      expect(parsed.tax_category).toBeUndefined()
    }
  })

  it('accepts the full tax_category enum: labor | materials | other', () => {
    for (const category of ['labor', 'materials', 'other'] as const) {
      const r = estimateOutputSchema.safeParse(
        buildOutput({ ...baseItem, tax_category: category })
      )
      expect(r.success).toBe(true)
      if (r.success) {
        expect(r.data.sections[0].items[0].tax_category).toBe(category)
      }
    }
  })

  it('REJECTS tax_category not in the labor/materials/other enum', () => {
    const r = estimateOutputSchema.safeParse(
      buildOutput({ ...baseItem, tax_category: 'plumbing' })
    )
    expect(r.success).toBe(false)
  })

  it('LineItemOutput type accepts optional taxable + tax_category (compile check)', () => {
    const item: LineItemOutput = {
      description: 'Tile materials',
      quantity: 100,
      unit: 'sq ft',
      unit_price: 5,
      price_source: 'price_book',
      taxable: true,
      tax_category: 'materials',
    }
    expect(item.taxable).toBe(true)
    expect(item.tax_category).toBe('materials')
  })
})
