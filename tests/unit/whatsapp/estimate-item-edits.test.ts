import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Section/item-level WhatsApp edit commands (Phase 51 follow-up).
 *
 * A SINGLE in-memory Supabase harness models an estimate (sections + items) so
 * the tests exercise the REAL recompute path (computeEstimateTotals reuse) and
 * assert the reflowed item / section / estimate totals after each mutation —
 * plus the agent tool wiring on top of the same actions.
 */

vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  downloadWhatsAppMedia: vi.fn().mockResolvedValue(Buffer.from('x')),
}))

vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue(undefined),
}))

import {
  actionUpdateItem,
  actionAddItem,
  actionRemoveItem,
  type Session,
} from '@/lib/whatsapp/confirm-actions'
import { makeConfirmationTools } from '@/lib/whatsapp/agent-tools'

const round2 = (x: number) => Math.round(x * 100) / 100

const SESSION: Session = {
  id: 'session-1',
  state: 'awaiting_confirm',
  draft_project_id: 'proj-1',
  draft_estimate_id: 'est-1',
}
const COMPANY_ID = 'company-1'

type MockItem = {
  id: string
  section_id: string
  company_id: string
  description: string
  quantity: number
  unit: string | null
  unit_price: number
  total: number
  sort_order: number
  discount: number
  taxable: boolean
  tax_category: string | null
  cost: number | null
  markup_pct: number | null
}

