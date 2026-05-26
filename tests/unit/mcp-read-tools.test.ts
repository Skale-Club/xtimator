// tests/unit/mcp-read-tools.test.ts
// Phase 88: unit tests for the 4 read-only MCP tools.
//
// We exercise the handlers directly (via the `__testing` export) so we don't
// have to spin up an MCP Server transport. Supabase is fully mocked — every
// test verifies that the handler scopes its queries to auth.company_id.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the Supabase service client BEFORE the module under test imports it ──

interface QueryRecord {
  table: string
  eq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
  is: Array<[string, unknown]>
  or: string[]
  orderCols: Array<[string, { ascending: boolean }]>
  limit: number | null
  selectArg: string | null
}

const calls: QueryRecord[] = []

// `nextRows` is what the next `.from(...)` chain will resolve to.
// We allow per-table queueing for multi-query handlers (get_estimate hits
// estimates → estimate_sections → estimate_items).
const responseQueue: Record<string, Array<{ data: unknown; error: unknown }>> = {}

function queueResponse(table: string, data: unknown, error: unknown = null) {
  if (!responseQueue[table]) responseQueue[table] = []
  responseQueue[table]!.push({ data, error })
}

function nextResponse(table: string): { data: unknown; error: unknown } {
  const q = responseQueue[table]
  if (!q || q.length === 0) return { data: [], error: null }
  return q.shift()!
}

function buildQuery(table: string, record: QueryRecord, single = false): unknown {
  const chain: Record<string, unknown> = {
    select(arg: string) {
      record.selectArg = arg
      return chain
    },
    eq(col: string, val: unknown) {
      record.eq.push([col, val])
      return chain
    },
    in(col: string, vals: unknown[]) {
      record.in.push([col, vals])
      return chain
    },
    is(col: string, val: unknown) {
      record.is.push([col, val])
      return chain
    },
    or(s: string) {
      record.or.push(s)
      return chain
    },
    order(col: string, opts: { ascending: boolean }) {
      record.orderCols.push([col, opts])
      return chain
    },
    limit(n: number) {
      record.limit = n
      return chain
    },
    maybeSingle() {
      const r = nextResponse(table)
      return Promise.resolve({
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        error: r.error,
      })
    },
    single() {
      const r = nextResponse(table)
      return Promise.resolve({
        data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
        error: r.error,
      })
    },
    then(onFulfilled: (v: { data: unknown; error: unknown }) => unknown) {
      const r = nextResponse(table)
      return Promise.resolve(single
        ? { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
        : r,
      ).then(onFulfilled)
    },
  }
  return chain
}

function makeMockClient() {
  return {
    from(table: string) {
      const record: QueryRecord = {
        table,
        eq: [],
        in: [],
        is: [],
        or: [],
        orderCols: [],
        limit: null,
        selectArg: null,
      }
      calls.push(record)
      return buildQuery(table, record)
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => makeMockClient(),
}))

// Import after the mock is in place.
//
// Phase 89: registerReadTools was replaced by buildReadTools (returns
// { definition, handler } entries) — registration now lives in
// lib/mcp/tools/registry.ts (registerAllTools). The "scope gate via
// registerReadTools" tests below adapt by driving the per-entry handler
// directly, which exercises the same code path that registerAllTools
// dispatches into.
import { __testing, buildReadTools } from '@/lib/mcp/tools/read'
import { registerAllTools } from '@/lib/mcp/tools/registry'
import type { McpAuthContext } from '@/lib/mcp/auth'

const AUTH: McpAuthContext = {
  client_id: 'cli_1',
  user_id: 'user_1',
  company_id: 'co_target',
  scope: ['mcp:read'],
}

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(responseQueue)) delete responseQueue[k]
})

function readContent(result: unknown): unknown {
  const r = result as { content: Array<{ type: string; text: string }> }
  expect(r.content).toBeDefined()
  expect(r.content[0]!.type).toBe('text')
  return JSON.parse(r.content[0]!.text)
}

// ── Tool definitions / annotations ────────────────────────────────────────────

describe('TOOL_DEFINITIONS — annotations', () => {
  const expectedNames = ['list_estimates', 'get_estimate', 'list_clients', 'list_projects']

  it('registers exactly the 4 expected tools', () => {
    expect(__testing.TOOL_DEFINITIONS.map((t) => t.name).sort()).toEqual([...expectedNames].sort())
  })

  for (const name of expectedNames) {
    it(`tool "${name}" carries readOnlyHint: true`, () => {
      const def = __testing.TOOL_DEFINITIONS.find((t) => t.name === name)!
      expect(def.annotations.readOnlyHint).toBe(true)
      expect(def.annotations.destructiveHint).toBe(false)
      expect(def.annotations.idempotentHint).toBe(true)
      expect(def.annotations.title).toBeTruthy()
    })

    it(`tool "${name}" declares an object inputSchema`, () => {
      const def = __testing.TOOL_DEFINITIONS.find((t) => t.name === name)!
      expect(def.inputSchema.type).toBe('object')
    })
  }
})

