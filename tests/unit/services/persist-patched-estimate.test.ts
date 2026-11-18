import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateSectionOutput } from '@/lib/ai/types'

// Phase 4d persistence hook: a patched draft becomes a NEW version through the shared write path.
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/estimate/public-url', () => ({ generatePublicSlugToken: vi.fn().mockReturnValue('new-slug') }))

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
  const rpc = vi.fn(async (name: string, input: { p_estimate_id: string }) => {
    if (name !== 'activate_estimate_version') throw new Error(`Unexpected RPC ${name}`)
    return { data: { estimate_id: input.p_estimate_id, version: inserts[0].version as number }, error: null }
  })
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
        delete: () => {
          const filters: unknown[] = []
          const chain = {
            eq(key: string, value: unknown) {
              filters.push([key, value])
              return this
            },
            then: (resolve: (value: { error: null }) => unknown) => {
              log.push({ table, op: 'delete', filters })
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return chain
        },
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
    throw new Error(`unexpected table ${table}`)
  })
  vi.mocked(requireServiceClient).mockReturnValue({ from, rpc } as never)
  return { log, inserts, itemRows, rpc }
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

  it('activates with the base version to carry forward and the project metadata to commit', async () => {
    const db = makeDb()
    await persistPatchedEstimate(args())
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith('activate_estimate_version', expect.objectContaining({
      p_company_id: 'company-1',
      p_project_id: 'project-1',
      p_estimate_id: 'est-new',
      p_previous_estimate_id: 'est-base',
      p_project_update: { total: 160, status: 'estimate_ready' },
    }))
  })

  it('a failed items insert deletes the new row, returns null and never touches is_current', async () => {
    const db = makeDb({ itemsError: true })
    expect(await persistPatchedEstimate(args())).toBeNull()
    expect(db.log).toContainEqual({
      table: 'estimates',
      op: 'delete',
      filters: expect.arrayContaining([['id', 'est-new'], ['is_current', false]]),
    })
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it('a failed sections insert also cleans up and keeps the base current', async () => {
    const db = makeDb({ sectionsError: true })
    expect(await persistPatchedEstimate(args())).toBeNull()
    expect(db.log.some((l) => l.op === 'delete')).toBe(true)
    expect(db.rpc).not.toHaveBeenCalled()
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
    expect(db.rpc).toHaveBeenCalledWith('activate_estimate_version', expect.objectContaining({
      p_project_update: expect.objectContaining({ status: 'awaiting_details' }),
    }))
  })

  it('sets the project to awaiting_details when the patched total exceeds the value cap', async () => {
    const db = makeDb()
    vi.stubEnv('ESTIMATE_TOTAL_CEILING_USD', '100')
    try {
      await persistPatchedEstimate(args()) // total 160 > 100
    } finally {
      vi.unstubAllEnvs()
    }
    expect(db.rpc).toHaveBeenCalledWith('activate_estimate_version', expect.objectContaining({
      p_project_update: { total: 160, status: 'awaiting_details' },
    }))
  })
})
