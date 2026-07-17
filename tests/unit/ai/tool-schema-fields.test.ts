import { describe, expect, it } from 'vitest'
import { estimateToolSchema } from '@/lib/ai/providers/openrouter'

/**
 * AIREL-03 — locks the LIVE OpenRouter tool schema's item-property shape
 * against drift from the zod schema (lib/ai/schema.ts) and the Gemini tool
 * schema (gemini.ts:144-154). Before this fix, the primary (OpenRouter) path
 * never asked for taxable/tax_category/cost/markup_pct at all — per-category
 * tax (TAX-03) and cost+markup (MARK-01) only worked via the Gemini fallback
 * or refine (audit v4.19 § C3).
 *
 * Statically imports the real exported schema object (not a text/grep scan)
 * so a future edit that renames/removes a property fails this test
 * immediately — the exact drift class the audit caught.
 */

type JsonSchemaObject = {
  type: string
  required?: string[]
  properties: Record<string, { type: string; enum?: string[]; description?: string }>
}

// Navigate: root -> properties.sections.items (section object) ->
// properties.items (line-items array) -> items (line item object).
const sectionSchema = estimateToolSchema.properties.sections.items
const lineItemSchema = sectionSchema.properties.items.items as unknown as JsonSchemaObject
const itemProps = lineItemSchema.properties

describe('OpenRouter estimateToolSchema — pricing-field parity with the zod schema (AIREL-03/C3)', () => {
  it('is exported so it can be statically imported by this test', () => {
    expect(estimateToolSchema).toBeDefined()
    expect(estimateToolSchema.properties.sections).toBeDefined()
  })

  it('the item schema properties are a SUPERSET of the zod-mirrored fields (locks future drift)', () => {
    const expectedKeys = [
      'description',
      'quantity',
      'unit',
      'unit_price',
      'price_source',
      'taxable',
      'tax_category',
      'cost',
      'markup_pct',
    ]
    for (const key of expectedKeys) {
      expect(itemProps).toHaveProperty(key)
    }
  })

  it('tax_category enum === [labor, materials, other] (same as gemini.ts and schema.ts)', () => {
    expect(itemProps.tax_category.enum).toEqual(['labor', 'materials', 'other'])
  })

  it('taxable is declared as a boolean field', () => {
    expect(itemProps.taxable.type).toBe('boolean')
  })

  it('cost and markup_pct are declared as number fields', () => {
    expect(itemProps.cost.type).toBe('number')
    expect(itemProps.markup_pct.type).toBe('number')
  })

  it('none of the four pricing fields are in the item required[] — retrocompat with models that omit them', () => {
    const required = lineItemSchema.required ?? []
    expect(required).not.toContain('taxable')
    expect(required).not.toContain('tax_category')
    expect(required).not.toContain('cost')
    expect(required).not.toContain('markup_pct')
  })

  it('the pre-existing required fields are untouched', () => {
    expect(lineItemSchema.required).toEqual([
      'description',
      'quantity',
      'unit_price',
      'price_source',
    ])
  })
})