// ── Input schema validation ──────────────────────────────────────────────────

describe('input schemas', () => {
  it('list_estimates rejects limit > 100', () => {
    const parsed = __testing.listEstimatesInput.safeParse({ limit: 200 })
    expect(parsed.success).toBe(false)
  })

  it('list_estimates accepts no input (defaults applied at handler level)', () => {
    expect(__testing.listEstimatesInput.safeParse({}).success).toBe(true)
  })

  it('get_estimate requires id', () => {
    expect(__testing.getEstimateInput.safeParse({}).success).toBe(false)
    expect(__testing.getEstimateInput.safeParse({ id: 'abc' }).success).toBe(true)
  })

  it('list_clients rejects non-integer limit', () => {
    expect(__testing.listClientsInput.safeParse({ limit: 1.5 }).success).toBe(false)
  })

  it('list_projects accepts optional client_id and status', () => {
    expect(
      __testing.listProjectsInput.safeParse({ client_id: 'c1', status: 'active' }).success,
    ).toBe(true)
  })
})

// ── Tenant scoping (company_id filter) ───────────────────────────────────────

describe('handlers always filter by auth.company_id', () => {
  it('list_estimates queries estimates.company_id = auth.company_id', async () => {
    queueResponse('estimates', [])
    await __testing.handleListEstimates(AUTH, {})
    const estCall = calls.find((c) => c.table === 'estimates')!
    expect(estCall.eq).toContainEqual(['company_id', 'co_target'])
  })

  it('get_estimate filters by id AND company_id', async () => {
    queueResponse('estimates', [{ id: 'e1', company_id: 'co_target' }])
    queueResponse('estimate_sections', [])
    await __testing.handleGetEstimate(AUTH, { id: 'e1' })
    const estCall = calls.find((c) => c.table === 'estimates')!
    expect(estCall.eq).toContainEqual(['id', 'e1'])
    expect(estCall.eq).toContainEqual(['company_id', 'co_target'])
  })

  it('list_clients queries clients.company_id', async () => {
    queueResponse('clients', [])
    await __testing.handleListClients(AUTH, {})
    const c = calls.find((c) => c.table === 'clients')!
    expect(c.eq).toContainEqual(['company_id', 'co_target'])
  })

  it('list_projects queries projects.company_id and excludes archived/trash', async () => {
    queueResponse('projects', [])
    await __testing.handleListProjects(AUTH, {})
    const p = calls.find((c) => c.table === 'projects')!
    expect(p.eq).toContainEqual(['company_id', 'co_target'])
    expect(p.is).toContainEqual(['archived_at', null])
    expect(p.is).toContainEqual(['deleted_at', null])
  })
})

// ── Pagination ───────────────────────────────────────────────────────────────

