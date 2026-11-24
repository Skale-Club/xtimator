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
  actionUpdateField,
  ESTIMATE_ANSWERED_MESSAGE,
  CHANGE_ESTIMATE_TOTAL_MESSAGE,
  type Session,
} from '@/lib/whatsapp/confirm-actions'
import { makeConfirmationTools } from '@/lib/whatsapp/agent-tools'
import { estimateReplyAuthorization } from '@/lib/whatsapp/session-commands'

const round2 = (x: number) => Math.round(x * 100) / 100

const SESSION: Session = {
  id: 'session-1',
  state: 'awaiting_confirm',
  draft_project_id: 'proj-1',
  draft_estimate_id: 'est-1',
}
const COMPANY_ID = 'company-1'
const SCOPE = { session: SESSION, companyId: COMPANY_ID, ownerPhone: '+15551112222', messageId: 'wamid.test' }

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
      updated_at: '2026-11-23T00:00:00.000Z',
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
    signatures: [] as Array<{ id: string }>,
  }
  const estimateRow = () => ({
    ...db.estimate,
    sections: db.sections.map((section) => ({
      ...section,
      items: db.items.filter((item) => item.section_id === section.id).map((item) => ({ ...item })),
    })),
  })
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'whatsapp_claim_estimate_command') {
      const row = db.estimate as { client_response?: string }
      if (row.client_response || db.signatures.length) return { data: { status: 'answered' }, error: null }
      return { data: { status: 'claimed', command_id: 'command-1' }, error: null }
    }
    if (name === 'whatsapp_commit_estimate_item_edit') {
      const item = args.p_item as MockItem
      const existing = db.items.find((row) => row.id === item.id)
      if (args.p_operation === 'add') db.items.push({ ...item, section_id: args.p_section_id as string })
      if (args.p_operation === 'update' && existing) Object.assign(existing, item)
      if (args.p_operation === 'remove') db.items = db.items.filter((row) => row.id !== item.id)
      for (const itemTotal of args.p_items as Array<Pick<MockItem, 'id' | 'total' | 'unit_price'>>) {
        Object.assign(db.items.find((row) => row.id === itemTotal.id)!, itemTotal)
      }
      for (const sectionTotal of args.p_sections as Array<{ id: string; subtotal: number }>) {
        Object.assign(db.sections.find((row) => row.id === sectionTotal.id)!, sectionTotal)
      }
      Object.assign(db.estimate, args.p_totals)
      db.projectTotal = db.estimate.total
    }
    return { data: null, error: null }
  })
  function from(table: string) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      gt: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: table === 'estimates' ? estimateRow() : db.company, error: null }),
      maybeSingle: async () => ({ data: table === 'whatsapp_sessions' ? SESSION : null, error: null }),
    }
    return builder
  }

  return { client: { from, rpc } as never, db, rpc }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('actionUpdateItem — recompute after price change', () => {
  it('keeps tax exemptions, global discount, deposit and project balance consistent after an edit', async () => {
    const { client, db, rpc } = makeInMemorySupabase()
    Object.assign(db.estimate, { tax_rate: 0.1, discount_type: 'percentage', discount_value: 10,
      deposit_type: 'percent', deposit_value: 25 })
    db.items.find((item) => item.id === 'i3')!.taxable = false
    expect((await actionUpdateItem(SCOPE, client, 1, 1, { price: 200 })).ok).toBe(true)
    expect(db.estimate).toMatchObject({ subtotal: 290, tax_amount: 21.6, total: 282.6, balance_due: 211.95 })
    expect(db.projectTotal).toBe(282.6)
    expect(rpc).toHaveBeenCalledWith('whatsapp_commit_estimate_item_edit', expect.objectContaining({
      p_totals: { subtotal: 290, discount_amount: 29, tax_amount: 21.6, total: 282.6, balance_due: 211.95 },
    }))
  })
  it('changes item 1.1 price and reflows item/section/estimate totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionUpdateItem(SCOPE, client, 1, 1, { price: 200 })

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
    const result = await actionUpdateItem(SCOPE, client, 1, 2, {
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
    const result = await actionUpdateItem(SCOPE, client, 9, 1, { price: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/section 9/i)
  })

  it('rejects an out-of-range item (N.M)', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionUpdateItem(SCOPE, client, 1, 9, { price: 10 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/item 1\.9/i)
  })

  it('rejects when no fields are provided', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionUpdateItem(SCOPE, client, 1, 1, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/specify a new price/i)
  })
})

describe('actionAddItem — append + recompute', () => {
  it('appends a new item to section 2 and reflows totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionAddItem(SCOPE, client, 2, 'Haul away debris', 150)

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
    const result = await actionAddItem(SCOPE, client, 7, 'X', 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/section 7/i)
  })
})