// Seed: section 1 "Labor" [Demo 1x100, Haul 2x20], section 2 "Materials" [Paint 1x50]
function makeInMemorySupabase() {
  const mkItem = (
    id: string,
    section_id: string,
    description: string,
    quantity: number,
    unit_price: number,
    sort_order: number
  ): MockItem => ({
    id,
    section_id,
    company_id: COMPANY_ID,
    description,
    quantity,
    unit: null,
    unit_price,
    total: round2(quantity * unit_price),
    sort_order,
    discount: 0,
    taxable: true,
    tax_category: null,
    cost: null,
    markup_pct: null,
  })

  const db = {
    company: { id: COMPANY_ID, tax_config: null as unknown },
    estimate: {
      id: 'est-1',
      company_id: COMPANY_ID,
      project_id: 'proj-1',
      currency_code: 'USD',
      tax_rate: 0,
      discount_type: null as string | null,
      discount_value: 0,
      deposit_type: 'none' as string | null,
      deposit_value: null as number | null,
      subtotal: 190,
      tax_amount: 0,
      total: 190,
      balance_due: 190,
    },
    sections: [
      { id: 's1', estimate_id: 'est-1', company_id: COMPANY_ID, title: 'Labor', sort_order: 0, subtotal: 140 },
      { id: 's2', estimate_id: 'est-1', company_id: COMPANY_ID, title: 'Materials', sort_order: 1, subtotal: 50 },
    ],
    items: [
      mkItem('i1', 's1', 'Demo', 1, 100, 0),
      mkItem('i2', 's1', 'Haul', 2, 20, 1),
      mkItem('i3', 's2', 'Paint', 1, 50, 0),
    ] as MockItem[],
    projectTotal: 190,
  }
  let idSeq = 0

  const thenable = (value: unknown) => ({
    then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(value).then(onF, onR),
  })

  const estimateFatRow = () => ({
    ...db.estimate,
    sections: db.sections.map((s) => ({
      id: s.id,
      title: s.title,
      subtotal: s.subtotal,
      sort_order: s.sort_order,
      items: db.items
        .filter((i) => i.section_id === s.id)
        .map((i) => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          total: i.total,
          sort_order: i.sort_order,
        })),
    })),
  })

  const sectionsForRecompute = () =>
    db.sections.map((s) => ({
      id: s.id,
      title: s.title,
      items: db.items
        .filter((i) => i.section_id === s.id)
        .map((i) => ({
          id: i.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          taxable: i.taxable,
          tax_category: i.tax_category,
          cost: i.cost,
          markup_pct: i.markup_pct,
        })),
    }))

  function from(table: string) {
    const state: { mode: string; payload: Record<string, unknown> | null; filters: Record<string, unknown> } = {
      mode: 'select',
      payload: null,
      filters: {},
    }

    const resolve = (): { data: unknown; error: unknown } => {
      if (table === 'estimate_items') {
        if (state.mode === 'update') {
          const it = db.items.find((i) => i.id === state.filters.id)
          if (it) Object.assign(it, state.payload)
          return { data: null, error: null }
        }
        if (state.mode === 'delete') {
          const idx = db.items.findIndex((i) => i.id === state.filters.id)
          if (idx >= 0) db.items.splice(idx, 1)
          return { data: null, error: null }
        }
        const rows = db.items
          .filter((i) => i.section_id === state.filters.section_id)
          .map((i) => ({ sort_order: i.sort_order }))
        return { data: rows, error: null }
      }
      if (table === 'estimate_sections') {
        if (state.mode === 'update') {
          const s = db.sections.find((sec) => sec.id === state.filters.id)
          if (s) Object.assign(s, state.payload)
          return { data: null, error: null }
        }
        return { data: sectionsForRecompute(), error: null }
      }
      if (table === 'estimates') {
        if (state.mode === 'update') {
          Object.assign(db.estimate, state.payload)
          return { data: null, error: null }
        }
        return { data: estimateFatRow(), error: null }
      }
      if (table === 'companies') {
        return { data: { tax_config: db.company.tax_config }, error: null }
      }
      if (table === 'projects') {
        if (state.mode === 'update') db.projectTotal = Number((state.payload as { total: number }).total)
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }

    const builder: Record<string, unknown> = {
      select() {
        state.mode = 'select'
        return builder
      },
      update(p: Record<string, unknown>) {
        state.mode = 'update'
        state.payload = p
        return builder
      },
      delete() {
        state.mode = 'delete'
        return builder
      },
      insert(row: Record<string, unknown>) {
        if (table === 'estimate_items') {
          const id = `new-${++idSeq}`
          db.items.push({
            id,
            section_id: row.section_id as string,
            company_id: row.company_id as string,
            description: row.description as string,
            quantity: Number(row.quantity),
            unit: (row.unit as string | null) ?? null,
            unit_price: Number(row.unit_price),
            total: Number(row.total ?? round2(Number(row.quantity) * Number(row.unit_price))),
            sort_order: Number(row.sort_order ?? 0),
            discount: 0,
            taxable: true,
            tax_category: null,
            cost: null,
            markup_pct: null,
          })
        }
        return thenable({ data: null, error: null })
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val
        return builder
      },
      single() {
        return Promise.resolve(resolve())
      },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onF, onR)
      },
    }
    return builder
  }

  return { client: { from } as never, db }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('actionUpdateItem — recompute after price change', () => {
  it('changes item 1.1 price and reflows item/section/estimate totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionUpdateItem(SESSION, COMPANY_ID, client, 1, 1, { price: 200 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.message).toMatch(/updated item 1\.1/i)
      expect(result.breakdown?.total).toBe(290)
    }
    // item Demo: 1 x 200 = 200
    expect(db.items.find((i) => i.id === 'i1')!.total).toBe(200)
    // section 1: 200 + 40 = 240
    expect(db.sections.find((s) => s.id === 's1')!.subtotal).toBe(240)
    // estimate: 240 + 50 = 290; project mirrors
    expect(db.estimate.total).toBe(290)
    expect(db.projectTotal).toBe(290)
  })

  it('changes quantity and name together', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionUpdateItem(SESSION, COMPANY_ID, client, 1, 2, {
      quantity: 5,
      name: 'Haul debris',
    })
    expect(result.ok).toBe(true)
    const haul = db.items.find((i) => i.id === 'i2')!
    expect(haul.quantity).toBe(5)
    expect(haul.description).toBe('Haul debris')
    // 5 x 20 = 100 → section 1: 100 + 100 = 200 → estimate 250
    expect(haul.total).toBe(100)
    expect(db.estimate.total).toBe(250)
  })

  it('rejects an out-of-range section (N)', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionUpdateItem(SESSION, COMPANY_ID, client, 9, 1, { price: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/section 9/i)
  })

  it('rejects an out-of-range item (N.M)', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionUpdateItem(SESSION, COMPANY_ID, client, 1, 9, { price: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/item 1\.9/i)
  })

  it('rejects when no fields are provided', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionUpdateItem(SESSION, COMPANY_ID, client, 1, 1, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/nothing to change/i)
  })
})

