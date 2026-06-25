// tests/unit/mcp-knowledge-query-tools.test.ts
// Phase 127: unit tests for the 6 new read-only MCP knowledge/query tools
// (ask_knowledge + the 5 query tools).
//
// We exercise the handlers directly (via the `__testing` export) so we never
// spin up an MCP Server transport. The neutral `@/lib/agent-tools` fns are
// mocked (this is a PURE binding layer — no domain logic to re-test), and the
// Supabase service client is mocked so ask_knowledge's `companies.industries`
// read resolves.
//
// Security tripwire: `'company-SECRET'` is the trusted tenant. A schema-walk
// asserts no tool ever exposes companyId/company_id/tenant/tenantId as input
// (MSEC-01); the only allowed input keys are `question` and `name`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock the Supabase service client BEFORE the module under test imports it ──
// Ported from mcp-read-tools.test.ts (chainable query recorder + per-table
// response queue) so the ask_knowledge `companies` read resolves.

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

function buildQuery(table: string, record: QueryRecord): unknown {
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

// A stable client instance the query handlers receive as the 2nd positional arg.
let MOCK_CLIENT: ReturnType<typeof makeMockClient>

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => MOCK_CLIENT,
}))

// Mock the neutral capabilities — this is a pure binding layer, so we only
// assert how the handlers CALL them + how they wrap the returned string.
vi.mock('@/lib/agent-tools', () => ({
  askKnowledge: vi.fn(),
  findClientByName: vi.fn(),
  getLatestEstimateForClient: vi.fn(),
  getProjectStatus: vi.fn(),
  listRecentEstimates: vi.fn(),
  listServices: vi.fn(),
}))

import {
  askKnowledge,
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  listRecentEstimates,
  listServices,
} from '@/lib/agent-tools'
import { buildKnowledgeQueryTools, __testing } from '@/lib/mcp/tools/knowledge-query'
import type { McpAuthContext } from '@/lib/mcp/auth'

const askKnowledgeMock = vi.mocked(askKnowledge)
const findClientByNameMock = vi.mocked(findClientByName)
const getLatestEstimateForClientMock = vi.mocked(getLatestEstimateForClient)
const getProjectStatusMock = vi.mocked(getProjectStatus)
const listRecentEstimatesMock = vi.mocked(listRecentEstimates)
const listServicesMock = vi.mocked(listServices)

const AUTH: McpAuthContext = {
  client_id: 'c',
  user_id: 'u',
  company_id: 'company-SECRET',
  scope: ['mcp:read'],
}

const FORBIDDEN_KEYS = ['companyId', 'company_id', 'tenant', 'tenantId']

/** Find a built entry by tool name. */
function entry(name: string) {
  const e = buildKnowledgeQueryTools(AUTH).find((x) => x.definition.name === name)
  if (!e) throw new Error(`no tool entry: ${name}`)
  return e
}

/** Read the single text content block from a ToolResult. */
function text(result: unknown): string {
  const r = result as { content: Array<{ type: string; text: string }> }
  expect(r.content).toBeDefined()
  expect(r.content[0]!.type).toBe('text')
  return r.content[0]!.text
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  for (const k of Object.keys(responseQueue)) delete responseQueue[k]
  MOCK_CLIENT = makeMockClient()
})

describe('buildKnowledgeQueryTools — surface', () => {
  it('returns exactly the 6 expected tools', () => {
    const entries = buildKnowledgeQueryTools(AUTH)
    expect(entries).toHaveLength(6)
    const names = entries.map((e) => e.definition.name).sort()
    expect(names).toEqual([
      'ask_knowledge',
      'find_client',
      'get_latest_estimate',
      'get_project_status',
      'list_recent_estimates',
      'list_services',
    ])
  })

  it('every entry exposes a callable handler', () => {
    for (const e of buildKnowledgeQueryTools(AUTH)) {
      expect(typeof e.handler).toBe('function')
    }
  })
})

