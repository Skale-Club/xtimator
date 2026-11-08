import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateSectionOutput } from '@/lib/ai/types'

// Phase 4d persistence hook: a patched draft becomes a NEW version through the shared write path.
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/estimate/public-url', () => ({ generatePublicSlugToken: vi.fn().mockReturnValue('new-slug') }))
const copyPhotos = vi.fn()
vi.mock('@/lib/queries/estimate-photo', () => ({ copyEstimatePhotos: (...a: unknown[]) => copyPhotos(...a) }))

import { persistPatchedEstimate } from '@/lib/services/persist-patched-estimate'
import { requireServiceClient } from '@/lib/supabase/service'

const BASE = {
  currency_code: 'USD',
  notes: 'base notes',
  timeline: '2 weeks',
  payment_terms: 'Net 30',
  warranty_terms: '1 year',
  presentation_settings: { sections: { notes: true } },
  valid_until: '2026-12-01',
  language: 'pt',
  ai_meta: { v: 1, assumptions: ['Access is clear'], quality: { score: 40, band: 'refine', findings: ['old'] } },
  discount_type: null,
  discount_value: null,
  deposit_type: 'none',
  deposit_value: null,
  created_by_user_id: 'user-1',
}

const SECTIONS: EstimateSectionOutput[] = [
  {
    title: 'Walls',
    items: [
      { description: 'Paint walls', quantity: 10, unit: 'sq ft', unit_price: 10, price_source: 'ai_estimate', confidence: 'high', basis: '10 sq ft', optional: false },
      { description: 'Primer', quantity: 1, unit: 'job', unit_price: 50, price_source: 'researched', taxable: false },
    ],
  },
]

const args = (band: 'refine' | 'review' | 'ok' = 'review') => ({
  companyId: 'company-1',
  projectId: 'project-1',
  baseEstimateId: 'est-base',
  patched: { summary: 'Patched summary', sections: SECTIONS },
  structure: { score: 72, band, hints: [], findings: ['Some line lacks a basis'] },
})

function makeDb(opts: { base?: unknown; itemsError?: boolean; sectionsError?: boolean; maxVersion?: number } = {}) {
  const log: Array<{ table: string; op: string; payload?: unknown; filters?: unknown[] }> = []
  const inserts: Array<Record<string, unknown>> = []
  const itemRows: Array<Array<Record<string, unknown>>> = []
  const from = vi.fn((table: string) => {
    if (table === 'estimates') {
      return {
        select: (cols: string) => {
          if (cols === 'version') {
            const c = { eq: () => c, order: () => c, limit: async () => ({ data: opts.maxVersion === undefined ? [{ version: 2 }] : [{ version: opts.maxVersion }] }) }
            return c
          }
          const c = { eq: () => c, maybeSingle: async () => ({ data: 'base' in opts ? opts.base : BASE }) }
          return c
        },
        insert: (row: Record<string, unknown>) => {
          inserts.push(row)
          log.push({ table, op: 'insert', payload: row })
          return { select: () => ({ single: async () => ({ data: { id: 'est-new' }, error: null }) }) }
        },
        update: (row: Record<string, unknown>) => {
          const filters: unknown[] = []
          const c: Record<string, unknown> = {}
          c.eq = (k: string, v: unknown) => (filters.push(['eq', k, v]), c)
          c.neq = (k: string, v: unknown) => (filters.push(['neq', k, v]), c)
          c.then = (res: (v: unknown) => unknown) => (log.push({ table, op: 'update', payload: row, filters }), Promise.resolve({ error: null }).then(res))
          return c
        },
        delete: () => ({
          eq: async (k: string, v: unknown) => (log.push({ table, op: 'delete', filters: [k, v] }), { error: null }),
        }),
      }
    }
    if (table === 'companies') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { currency_code: 'USD', default_tax_rate: 0.1, tax_config: null } }) }),
        }),
      }
    }
    if (table === 'estimate_sections') {
      return {
        insert: (rows: unknown[]) => ({
          select: async () => (opts.sectionsError ? { data: null, error: { message: 'boom' } } : { data: rows.map((_, i) => ({ id: `s${i}` })), error: null }),
        }),
      }
    }
    if (table === 'estimate_items') {
      return {
        insert: async (rows: Array<Record<string, unknown>>) => {
          itemRows.push(rows)
          return { error: opts.itemsError ? { message: 'items boom' } : null }
        },
      }
    }
    if (table === 'projects') {
      return { update: (row: unknown) => ({ eq: async () => (log.push({ table, op: 'update', payload: row }), { error: null }) }) }
    }
    throw new Error(`unexpected table ${table}`)
  })
  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)
  return { log, inserts, itemRows }
}

