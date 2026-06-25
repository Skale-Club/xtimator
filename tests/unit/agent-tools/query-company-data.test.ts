import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NEUT-02 (RED scaffold) — neutral company data-reads.
 *
 * The bodies of lib/whatsapp/query-tools.ts's six tools are extracted VERBATIM
 * into PLAIN functions in lib/agent-tools/query-company-data.ts (no LangChain
 * `tool()` wrapper, no zod schema). The channel-neutral contract:
 *   - companyId is the FIRST positional PARAM (trusted, never an LLM tool-input
 *     field — T-lrf-01 isolation moves from "no schema field" to "param-only").
 *   - Every tenant-table query still chains .eq('company_id', companyId).
 *   - Output strings are PARITY-IDENTICAL to the WhatsApp tools today.
 *
 * This file is RED by missing module (`@/lib/agent-tools/query-company-data`
 * does not exist until Plan 122-02). Module-not-found is the correct RED state.
 */

import {
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  listRecentEstimates,
  listServices,
  findServiceByName,
} from '@/lib/agent-tools/query-company-data'

// ---------------------------------------------------------------------------
// Chainable supabase mock that records every .eq('company_id', ...) call.
// Ported from tests/unit/whatsapp/query-tools.test.ts.
// ---------------------------------------------------------------------------
type Capture = { table: string; companyIdEq: string | null }

function makeSupabaseMock(resultRows: Record<string, unknown[]>) {
  const captures: Capture[] = []

  function builder(table: string) {
    const cap: Capture = { table, companyIdEq: null }
    captures.push(cap)
    const rows = resultRows[table] ?? []
    const chain: Record<string, unknown> = {}
    const resolved = { data: rows, error: null }

    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((col: string, val: string) => {
      if (col === 'company_id') cap.companyIdEq = val
      return chain
    })
    chain.ilike = vi.fn(() => chain)
    chain.in = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => Promise.resolve(resolved))
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null }))
    chain.single = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error: null }))
    chain.then = (resolve: (v: typeof resolved) => unknown) => resolve(resolved)
    return chain
  }

  const client = { from: vi.fn((table: string) => builder(table)) }
  return { client: client as never, captures }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('query-company-data — multi-tenant isolation (T-lrf-01)', () => {
  it('Test 1a: every neutral function filters tenant tables by the closure companyId', async () => {
    const { client, captures } = makeSupabaseMock({
      clients: [{ id: 'c1', name: 'Joao', company_id: 'company-SECRET' }],
      projects: [
        { id: 'p1', name: 'Deck', status: 'draft', total: 100, client_id: 'c1', company_id: 'company-SECRET' },
      ],
      estimates: [
        { id: 'e1', total: 500, currency_code: 'USD', created_at: '2026-06-01T00:00:00Z', company_id: 'company-SECRET' },
      ],
      company_price_book: [
        { id: 's1', name: 'Drywall', unit: 'sqft', unit_price: 3.5, currency_code: 'USD', company_id: 'company-SECRET' },
      ],
    })

    // companyId is the FIRST positional param — the LLM physically cannot supply it.
    await findClientByName('company-SECRET', client, 'Joao')
    await getLatestEstimateForClient('company-SECRET', client, 'Joao')
    await getProjectStatus('company-SECRET', client, 'Deck')
    await listRecentEstimates('company-SECRET', client)
    await listServices('company-SECRET', client)
    await findServiceByName('company-SECRET', client, 'Drywall')

    const tenantTables = ['clients', 'projects', 'estimates', 'company_price_book']
    const tenantCaptures = captures.filter((c) => tenantTables.includes(c.table))
    expect(tenantCaptures.length).toBeGreaterThan(0)
    for (const c of tenantCaptures) {
      expect(c.companyIdEq).toBe('company-SECRET')
    }
  })
})

describe('query-company-data — behavior parity', () => {
  it('Test 2: findClientByName with no match returns a not-found string (no throw)', async () => {
    const { client } = makeSupabaseMock({ clients: [] })
    const out = await findClientByName('company-1', client, 'Nobody')
    expect(typeof out).toBe('string')
    expect(out.toLowerCase()).toMatch(/no|not found/)
  })

  it('Test 3: getLatestEstimateForClient returns total + created date for a matched client', async () => {
    const { client } = makeSupabaseMock({
      clients: [{ id: 'c1', name: 'Joao', company_id: 'company-1' }],
      projects: [{ id: 'p1', name: 'Deck', client_id: 'c1', company_id: 'company-1' }],
      estimates: [
        {
          id: 'e1',
          total: 1234,
          currency_code: 'USD',
          created_at: '2026-06-01T12:00:00Z',
          company_id: 'company-1',
        },
      ],
    })
    const out = await getLatestEstimateForClient('company-1', client, 'Joao')
    expect(out).toMatch(/1,?234/)
    expect(out).toContain('2026-06-01')
  })

  it('Test 4: listServices formats price-book items; empty + findServiceByName no-match handled', async () => {
    const withItems = makeSupabaseMock({
      company_price_book: [
        { id: 's1', name: 'Drywall', unit: 'sqft', unit_price: 3.5, currency_code: 'USD', company_id: 'company-1' },
      ],
    })
    const listed = await listServices('company-1', withItems.client)
    expect(listed).toContain('Drywall')
    expect(listed).toMatch(/3\.50|3,50/)

    const empty = makeSupabaseMock({ company_price_book: [] })
    const emptyOut = await listServices('company-1', empty.client)
    expect(emptyOut.toLowerCase()).toMatch(/no service|on file/)

    const noMatch = await findServiceByName('company-1', empty.client, 'Nothing')
    expect(noMatch.toLowerCase()).toMatch(/no|not found/)
  })
})