describe('pagination', () => {
  it('omits nextCursor when result fits in one page', async () => {
    queueResponse('clients', [
      { id: 'a', name: 'A', created_at: '2026-05-01T00:00:00Z' },
      { id: 'b', name: 'B', created_at: '2026-04-01T00:00:00Z' },
    ])
    const r = await __testing.handleListClients(AUTH, { limit: 25 })
    const body = readContent(r) as { items: unknown[]; nextCursor?: string }
    expect(body.items).toHaveLength(2)
    expect(body.nextCursor).toBeUndefined()
  })

  it('emits nextCursor when more rows than limit are returned', async () => {
    // limit = 2 → request fetches 3 (limit+1). If 3 come back, nextCursor included.
    queueResponse('clients', [
      { id: 'a', name: 'A', created_at: '2026-05-03T00:00:00Z' },
      { id: 'b', name: 'B', created_at: '2026-05-02T00:00:00Z' },
      { id: 'c', name: 'C', created_at: '2026-05-01T00:00:00Z' },
    ])
    const r = await __testing.handleListClients(AUTH, { limit: 2 })
    const body = readContent(r) as { items: Array<{ id: string }>; nextCursor?: string }
    expect(body.items).toHaveLength(2)
    expect(body.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(body.nextCursor).toBeTruthy()
    // The cursor points at the LAST item returned (id "b").
    const decoded = JSON.parse(Buffer.from(body.nextCursor!, 'base64').toString('utf8'))
    expect(decoded).toEqual({ id: 'b', created_at: '2026-05-02T00:00:00Z' })
  })

  it('passes the decoded cursor as an or() filter on the next page', async () => {
    queueResponse('estimates', [])
    const cursor = Buffer.from(
      JSON.stringify({ created_at: '2026-05-02T00:00:00Z', id: 'b' }),
      'utf8',
    ).toString('base64')
    await __testing.handleListEstimates(AUTH, { cursor })
    const c = calls.find((c) => c.table === 'estimates')!
    expect(c.or.length).toBe(1)
    expect(c.or[0]).toContain('2026-05-02T00:00:00Z')
    expect(c.or[0]).toContain('"b"')
  })

  it('ignores a malformed cursor (no or() filter applied)', async () => {
    queueResponse('estimates', [])
    await __testing.handleListEstimates(AUTH, { cursor: 'totally-not-base64-!@#' })
    const c = calls.find((c) => c.table === 'estimates')!
    expect(c.or).toHaveLength(0)
  })
})

// ── Scope gate (via buildReadTools entries) ──────────────────────────────────

describe('scope gate via buildReadTools', () => {
  it('throws insufficient_scope when auth lacks mcp:read', async () => {
    const noReadAuth: McpAuthContext = {
      client_id: 'c',
      user_id: 'u',
      company_id: 'co',
      scope: ['mcp:write'],
    }

    const entries = buildReadTools(noReadAuth)
    const entry = entries.find((e) => e.definition.name === 'list_estimates')!
    expect(entry).toBeDefined()

    await expect(entry.handler({})).rejects.toMatchObject({
      data: { kind: 'insufficient_scope' },
    })
  })

  it('allows the call through when auth has mcp:read', async () => {
    queueResponse('clients', [])
    const entries = buildReadTools(AUTH)
    const entry = entries.find((e) => e.definition.name === 'list_clients')!
    const result = await entry.handler({})
    const body = readContent(result) as { items: unknown[] }
    expect(body.items).toEqual([])
  })

  it('registerAllTools throws invalid_input for an unknown tool name', async () => {
    let callHandler:
      | ((req: { params: { name: string; arguments: unknown } }) => Promise<unknown>)
      | null = null
    const fakeServer = {
      setRequestHandler(schema: { shape?: { method?: { value?: string } } }, handler: unknown) {
        if (schema.shape?.method?.value === 'tools/call') {
          callHandler = handler as typeof callHandler
        }
      },
    } as unknown as Parameters<typeof registerAllTools>[0]

    registerAllTools(fakeServer, AUTH)
    await expect(
      callHandler!({ params: { name: 'not_a_tool', arguments: {} } }),
    ).rejects.toMatchObject({
      data: { kind: 'invalid_input' },
    })
  })
})

// ── tools/list response ──────────────────────────────────────────────────────

describe('tools/list response', () => {
  it('buildReadTools returns all 4 read tools with annotations', () => {
    const entries = buildReadTools(AUTH)
    expect(entries).toHaveLength(4)
    const names = entries.map((e) => e.definition.name).sort()
    expect(names).toEqual(['get_estimate', 'list_clients', 'list_estimates', 'list_projects'])
    for (const e of entries) {
      expect(e.definition.annotations.readOnlyHint).toBe(true)
    }
  })
})

// ── get_estimate not found ───────────────────────────────────────────────────

describe('get_estimate', () => {
  it('throws not_found when the estimate does not exist for this company', async () => {
    queueResponse('estimates', null)
    await expect(__testing.handleGetEstimate(AUTH, { id: 'missing' })).rejects.toMatchObject({
      data: { kind: 'not_found' },
    })
  })

  it('returns the full estimate with sections and items on success', async () => {
    queueResponse('estimates', [{ id: 'e1', company_id: 'co_target', status: 'draft' }])
    queueResponse('estimate_sections', [{ id: 's1', sort_order: 0 }])
    queueResponse('estimate_items', [{ id: 'i1', section_id: 's1' }])

    const r = await __testing.handleGetEstimate(AUTH, { id: 'e1' })
    const body = readContent(r) as {
      id: string
      sections: Array<{ id: string; items: Array<{ id: string }> }>
    }
    expect(body.id).toBe('e1')
    expect(body.sections).toHaveLength(1)
    expect(body.sections[0]!.items).toHaveLength(1)
    expect(body.sections[0]!.items[0]!.id).toBe('i1')
  })
})