describe('actionAddItem — append + recompute', () => {
  it('appends a new item to section 2 and reflows totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionAddItem(SESSION, COMPANY_ID, client, 2, 'Haul away debris', 150)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toMatch(/added .*section 2/i)

    const s2Items = db.items.filter((i) => i.section_id === 's2')
    expect(s2Items).toHaveLength(2)
    const added = s2Items.find((i) => i.description === 'Haul away debris')!
    expect(added.unit_price).toBe(150)
    expect(added.total).toBe(150)
    // new item lands at the next sort_order (after Paint's 0)
    expect(added.sort_order).toBe(1)
    // section 2: 50 + 150 = 200 → estimate: 140 + 200 = 340
    expect(db.sections.find((s) => s.id === 's2')!.subtotal).toBe(200)
    expect(db.estimate.total).toBe(340)
  })

  it('rejects adding to a non-existent section', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionAddItem(SESSION, COMPANY_ID, client, 7, 'X', 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/section 7/i)
  })
})

describe('actionRemoveItem — delete + recompute', () => {
  it('removes item 1.2 and reflows totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionRemoveItem(SESSION, COMPANY_ID, client, 1, 2)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toMatch(/removed item 1\.2/i)
    expect(db.items.find((i) => i.id === 'i2')).toBeUndefined()
    // section 1 now just Demo (100) → estimate 100 + 50 = 150
    expect(db.sections.find((s) => s.id === 's1')!.subtotal).toBe(100)
    expect(db.estimate.total).toBe(150)
  })

  it('rejects removing an out-of-range item', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionRemoveItem(SESSION, COMPANY_ID, client, 1, 9)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/item 1\.9/i)
  })
})

describe('agent tool wiring — makeConfirmationTools', () => {
  it('exposes the three edit tools + get_estimate_details, none leaking companyId in schema', () => {
    const { client } = makeInMemorySupabase()
    const tools = makeConfirmationTools(SESSION, COMPANY_ID, client)
    const byName = Object.fromEntries(tools.map((t) => [(t as { name: string }).name, t])) as Record<
      string,
      { schema?: { shape?: Record<string, unknown> } }
    >

    for (const name of ['update_item', 'add_item', 'remove_item', 'get_estimate_details']) {
      expect(byName[name]).toBeDefined()
      const keys = Object.keys(byName[name].schema?.shape ?? {}).map((k) => k.toLowerCase())
      expect(keys).not.toContain('companyid')
      expect(keys).not.toContain('company_id')
    }
  })

  it('update_item tool returns the summary + refreshed numbered breakdown', async () => {
    const { client } = makeInMemorySupabase()
    const tools = makeConfirmationTools(SESSION, COMPANY_ID, client)
    const byName = Object.fromEntries(tools.map((t) => [(t as { name: string }).name, t])) as Record<
      string,
      { invoke: (a: unknown) => Promise<string> }
    >

    const reply = await byName.update_item.invoke({ sectionNumber: 1, itemNumber: 1, price: 200 })
    expect(reply).toMatch(/updated item 1\.1/i)
    expect(reply).toMatch(/updated estimate/i)
    expect(reply).toMatch(/\$290\.00/)
    expect(reply).toMatch(/1\.1 Demo/)
  })

  it('get_estimate_details tool includes the numbered breakdown', async () => {
    const { client } = makeInMemorySupabase()
    const tools = makeConfirmationTools(SESSION, COMPANY_ID, client)
    const byName = Object.fromEntries(tools.map((t) => [(t as { name: string }).name, t])) as Record<
      string,
      { invoke: (a: unknown) => Promise<string> }
    >

    const details = await byName.get_estimate_details.invoke({})
    expect(details).toMatch(/numbered breakdown/i)
    expect(details).toMatch(/1\.1 Demo/)
    expect(details).toMatch(/2\.1 Paint/)
  })

  it('add_item and remove_item tools return a human confirmation', async () => {
    const { client } = makeInMemorySupabase()
    const tools = makeConfirmationTools(SESSION, COMPANY_ID, client)
    const byName = Object.fromEntries(tools.map((t) => [(t as { name: string }).name, t])) as Record<
      string,
      { invoke: (a: unknown) => Promise<string> }
    >

    const added = await byName.add_item.invoke({ sectionNumber: 2, name: 'Debris', price: 150 })
    expect(added).toMatch(/added/i)
    const removed = await byName.remove_item.invoke({ sectionNumber: 1, itemNumber: 2 })
    expect(removed).toMatch(/removed item 1\.2/i)
  })
})
