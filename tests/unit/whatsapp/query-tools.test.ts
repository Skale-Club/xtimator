import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Quick task 260603-lrf — Task 1.
 *
 * makeQueryTools(companyId, supabase) returns company-scoped, read-only
 * LangChain tools. THE #1 SECURITY REQUIREMENT (T-lrf-01):
 *   - companyId is a CLOSURE parameter (trusted, resolved upstream).
 *   - It is NEVER a zod tool-input field.
 *   - Every underlying query chains .eq('company_id', companyId).
 */

import { makeQueryTools } from '@/lib/whatsapp/query-tools'

// ---------------------------------------------------------------------------
// Chainable supabase mock that records every .eq('company_id', ...) call.
// ---------------------------------------------------------------------------
type Capture = { table: string; companyIdEq: string | null }

function makeSupabaseMock(resultRows: Record<string, unknown[]>) {
  const captures: Capture[] = []

  function builder(table: string) {
    const cap: Capture = { table, companyIdEq: null }
    captures.push(cap)
    const rows = resultRows[table] ?? []
    const chain: Record<string, unknown> = {}
    // Thenable so `await chain` resolves to { data, error }
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

describe('makeQueryTools — multi-tenant isolation (T-lrf-01)', () => {
  it('Test 1a: NO tool schema (zod) contains a company_id / companyId field', () => {
    const { client } = makeSupabaseMock({})
    const tools = makeQueryTools('company-SECRET', client)
    expect(tools.length).toBeGreaterThanOrEqual(6)

    for (const t of tools) {
      // LangChain tool schema is exposed as .schema (a zod object)
      const schema = (t as { schema?: { shape?: Record<string, unknown> } }).schema
      const shape = schema?.shape ?? {}
      const keys = Object.keys(shape).map((k) => k.toLowerCase())
      expect(keys).not.toContain('company_id')
      expect(keys).not.toContain('companyid')
    }
  })

  it('Test 1b: every tool query filters by the closure company_id', async () => {
    const { client, captures } = makeSupabaseMock({
      clients: [{ id: 'c1', name: 'Joao', company_id: 'company-SECRET' }],
      projects: [{ id: 'p1', name: 'Deck', status: 'draft', total: 100, company_id: 'company-SECRET' }],
      estimates: [
        { id: 'e1', total: 500, created_at: '2026-06-01T00:00:00Z', company_id: 'company-SECRET' },
      ],
      company_price_book: [
        { id: 's1', name: 'Drywall', unit: 'sqft', unit_price: 3.5, currency_code: 'USD', company_id: 'company-SECRET' },
      ],
    })
    const tools = makeQueryTools('company-SECRET', client)
    const byName = Object.fromEntries(
      tools.map((t) => [(t as { name: string }).name, t])
    ) as Record<string, { invoke: (args: unknown) => Promise<string> }>

    await byName.find_client_by_name.invoke({ name: 'Joao' })
    await byName.get_latest_estimate_for_client.invoke({ name: 'Joao' })
    await byName.get_project_status.invoke({ name: 'Deck' })
    await byName.list_recent_estimates.invoke({})
    await byName.list_services.invoke({})
    await byName.find_service_by_name.invoke({ name: 'Drywall' })

    // Every captured query that touched a tenant table must have filtered by company_id
    const tenantTables = ['clients', 'projects', 'estimates', 'company_price_book']
    const tenantCaptures = captures.filter((c) => tenantTables.includes(c.table))
    expect(tenantCaptures.length).toBeGreaterThan(0)
    for (const c of tenantCaptures) {
      expect(c.companyIdEq).toBe('company-SECRET')
    }
  })
})

describe('makeQueryTools — behavior', () => {
  it('Test 2: find_client_by_name with no match returns a not-found string (no throw)', async () => {
    const { client } = makeSupabaseMock({ clients: [] })
    const tools = makeQueryTools('company-1', client)
    const tool = tools.find((t) => (t as { name: string }).name === 'find_client_by_name') as {
      invoke: (args: unknown) => Promise<string>
    }
    const out = await tool.invoke({ name: 'Nobody' })
    expect(typeof out).toBe('string')
    expect(out.toLowerCase()).toMatch(/no|not found|nenhum/)
  })

  it('Test 3: get_latest_estimate_for_client returns total + created date for a matched client', async () => {
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
    const tools = makeQueryTools('company-1', client)
    const tool = tools.find(
      (t) => (t as { name: string }).name === 'get_latest_estimate_for_client'
    ) as { invoke: (args: unknown) => Promise<string> }
    const out = await tool.invoke({ name: 'Joao' })
    expect(out).toMatch(/1,?234/)
    expect(out).toContain('2026-06-01')
  })

  it('Test 4: list_services formats price-book items; find_service_by_name handles no match', async () => {
    const withItems = makeSupabaseMock({
      company_price_book: [
        { id: 's1', name: 'Drywall', unit: 'sqft', unit_price: 3.5, currency_code: 'USD', company_id: 'company-1' },
      ],
    })
    const tools = makeQueryTools('company-1', withItems.client)
    const byName = Object.fromEntries(
      tools.map((t) => [(t as { name: string }).name, t])
    ) as Record<string, { invoke: (a: unknown) => Promise<string> }>
    const listed = await byName.list_services.invoke({})
    expect(listed).toContain('Drywall')
    expect(listed).toMatch(/3\.50|3,50/)

    const empty = makeSupabaseMock({ company_price_book: [] })
    const emptyTools = makeQueryTools('company-1', empty.client)
    const emptyByName = Object.fromEntries(
      emptyTools.map((t) => [(t as { name: string }).name, t])
    ) as Record<string, { invoke: (a: unknown) => Promise<string> }>
    const emptyOut = await emptyByName.list_services.invoke({})
    expect(emptyOut.toLowerCase()).toMatch(/no service|on file/)

    const noMatch = await emptyByName.find_service_by_name.invoke({ name: 'Nothing' })
    expect(noMatch.toLowerCase()).toMatch(/no|not found/)
  })
})
