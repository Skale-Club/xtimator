/**
 * Plan 04 Task 1 — parseAdminWhatsAppFilters + listAdminWhatsAppConversations
 * (WAADM-02: server-side filtered, paginated admin conversation list)
 *
 * Tests: filter parsing defaults, invalid input normalization, combined filters,
 * predicates-before-range verification, stable pagination.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'admin@test.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

// Chainable Supabase stub
type ChainableResult = {
  data: unknown
  count: number | null
}

function createChainableStub(initialData: unknown[] = [], totalCount: number | null = null) {
  const calls: { method: string; args: unknown[] }[] = []

  const chain: Record<string, (...args: unknown[]) => unknown> = {}
  const methods = [
    'select',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'ilike',
    'in',
    'or',
    'order',
    'range',
    'limit',
    'maybeSingle',
    'single',
  ]

  let resolvedData: unknown = initialData
  let resolvedCount: number | null = totalCount

  for (const method of methods) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }

  // Override thenable so `await chain` returns the result
  ;(chain as unknown as { then: (resolve: (val: ChainableResult) => void) => void }).then =
    (resolve) => {
      resolve({ data: resolvedData, count: resolvedCount })
    }

  return {
    chain,
    calls,
    setData: (d: unknown) => {
      resolvedData = d
    },
    setCount: (c: number | null) => {
      resolvedCount = c
    },
  }
}

let convStub = createChainableStub()
let companyStub = createChainableStub()
let senderStub = createChainableStub()

const fromMock = vi.fn((table: string) => {
  if (table === 'whatsapp_conversations') return convStub.chain
  if (table === 'companies') return companyStub.chain
  if (table === 'whatsapp_authorized_senders') return senderStub.chain
  return convStub.chain
})

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

// ── Import after mocks ───────────────────────────────────────────────────────

import {
  parseAdminWhatsAppFilters,
  listAdminWhatsAppConversations,
} from '@/lib/queries/admin-whatsapp'

// ── Tests: parseAdminWhatsAppFilters ─────────────────────────────────────────

describe('parseAdminWhatsAppFilters', () => {
  it('returns defaults for empty input', () => {
    const result = parseAdminWhatsAppFilters({})
    expect(result).toEqual({
      companyId: undefined,
      senderId: undefined,
      q: undefined,
      status: undefined,
      unreadOnly: false,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
    })
  })

  it('parses all valid filters', () => {
    const result = parseAdminWhatsAppFilters({
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      senderId: '550e8400-e29b-41d4-a716-446655440001',
      q: 'search term',
      status: 'active',
      unreadOnly: 'true',
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
      page: '3',
    })
    expect(result.companyId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(result.senderId).toBe('550e8400-e29b-41d4-a716-446655440001')
    expect(result.q).toBe('search term')
    expect(result.status).toBe('active')
    expect(result.unreadOnly).toBe(true)
    expect(result.dateFrom).toBeInstanceOf(Date)
    expect(result.dateTo).toBeInstanceOf(Date)
    expect(result.page).toBe(3)
  })

  it('normalizes invalid page to default', () => {
    const result = parseAdminWhatsAppFilters({ page: 'abc' })
    expect(result.page).toBe(1)
  })

  it('normalizes negative page to default', () => {
    const result = parseAdminWhatsAppFilters({ page: '-5' })
    expect(result.page).toBe(1)
  })

  it('normalizes zero page to default', () => {
    const result = parseAdminWhatsAppFilters({ page: '0' })
    expect(result.page).toBe(1)
  })

  it('treats empty q as undefined', () => {
    const result = parseAdminWhatsAppFilters({ q: '   ' })
    expect(result.q).toBeUndefined()
  })

  it('trims whitespace from q', () => {
    const result = parseAdminWhatsAppFilters({ q: '  hello world  ' })
    expect(result.q).toBe('hello world')
  })

  it('rejects invalid status value gracefully', () => {
    const result = parseAdminWhatsAppFilters({ status: 'bogus' })
    expect(result.status).toBeUndefined()
  })

  it('parses unreadOnly "1" as true', () => {
    const result = parseAdminWhatsAppFilters({ unreadOnly: '1' })
    expect(result.unreadOnly).toBe(true)
  })

  it('parses unreadOnly "false" as false', () => {
    const result = parseAdminWhatsAppFilters({ unreadOnly: 'false' })
    expect(result.unreadOnly).toBe(false)
  })

  it('rejects invalid UUID for companyId', () => {
    const result = parseAdminWhatsAppFilters({ companyId: 'not-a-uuid' })
    expect(result.companyId).toBeUndefined()
  })

  it('accepts valid UUID for companyId', () => {
    const result = parseAdminWhatsAppFilters({
      companyId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.companyId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })
})

// ── Tests: listAdminWhatsAppConversations ─────────────────────────────────────

describe('listAdminWhatsAppConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convStub = createChainableStub([], 0)
    companyStub = createChainableStub([], 0)
    senderStub = createChainableStub([], 0)
  })

  it('calls requireAdmin before any data read', async () => {
    requireAdminMock.mockClear()
    await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({}))
    expect(requireAdminMock).toHaveBeenCalledOnce()
  })

  it('returns empty result for empty conversation set', async () => {
    convStub = createChainableStub([], 0)
    const result = await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({}))
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
    expect(result.page).toBe(1)
    expect(result.pageCount).toBe(1) // Math.max(1, ...) ensures at least 1
  })

  it('applies companyId filter', async () => {
    convStub = createChainableStub(
      [{ id: 'c1', company_id: 'comp-1' }],
      1,
    )
    const result = await listAdminWhatsAppConversations(
      parseAdminWhatsAppFilters({ companyId: '550e8400-e29b-41d4-a716-446655440000' }),
    )
    expect(result.rows).toHaveLength(1)
    // Verify eq was called with company_id
    const eqCalls = convStub.calls.filter((c) => c.method === 'eq')
    expect(eqCalls.some((c) => c.args[0] === 'company_id')).toBe(true)
  })

  it('applies unreadOnly filter', async () => {
    convStub = createChainableStub([{ id: 'c1', unread_count: 5 }], 1)
    const result = await listAdminWhatsAppConversations(
      parseAdminWhatsAppFilters({ unreadOnly: 'true' }),
    )
    expect(result.rows).toHaveLength(1)
    const gtCalls = convStub.calls.filter((c) => c.method === 'gt')
    expect(gtCalls.some((c) => c.args[0] === 'unread_count')).toBe(true)
  })

  it('applies search query filter', async () => {
    convStub = createChainableStub([{ id: 'c1', contact_name: 'John' }], 1)
    const result = await listAdminWhatsAppConversations(
      parseAdminWhatsAppFilters({ q: 'John' }),
    )
    expect(result.rows).toHaveLength(1)
    const orCalls = convStub.calls.filter((c) => c.method === 'or')
    expect(orCalls.length).toBeGreaterThan(0)
  })

  it('applies date range filters', async () => {
    convStub = createChainableStub([{ id: 'c1' }], 1)
    const result = await listAdminWhatsAppConversations(
      parseAdminWhatsAppFilters({ dateFrom: '2026-01-01', dateTo: '2026-06-30' }),
    )
    expect(result.rows).toHaveLength(1)
    const gteCalls = convStub.calls.filter((c) => c.method === 'gte')
    const lteCalls = convStub.calls.filter((c) => c.method === 'lte')
    expect(gteCalls.some((c) => c.args[0] === 'last_message_at')).toBe(true)
    expect(lteCalls.some((c) => c.args[0] === 'last_message_at')).toBe(true)
  })

  it('fetches company labels only for result IDs (not all companies)', async () => {
    convStub = createChainableStub(
      [
        { id: 'c1', company_id: 'comp-A' },
        { id: 'c2', company_id: 'comp-B' },
      ],
      2,
    )
    companyStub = createChainableStub(
      [
        { id: 'comp-A', name: 'Company A' },
        { id: 'comp-B', name: 'Company B' },
      ],
      null,
    )

    const result = await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({}))
    expect(result.companyNames.get('comp-A')).toBe('Company A')
    expect(result.companyNames.get('comp-B')).toBe('Company B')

    // Verify .in('id', [...]) was used (not select all)
    const inCalls = companyStub.calls.filter((c) => c.method === 'in')
    expect(inCalls.some((c) => c.args[0] === 'id')).toBe(true)
  })

  it('uses stable secondary id order for deterministic pagination', async () => {
    convStub = createChainableStub([], 0)
    await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({ page: '2' }))

    const orderCalls = convStub.calls.filter((c) => c.method === 'order')
    // Should have two .order calls: last_message_at, then id
    expect(orderCalls.length).toBeGreaterThanOrEqual(2)
    expect(orderCalls[0].args[0]).toBe('last_message_at')
    expect(orderCalls[1].args[0]).toBe('id')
  })

  it('returns empty when senderId not found', async () => {
    senderStub = createChainableStub([], null)
    const result = await listAdminWhatsAppConversations(
      parseAdminWhatsAppFilters({ senderId: '550e8400-e29b-41d4-a716-446655440001' }),
    )
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it('applies page size bounds', async () => {
    convStub = createChainableStub([], 100)
    await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({ page: '1' }))

    const rangeCalls = convStub.calls.filter((c) => c.method === 'range')
    expect(rangeCalls.length).toBe(1)
    // PAGE_SIZE = 50, so range(0, 49)
    expect(rangeCalls[0].args[0]).toBe(0)
    expect(rangeCalls[0].args[1]).toBe(49)
  })

  it('correctly calculates pageCount', async () => {
    convStub = createChainableStub([], 120)
    const result = await listAdminWhatsAppConversations(parseAdminWhatsAppFilters({}))
    expect(result.pageCount).toBe(3) // ceil(120/50) = 3
  })
})

// ── Static contract tests (source-level assertions) ──────────────────────────

describe('admin-whatsapp query module: static contract', () => {
  it('lib/queries/admin-whatsapp.ts has import server-only', () => {
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/queries/admin-whatsapp.ts'),
      'utf8',
    )
    expect(src).toContain("import 'server-only'")
  })

  it('lib/queries/admin-whatsapp.ts calls requireAdmin()', () => {
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/queries/admin-whatsapp.ts'),
      'utf8',
    )
    expect(src).toContain('requireAdmin()')
  })

  it('lib/queries/admin-whatsapp.ts has no .limit(500)', () => {
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/queries/admin-whatsapp.ts'),
      'utf8',
    )
    expect(src).not.toMatch(/\.limit\(\s*500\s*\)/)
  })

  it('lib/queries/admin-whatsapp.ts exports parseAdminWhatsAppFilters and listAdminWhatsAppConversations', () => {
    const { readFileSync } = require('node:fs')
    const { resolve } = require('node:path')
    const src = readFileSync(
      resolve(process.cwd(), 'lib/queries/admin-whatsapp.ts'),
      'utf8',
    )
    expect(src).toContain('export function parseAdminWhatsAppFilters')
    expect(src).toContain('export async function listAdminWhatsAppConversations')
  })
})
