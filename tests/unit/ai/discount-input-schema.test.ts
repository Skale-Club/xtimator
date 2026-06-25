import { describe, it, expect } from 'vitest'
import { estimateOutputSchema } from '@/lib/ai/schema'
import type { LineItemOutput } from '@/lib/ai/types'

// DISC-01 — the AI output contract carries an OPTIONAL per-item line `discount`
// (an AMOUNT). The field is additive: omitting it still validates byte-identically
// (no injected default — the SERVER engine subtracts it in compute-totals.ts via
// `item.discount ?? 0`, activated in Plan 131-02). The AI SUGGESTS a discount
// amount; it never computes the subtotal/total (GUARD-03 single authority preserved).

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

describe('DISC-01: AI output schema accepts an optional per-item line discount input', () => {
  it('A — SUCCEEDS on an item WITH discount:50 and preserves the amount', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem, discount: 50 }))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sections[0].items[0].discount).toBe(50)
    }
  })

  it('B — SUCCEEDS when discount is OMITTED and injects NO default (retrocompat)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem }))
    expect(r.success).toBe(true)
    if (r.success) {
      // No injected default — undefined, so the byte-identical retrocompat path holds.
      expect(r.data.sections[0].items[0].discount).toBeUndefined()
    }
  })

  it('C — REJECTS a negative discount (a discount is a non-negative amount)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem, discount: -5 }))
    expect(r.success).toBe(false)
  })

  it('LineItemOutput type accepts optional discount (compile check)', () => {
    const item: LineItemOutput = {
      description: 'Tile materials',
      quantity: 100,
      unit: 'sq ft',
      unit_price: 5,
      price_source: 'price_book',
      discount: 25,
    }
    expect(item.discount).toBe(25)
  })
})
