// tests/unit/price-book-route.test.ts
//
// Unit tests for GET /api/price-book — structured price-book export for
// first-party programmatic consumers (Thumb Scrap).
//
// Auth (resolveAccessToken / requireScope) is mocked exactly like the /api/mcp
// test suite. Supabase is faked with a small in-memory filter/sort/paginate
// engine (not just call-recording) so pagination completeness, soft-delete
// exclusion, and cross-tenant isolation are genuinely exercised end-to-end
// against the route's actual query-building logic, not merely asserted via
// recorded call arguments.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Auth mocks (mirrors tests/unit/mcp-auth.test.ts / mcp-route-contract.test.ts) ──

vi.mock('@/lib/oauth/issuer', () => ({
  resolveIssuer: vi.fn(async () => 'https://app.example.test'),
}))

const resolveAccessTokenMock = vi.fn()
vi.mock('@/lib/oauth/tokens', () => ({
  resolveAccessToken: (...args: unknown[]) => resolveAccessTokenMock(...args),
}))

// ── Fake Supabase: real filter + sort + limit engine over an in-memory table ──

interface FakeRow {
  id: string
  company_id: string
  name: string
  unit: string | null
  unit_price: number
  pricing_type: string
  base_price: number | null
  price_per_unit: number | null
  minimum_price: number | null
  area_sizes: unknown
  currency_code: string
  notes: string | null
  deleted_at: string | null
}

let TABLE: FakeRow[] = []

interface QueryState {
  selectArg: string
  eq: Array<[string, unknown]>
  is: Array<[string, unknown]>
  orStr: string | null
  orderCols: Array<[string, boolean]>
  limitN: number | null
}

function parseOrCursor(orStr: string): { name: string; id: string } | null {
  // Matches the exact shape built by app/api/price-book/route.ts:
  //   name.gt."<NAME>",and(name.eq."<NAME>",id.gt."<ID>")
  const m = /^name\.gt\."(.+)",and\(name\.eq\."\1",id\.gt\."(.+)"\)$/.exec(orStr)
  if (!m) return null
  return { name: m[1]!, id: m[2]! }
}

function project(row: FakeRow, selectArg: string): Record<string, unknown> {
  const cols = selectArg.split(',').map((c) => c.trim())
  const out: Record<string, unknown> = {}
  for (const c of cols) out[c] = (row as unknown as Record<string, unknown>)[c]
  return out
}

function buildChain(state: QueryState) {
  const chain = {
    select(arg: string) {
      state.selectArg = arg
      return chain
    },
    eq(col: string, val: unknown) {
      state.eq.push([col, val])
      return chain
    },
    is(col: string, val: unknown) {
      state.is.push([col, val])
      return chain
    },
    or(s: string) {
      state.orStr = s
      return chain
    },
    order(col: string, opts: { ascending: boolean }) {
      state.orderCols.push([col, opts.ascending])
      return chain
    },
    limit(n: number) {
      state.limitN = n
      return chain
    },
    then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown) {
      let rows = TABLE.slice()
      for (const [col, val] of state.eq) {
        rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
      }
      for (const [col, val] of state.is) {
        rows = rows.filter((r) =>
          val === null
            ? (r as unknown as Record<string, unknown>)[col] === null
            : (r as unknown as Record<string, unknown>)[col] === val,
        )
      }
      if (state.orStr) {
        const cursor = parseOrCursor(state.orStr)
        if (cursor) {
          rows = rows.filter(
            (r) => r.name > cursor.name || (r.name === cursor.name && r.id > cursor.id),
          )
        }
      }
      for (const [col, ascending] of state.orderCols) {
        rows.sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[col] as string
          const bv = (b as unknown as Record<string, unknown>)[col] as string
          if (av < bv) return ascending ? -1 : 1
          if (av > bv) return ascending ? 1 : -1
          return 0
        })
      }
      if (state.limitN !== null) rows = rows.slice(0, state.limitN)
      const data = rows.map((r) => project(r, state.selectArg))
      return Promise.resolve({ data, error: null }).then(onFulfilled)
    },
  }
  return chain
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      if (table !== 'company_price_book') {
        throw new Error(`fake supabase: unexpected table "${table}"`)
      }
      const state: QueryState = {
        selectArg: '*',
        eq: [],
        is: [],
        orStr: null,
        orderCols: [],
        limitN: null,
      }
      return buildChain(state)
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeFakeSupabase(),
}))

// Import after mocks are in place.
import { GET } from '@/app/api/price-book/route'

function makeRequest(query = '', headers: Record<string, string> = {}): Request {
  return new Request(`https://app.example.test/api/price-book${query}`, {
    method: 'GET',
    headers,
  })
}

function makeRow(overrides: Partial<FakeRow> & { id: string; name: string }): FakeRow {
  return {
    unit: 'each',
    unit_price: 100,
    pricing_type: 'flat',
    base_price: null,
    price_per_unit: null,
    minimum_price: null,
    area_sizes: null,
    currency_code: 'USD',
    notes: null,
    deleted_at: null,
    company_id: 'company-a',
    ...overrides,
  }
}

const REQUIRED_KEYS = [
  'id',
  'name',
  'unit',
  'unit_price',
  'pricing_type',
  'base_price',
  'price_per_unit',
  'minimum_price',
  'area_sizes',
  'currency_code',
  'notes',
].sort()

beforeEach(() => {
  resolveAccessTokenMock.mockReset()
  TABLE = []
})