describe('persistPatchedEstimate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('writes a NEW version with correct totals, carried-over fields and a new slug token', async () => {
    const db = makeDb()
    const res = await persistPatchedEstimate(args('review'))
    expect(res).toEqual({ estimateId: 'est-new' })

    const row = db.inserts[0]
    // 10*10 taxable + 50 untaxable = 150; 10% tax on 100 = 10
    expect(row).toMatchObject({
      project_id: 'project-1',
      company_id: 'company-1',
      version: 3,
      is_current: false,
      summary: 'Patched summary',
      subtotal: 150,
      tax_rate: 0.1,
      tax_amount: 10,
      total: 160,
      balance_due: 160,
      notes: 'base notes',
      timeline: '2 weeks',
      payment_terms: 'Net 30',
      warranty_terms: '1 year',
      presentation_settings: { sections: { notes: true } },
      valid_until: '2026-12-01',
      language: 'pt',
      currency_code: 'USD',
      created_by_user_id: 'user-1',
      public_slug_token: 'new-slug',
    })
    // assumptions carried; the quality block is the PATCHED draft's, not the base's
    expect(row.ai_meta).toEqual({
      v: 1,
      assumptions: ['Access is clear'],
      quality: { score: 72, band: 'review', findings: ['Some line lacks a basis'] },
    })
    // per-line AI fields reached the items
    expect(db.itemRows[0][0]).toMatchObject({ confidence: 'high', basis: '10 sq ft', optional: false, total: 100 })
    expect(db.itemRows[0][1]).toMatchObject({ taxable: false, price_source: 'researched', confidence: null })
  })

  it('band ok writes no quality block', async () => {
    const db = makeDb()
    await persistPatchedEstimate(args('ok'))
    expect((db.inserts[0].ai_meta as Record<string, unknown>).quality).toBeUndefined()
  })

  it('swaps is_current safely: insert non-current, demote the others, then promote; photos follow', async () => {
    const db = makeDb()
    await persistPatchedEstimate(args())
    const ops = db.log.filter((l) => l.table === 'estimates').map((l) => `${l.op}:${JSON.stringify(l.payload && (l.payload as Record<string, unknown>).is_current)}`)
    expect(ops).toEqual(['insert:false', 'update:false', 'update:true'])
    const demote = db.log.find((l) => l.op === 'update' && (l.payload as Record<string, unknown>).is_current === false)!
    expect(demote.filters).toContainEqual(['neq', 'id', 'est-new'])
    expect(copyPhotos).toHaveBeenCalledWith(expect.anything(), 'est-base', 'est-new', 'company-1')
    expect(db.log).toContainEqual({ table: 'projects', op: 'update', payload: { total: 160, status: 'estimate_ready' } })
  })

  it('a failed items insert deletes the new row, returns null and never touches is_current', async () => {
    const db = makeDb({ itemsError: true })
    expect(await persistPatchedEstimate(args())).toBeNull()
    expect(db.log).toContainEqual({ table: 'estimates', op: 'delete', filters: ['id', 'est-new'] })
    expect(db.log.some((l) => l.op === 'update')).toBe(false)
    expect(copyPhotos).not.toHaveBeenCalled()
  })

  it('a failed sections insert also cleans up and keeps the base current', async () => {
    const db = makeDb({ sectionsError: true })
    expect(await persistPatchedEstimate(args())).toBeNull()
    expect(db.log.some((l) => l.op === 'delete')).toBe(true)
    expect(db.log.some((l) => l.op === 'update')).toBe(false)
  })

  it('an unreadable base estimate writes nothing', async () => {
    const db = makeDb({ base: null })
    expect(await persistPatchedEstimate(args())).toBeNull()
    expect(db.inserts).toHaveLength(0)
  })

  it('sets the project to awaiting_details when a patched line has no price (same rule as generation)', async () => {
    const db = makeDb()
    const unpriced: EstimateSectionOutput[] = [
      {
        title: 'Walls',
        items: [
          { description: 'Paint walls', quantity: 10, unit: 'sq ft', unit_price: 10, price_source: 'ai_estimate' },
          { description: 'Custom trim', quantity: 1, unit: 'job', unit_price: 0, price_source: 'ai_estimate' },
        ],
      },
    ]
    await persistPatchedEstimate({ ...args(), patched: { summary: 'S', sections: unpriced } })
    const upd = db.log.find((l) => l.table === 'projects' && l.op === 'update')!
    expect(upd.payload).toMatchObject({ status: 'awaiting_details' })
  })

  it('sets the project to awaiting_details when the patched total exceeds the value cap', async () => {
    const db = makeDb()
    vi.stubEnv('ESTIMATE_TOTAL_CEILING_USD', '100')
    try {
      await persistPatchedEstimate(args()) // total 160 > 100
    } finally {
      vi.unstubAllEnvs()
    }
    const upd = db.log.find((l) => l.table === 'projects' && l.op === 'update')!
    expect(upd.payload).toMatchObject({ total: 160, status: 'awaiting_details' })
  })
})
