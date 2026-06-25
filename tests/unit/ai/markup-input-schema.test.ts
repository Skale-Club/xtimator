import { describe, it, expect } from 'vitest'
import { estimateOutputSchema } from '@/lib/ai/schema'
import type { LineItemOutput } from '@/lib/ai/types'

// MARK-01 — the AI output contract carries OPTIONAL per-item `cost` + `markup_pct`
// INPUTS. Both are additive: omitting them still validates byte-identically (no
// injected default — the SERVER derives unit_price = round2(cost × (1 + markup_pct/100))
// in compute-totals.ts only when cost+markup present and no explicit unit_price).
// The AI SUPPLIES cost + markup; it NEVER computes the marked-up price (ENG-01).

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

describe('MARK-01: AI output schema accepts optional per-item cost + markup_pct inputs', () => {
  it('A — SUCCEEDS on an item WITH cost:80 markup_pct:25 and preserves both', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem, cost: 80, markup_pct: 25 }))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sections[0].items[0].cost).toBe(80)
      expect(r.data.sections[0].items[0].markup_pct).toBe(25)
    }
  })

  it('B — SUCCEEDS when both OMITTED and injects NO default (retrocompat)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem }))
    expect(r.success).toBe(true)
    if (r.success) {
      // No injected default — undefined, so the byte-identical retrocompat path holds.
      expect(r.data.sections[0].items[0].cost).toBeUndefined()
      expect(r.data.sections[0].items[0].markup_pct).toBeUndefined()
    }
  })

  it('C — REJECTS a negative cost (cost is a non-negative amount)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem, cost: -5 }))
    expect(r.success).toBe(false)
  })

  it('D — REJECTS a negative markup_pct (markup is non-negative)', () => {
    const r = estimateOutputSchema.safeParse(buildOutput({ ...baseItem, markup_pct: -1 }))
    expect(r.success).toBe(false)
  })

  it('LineItemOutput type accepts optional cost + markup_pct (compile check)', () => {
    const item: LineItemOutput = {
      description: 'Tile materials',
      quantity: 100,
      unit: 'sq ft',
      unit_price: 5,
      price_source: 'price_book',
      cost: 4,
      markup_pct: 25,
    }
    expect(item.cost).toBe(4)
    expect(item.markup_pct).toBe(25)
  })
})