describe('ask_knowledge (MKB-01)', () => {
  it('reads companies.industries for the trusted company then calls askKnowledge with the scope', async () => {
    queueResponse('companies', { industries: ['plumbing'], default_estimate_language: 'en' })
    askKnowledgeMock.mockResolvedValue('NEUTRAL_RESULT')

    const result = await entry('ask_knowledge').handler({
      question: 'how to flush a water heater',
    })

    // The companies read must be scoped to the TRUSTED tenant, never input.
    const companiesRead = calls.find((c) => c.table === 'companies')
    expect(companiesRead).toBeDefined()
    expect(companiesRead!.eq).toContainEqual(['id', 'company-SECRET'])

    expect(askKnowledgeMock).toHaveBeenCalledWith('how to flush a water heater', {
      industries: ['plumbing'],
      companyId: 'company-SECRET',
      language: 'en',
    })
    expect(result).toEqual({ content: [{ type: 'text', text: 'NEUTRAL_RESULT' }] })
  })

  it('coalesces a missing companies row to industries:[] and no language', async () => {
    queueResponse('companies', null)
    askKnowledgeMock.mockResolvedValue('NEUTRAL_RESULT')

    await entry('ask_knowledge').handler({ question: 'q' })

    expect(askKnowledgeMock).toHaveBeenCalledWith('q', {
      industries: [],
      companyId: 'company-SECRET',
      language: undefined,
    })
  })

  it("inputSchema's only property key is `question` (required)", () => {
    const def = entry('ask_knowledge').definition
    const props = (def.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(Object.keys(props)).toEqual(['question'])
    expect((def.inputSchema as { required?: string[] }).required).toEqual(['question'])
  })
})

describe('query tools (MQRY-01) — trusted companyId + service client as first positional args', () => {
  it('find_client(company, supabase, name) → raw string content', async () => {
    findClientByNameMock.mockResolvedValue('NEUTRAL_RESULT')
    const result = await entry('find_client').handler({ name: 'João' })
    expect(findClientByNameMock).toHaveBeenCalledWith('company-SECRET', MOCK_CLIENT, 'João')
    expect(text(result)).toBe('NEUTRAL_RESULT')
  })

  it('get_latest_estimate(company, supabase, name) → raw string content', async () => {
    getLatestEstimateForClientMock.mockResolvedValue('NEUTRAL_RESULT')
    const result = await entry('get_latest_estimate').handler({ name: 'João' })
    expect(getLatestEstimateForClientMock).toHaveBeenCalledWith('company-SECRET', MOCK_CLIENT, 'João')
    expect(text(result)).toBe('NEUTRAL_RESULT')
  })

  it('get_project_status(company, supabase, name) → raw string content', async () => {
    getProjectStatusMock.mockResolvedValue('NEUTRAL_RESULT')
    const result = await entry('get_project_status').handler({ name: 'João' })
    expect(getProjectStatusMock).toHaveBeenCalledWith('company-SECRET', MOCK_CLIENT, 'João')
    expect(text(result)).toBe('NEUTRAL_RESULT')
  })

  it('list_recent_estimates(company, supabase) → raw string content, no name input', async () => {
    listRecentEstimatesMock.mockResolvedValue('NEUTRAL_RESULT')
    const result = await entry('list_recent_estimates').handler({})
    expect(listRecentEstimatesMock).toHaveBeenCalledWith('company-SECRET', MOCK_CLIENT)
    expect(text(result)).toBe('NEUTRAL_RESULT')
  })

  it('list_services(company, supabase) → raw string content, no name input', async () => {
    listServicesMock.mockResolvedValue('NEUTRAL_RESULT')
    const result = await entry('list_services').handler({})
    expect(listServicesMock).toHaveBeenCalledWith('company-SECRET', MOCK_CLIENT)
    expect(text(result)).toBe('NEUTRAL_RESULT')
  })

  it('emits the neutral string verbatim — NOT a JSON.stringify-wrapped value', async () => {
    findClientByNameMock.mockResolvedValue('- Acme (555-1212)')
    const result = await entry('find_client').handler({ name: 'Acme' })
    // A JSON.stringify-wrapped string would be `"\"- Acme...\""` — assert it is NOT.
    expect(text(result)).toBe('- Acme (555-1212)')
    expect(text(result)).not.toMatch(/^"/)
  })
})

describe('MSEC-01 — no tenant key in any inputSchema', () => {
  it('walks every tool inputSchema; no companyId/company_id/tenant/tenantId; only question/name', () => {
    for (const e of buildKnowledgeQueryTools(AUTH)) {
      const schema = e.definition.inputSchema as {
        properties?: Record<string, unknown>
      }
      const keys = Object.keys(schema.properties ?? {})
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, `${e.definition.name} must not expose ${forbidden}`).not.toContain(forbidden)
      }
      // Allowed keys are ONLY question / name (or none for the listers).
      for (const k of keys) {
        expect(['question', 'name']).toContain(k)
      }
    }
  })

  it('the name-takers expose exactly { name }; the listers expose no properties', () => {
    for (const name of ['find_client', 'get_latest_estimate', 'get_project_status']) {
      const props =
        (entry(name).definition.inputSchema as { properties?: Record<string, unknown> })
          .properties ?? {}
      expect(Object.keys(props)).toEqual(['name'])
    }
    for (const name of ['list_recent_estimates', 'list_services']) {
      const props =
        (entry(name).definition.inputSchema as { properties?: Record<string, unknown> })
          .properties ?? {}
      expect(Object.keys(props)).toEqual([])
    }
  })
})

describe('MSEC-02 — read-only annotations on all 6 tools', () => {
  it('every tool carries readOnlyHint:true + destructiveHint:false', () => {
    for (const e of buildKnowledgeQueryTools(AUTH)) {
      expect(e.definition.annotations.readOnlyHint, e.definition.name).toBe(true)
      expect(e.definition.annotations.destructiveHint, e.definition.name).toBe(false)
    }
  })
})

describe('__testing export', () => {
  it('exposes the 6 handlers + 6 definitions for direct drive', () => {
    expect(__testing).toBeDefined()
    expect(__testing.TOOL_DEFINITIONS).toHaveLength(6)
  })
})