describe('GET /api/price-book — auth', () => {
  it('401s when the Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata=')
    const body = await res.json()
    expect(body.error).toBe('invalid_token')
    expect(resolveAccessTokenMock).not.toHaveBeenCalled()
  })

  it('401s when the Bearer token does not resolve', async () => {
    resolveAccessTokenMock.mockResolvedValueOnce(null)
    const res = await GET(makeRequest('', { Authorization: 'Bearer bad-token' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /)
  })

  it('403s when the token lacks mcp:read scope', async () => {
    resolveAccessTokenMock.mockResolvedValueOnce({
      client_id: 'cli',
      user_id: 'u1',
      company_id: 'company-a',
      scope: ['mcp:write'],
    })
    const res = await GET(makeRequest('', { Authorization: 'Bearer good-token' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('insufficient_scope')
  })
})

describe('GET /api/price-book — happy path', () => {
  beforeEach(() => {
    resolveAccessTokenMock.mockResolvedValue({
      client_id: 'cli',
      user_id: 'u1',
      company_id: 'company-a',
      scope: ['mcp:read'],
    })
  })

  it('returns the full column set per item', async () => {
    TABLE = [
      makeRow({
        id: 'row-1',
        name: 'Deck Staining',
        unit: 'sqft',
        unit_price: 3.5,
        pricing_type: 'area',
        base_price: 50,
        price_per_unit: 2.5,
        minimum_price: 100,
        area_sizes: [{ label: 'small', price: 100 }],
        currency_code: 'USD',
        notes: 'Includes sealant',
      }),
    ]
    const res = await GET(makeRequest('', { Authorization: 'Bearer t' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(Object.keys(body.items[0]).sort()).toEqual(REQUIRED_KEYS)
    expect(body.items[0]).toMatchObject({
      id: 'row-1',
      name: 'Deck Staining',
      unit: 'sqft',
      unit_price: 3.5,
      pricing_type: 'area',
      base_price: 50,
      price_per_unit: 2.5,
      minimum_price: 100,
      currency_code: 'USD',
      notes: 'Includes sealant',
    })
    expect(body.next_cursor).toBeNull()
  })

  it('excludes soft-deleted rows', async () => {
    TABLE = [
      makeRow({ id: 'row-1', name: 'Active Service' }),
      makeRow({ id: 'row-2', name: 'Gone Service', deleted_at: '2026-01-01T00:00:00Z' }),
    ]
    const res = await GET(makeRequest('', { Authorization: 'Bearer t' }))
    const body = await res.json()
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['row-1'])
  })

  it('never returns another company’s rows', async () => {
    TABLE = [
      makeRow({ id: 'a-1', name: 'A Service', company_id: 'company-a' }),
      makeRow({ id: 'b-1', name: 'B Service', company_id: 'company-b' }),
      makeRow({ id: 'b-2', name: 'B Service 2', company_id: 'company-b' }),
    ]
    const res = await GET(makeRequest('', { Authorization: 'Bearer t' }))
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('a-1')
  })

  it('ignores a company_id supplied in the query string — token wins', async () => {
    TABLE = [
      makeRow({ id: 'a-1', name: 'A Service', company_id: 'company-a' }),
      makeRow({ id: 'b-1', name: 'B Service', company_id: 'company-b' }),
    ]
    const res = await GET(
      makeRequest('?company_id=company-b', { Authorization: 'Bearer t' }),
    )
    const body = await res.json()
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a-1'])
  })
})

describe('GET /api/price-book — pagination', () => {
  beforeEach(() => {
    resolveAccessTokenMock.mockResolvedValue({
      client_id: 'cli',
      user_id: 'u1',
      company_id: 'company-a',
      scope: ['mcp:read'],
    })
  })

  it('retrieves every row across pages with no duplicates or gaps', async () => {
    const total = 47
    TABLE = Array.from({ length: total }, (_, i) =>
      makeRow({
        id: `id-${String(i).padStart(3, '0')}`,
        name: `Service ${String(i).padStart(3, '0')}`,
      }),
    )

    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const qs = cursor
        ? `?limit=10&cursor=${encodeURIComponent(cursor)}`
        : '?limit=10'
      const res = await GET(makeRequest(qs, { Authorization: 'Bearer t' }))
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        items: Array<{ id: string }>
        next_cursor: string | null
      }
      for (const item of body.items) seen.push(item.id)
      cursor = body.next_cursor
      pages += 1
      expect(pages).toBeLessThan(20) // guard against an infinite loop on a bug
    } while (cursor !== null)

    expect(seen).toHaveLength(total)
    expect(new Set(seen).size).toBe(total) // no duplicates
    const expectedIds = TABLE.map((r) => r.id).sort()
    expect(seen.slice().sort()).toEqual(expectedIds) // no gaps
    expect(pages).toBe(5) // 47 rows / 10 per page = 5 pages
  })

  it('returns next_cursor: null on the exact last page (no dangling cursor)', async () => {
    TABLE = Array.from({ length: 10 }, (_, i) =>
      makeRow({ id: `id-${i}`, name: `Service ${String(i).padStart(2, '0')}` }),
    )
    const res = await GET(makeRequest('?limit=10', { Authorization: 'Bearer t' }))
    const body = await res.json()
    expect(body.items).toHaveLength(10)
    expect(body.next_cursor).toBeNull()
  })

  it('clamps limit to the documented [1, 200] range, default 100', async () => {
    TABLE = Array.from({ length: 3 }, (_, i) =>
      makeRow({ id: `id-${i}`, name: `Service ${i}` }),
    )
    const overLimit = await GET(
      makeRequest('?limit=5000', { Authorization: 'Bearer t' }),
    )
    const overBody = await overLimit.json()
    expect(overBody.items).toHaveLength(3) // all 3 rows fit under the clamped max
  })
})