describe('actionRemoveItem — delete + recompute', () => {
  it('removes item 1.2 and reflows totals', async () => {
    const { client, db } = makeInMemorySupabase()
    const result = await actionRemoveItem(SCOPE, client, 1, 2)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.message).toMatch(/removed item 1\.2/i)
    expect(db.items.find((i) => i.id === 'i2')).toBeUndefined()
    // section 1 now just Demo (100) → estimate 100 + 50 = 150
    expect(db.sections.find((s) => s.id === 's1')!.subtotal).toBe(100)
    expect(db.estimate.total).toBe(150)
  })

  it('rejects removing an out-of-range item', async () => {
    const { client } = makeInMemorySupabase()
    const result = await actionRemoveItem(SCOPE, client, 1, 9)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/item 1\.9/i)
  })
})

// Lock-at-acceptance: once the client answered or signed, the WhatsApp edits
// refuse before touching a row (the database refuses line writes as well).
describe('an answered or signed estimate cannot be edited from WhatsApp', () => {
  function locked(how: 'accepted' | 'declined' | 'signed') {
    const harness = makeInMemorySupabase()
    if (how === 'signed') harness.db.signatures.push({ id: 'sig-1' })
    else (harness.db.estimate as Record<string, unknown>).client_response = how
    return harness
  }
  const state = (db: ReturnType<typeof makeInMemorySupabase>['db']) =>
    JSON.stringify({ items: db.items, sections: db.sections, estimate: db.estimate, project: db.projectTotal })

  it.each(['accepted', 'declined', 'signed'] as const)(
    '%s: item update, add and remove are refused and nothing changes',
    async (how) => {
      const { client, db } = locked(how)
      const before = state(db)

      const results = [
        await actionUpdateItem(SCOPE, client, 1, 1, { price: 999 }),
        await actionAddItem(SCOPE, client, 1, 'Extra work', 50),
        await actionRemoveItem(SCOPE, client, 1, 2),
      ]

      for (const res of results) expect(res).toEqual({ ok: false, message: ESTIMATE_ANSWERED_MESSAGE })
      expect(state(db)).toBe(before)
    }
  )

  it('a header edit is refused too', async () => {
    const { client, db } = locked('accepted')
    await expect(actionUpdateField(SCOPE, client, { timeline: 'tomorrow' })).rejects.toMatchObject({ reason: 'answered' })
    expect(db.estimate.total).toBe(190)
  })

  it('the field tools answer plainly instead of failing the turn', async () => {
    const { client } = locked('accepted')
    const tools = makeConfirmationTools(SCOPE, client)
    const updateTimeline = tools.find((t) => t.name === 'update_timeline')!
    await expect(updateTimeline.invoke({ value: 'tomorrow' })).resolves.toBe(ESTIMATE_ANSWERED_MESSAGE)
  })

  it('an unanswered estimate is still editable', async () => {
    const { client, db } = makeInMemorySupabase()
    const res = await actionUpdateItem(SCOPE, client, 1, 1, { price: 150 })
    expect(res.ok).toBe(true)
    expect(db.items.find((i) => i.id === 'i1')!.unit_price).toBe(150)
  })
})

describe('agent tool wiring — makeConfirmationTools', () => {
  it('exposes the three edit tools + get_estimate_details, none leaking companyId in schema', () => {
    const { client } = makeInMemorySupabase()
    const tools = makeConfirmationTools(SCOPE, client)
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
    const tools = makeConfirmationTools(SCOPE, client)
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
    const tools = makeConfirmationTools(SCOPE, client)
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
    const tools = makeConfirmationTools(SCOPE, client)
    const byName = Object.fromEntries(tools.map((t) => [(t as { name: string }).name, t])) as Record<
      string,
      { invoke: (a: unknown) => Promise<string> }
    >

    const added = await byName.add_item.invoke({ sectionNumber: 2, name: 'Debris', price: 150 })
    expect(added).toMatch(/added/i)
    const removed = await byName.remove_item.invoke({ sectionNumber: 1, itemNumber: 2 })
    expect(removed).toMatch(/removed item 1\.2/i)
  })
  it('asks for a numbered item and refuses sending a compound total request without making any writes', async () => {
    const { client, db, rpc } = makeInMemorySupabase()
    expect(estimateReplyAuthorization('Change the total to $500 and send it')).toBeNull()
    const tools = makeConfirmationTools(SCOPE, client)
    const update = tools.find((tool) => tool.name === 'update_total')!
    const send = tools.find((tool) => tool.name === 'send_estimate')!
    const outcomes = await Promise.all([send.invoke({}), update.invoke({ value: 500 })])
    expect(outcomes).toEqual([expect.stringMatching(/separate message/i), CHANGE_ESTIMATE_TOTAL_MESSAGE])
    expect(db.estimate.total).toBe(190)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes line totals and the document revision in one atomic commit', async () => {
    const { client, db, rpc } = makeInMemorySupabase()
    const result = await actionUpdateItem(SCOPE, client, 1, 2, { price: 40 })
    expect(result.ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('whatsapp_commit_estimate_item_edit', expect.objectContaining({
      p_expected_updated_at: db.estimate.updated_at,
      p_operation: 'update',
      p_totals: expect.objectContaining({ total: 230, subtotal: 230, balance_due: 230 }),
      p_items: expect.arrayContaining([expect.objectContaining({ id: 'i2', total: 80 })]),
    }))
  })

})
