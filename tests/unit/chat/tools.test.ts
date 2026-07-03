/**
 * Behavior contract for lib/chat/tools.ts (CHATBE-02 / CHATBE-03 / T-lrf-01).
 *
 * buildChatTools(ctx) wraps the EIGHT neutral capabilities from @/lib/agent-tools
 * as AI-SDK tools. The contract:
 *   - companyId + supabase are TRUSTED CLOSURE values from ctx — NEVER an
 *     inputSchema field on ANY tool (T-lrf-01). A test walks every tool's
 *     inputSchema and asserts no tenant key.
 *   - createEstimate dispatches the async job and returns
 *     { jobId, status: 'queued' } immediately, with channel: 'web' — it does NOT
 *     await generation (CHATBE-03).
 *   - askKnowledge passes ctx.industries / ctx.companyId / ctx.language.
 *   - each data-read tool calls its neutral fn with ctx.companyId + ctx.supabase
 *     as the FIRST positional args.
 *   - every tool uses `inputSchema` (the v6 field, NOT the v3 `parameters`).
 *
 * The literal 'company-SECRET' is the cross-tenant tripwire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/agent-tools', () => ({
  createEstimate: vi.fn(),
  askKnowledge: vi.fn(),
  findClientByName: vi.fn(),
  getLatestEstimateForClient: vi.fn(),
  getProjectStatus: vi.fn(),
  findServiceByName: vi.fn(),
  listRecentEstimates: vi.fn(),
  listServices: vi.fn(),
}))

import {
  createEstimate,
  askKnowledge,
  findClientByName,
  getLatestEstimateForClient,
  getProjectStatus,
  findServiceByName,
  listRecentEstimates,
  listServices,
} from '@/lib/agent-tools'
import { buildChatTools } from '@/lib/chat/tools'
import { CHAT_SYSTEM_PROMPT } from '@/lib/chat/system-prompt'

const createEstimateMock = vi.mocked(createEstimate)
const askKnowledgeMock = vi.mocked(askKnowledge)
const findClientByNameMock = vi.mocked(findClientByName)
const getLatestEstimateForClientMock = vi.mocked(getLatestEstimateForClient)
const getProjectStatusMock = vi.mocked(getProjectStatus)
const findServiceByNameMock = vi.mocked(findServiceByName)
const listRecentEstimatesMock = vi.mocked(listRecentEstimates)
const listServicesMock = vi.mocked(listServices)

const SUPABASE = { __supabase: true } as never
const CTX = {
  companyId: 'company-SECRET',
  supabase: SUPABASE,
  industries: ['plumbing'],
  language: 'en' as const,
}

/** Invoke a tool's execute() the way the AI SDK does (args, callOptions). */
function exec(tool: { execute?: unknown }, args: unknown): Promise<unknown> {
  const fn = tool.execute as (a: unknown, o: unknown) => Promise<unknown>
  return fn(args, { toolCallId: 'tc-1', messages: [] })
}

/** The forbidden tenant keys that must never appear in any tool inputSchema. */
const FORBIDDEN_KEYS = ['companyId', 'company_id', 'tenant', 'tenantId']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildChatTools — surface', () => {
  it('exposes all neutral capabilities as tools', () => {
    const tools = buildChatTools(CTX)
    expect(Object.keys(tools).sort()).toEqual(
      [
        'addKnowledge',
        'addService',
        'askKnowledge',
        'createEstimate',
        'createProject',
        'findClientByName',
        'findServiceByName',
        'getLatestEstimateForClient',
        'getProjectStatus',
        'listRecentEstimates',
        'listServices',
      ].sort(),
    )
  })
})

describe('createEstimate tool (CHATBE-03)', () => {
  it('dispatches with the trusted companyId + channel:web and returns {jobId,status:queued} without awaiting generation', async () => {
    createEstimateMock.mockResolvedValue({ jobId: 'job-1' })
    const tools = buildChatTools(CTX)

    const result = await exec(tools.createEstimate, {
      projectId: 'proj-9',
      prompts: ['add a deck'],
    })

    expect(createEstimateMock).toHaveBeenCalledWith({
      companyId: 'company-SECRET',
      projectId: 'proj-9',
      prompts: ['add a deck'],
      language: 'en',
      channel: 'web',
    })
    // Resolves to the queued envelope directly — the neutral fn's {jobId} only,
    // never the generated estimate (the job runs asynchronously).
    expect(result).toEqual({ jobId: 'job-1', status: 'queued' })
  })
})

describe('askKnowledge tool', () => {
  it('passes the trusted retrieval scope (industries/companyId/language)', async () => {
    askKnowledgeMock.mockResolvedValue('here is how')
    const tools = buildChatTools(CTX)

    const result = await exec(tools.askKnowledge, { question: 'how do I clean grout?' })

    expect(askKnowledgeMock).toHaveBeenCalledWith('how do I clean grout?', {
      industries: ['plumbing'],
      companyId: 'company-SECRET',
      language: 'en',
    })
    expect(result).toBe('here is how')
  })
})

describe('queryCompanyData tools — trusted companyId + supabase as first positional args', () => {
  it('findClientByName(companyId, supabase, name)', async () => {
    findClientByNameMock.mockResolvedValue('client X')
    const tools = buildChatTools(CTX)
    await exec(tools.findClientByName, { name: 'Acme' })
    expect(findClientByNameMock).toHaveBeenCalledWith('company-SECRET', SUPABASE, 'Acme')
  })

  it('getLatestEstimateForClient(companyId, supabase, name)', async () => {
    getLatestEstimateForClientMock.mockResolvedValue('latest est')
    const tools = buildChatTools(CTX)
    await exec(tools.getLatestEstimateForClient, { name: 'Acme' })
    expect(getLatestEstimateForClientMock).toHaveBeenCalledWith('company-SECRET', SUPABASE, 'Acme')
  })

  it('getProjectStatus(companyId, supabase, name)', async () => {
    getProjectStatusMock.mockResolvedValue('status')
    const tools = buildChatTools(CTX)
    await exec(tools.getProjectStatus, { name: 'Roof job' })
    expect(getProjectStatusMock).toHaveBeenCalledWith('company-SECRET', SUPABASE, 'Roof job')
  })

  it('findServiceByName(companyId, supabase, name)', async () => {
    findServiceByNameMock.mockResolvedValue('service')
    const tools = buildChatTools(CTX)
    await exec(tools.findServiceByName, { name: 'Drywall' })
    expect(findServiceByNameMock).toHaveBeenCalledWith('company-SECRET', SUPABASE, 'Drywall')
  })

  it('listRecentEstimates(companyId, supabase) — no name input', async () => {
    listRecentEstimatesMock.mockResolvedValue('recent')
    const tools = buildChatTools(CTX)
    await exec(tools.listRecentEstimates, {})
    expect(listRecentEstimatesMock).toHaveBeenCalledWith('company-SECRET', SUPABASE)
  })

  it('listServices(companyId, supabase) — no name input', async () => {
    listServicesMock.mockResolvedValue('services')
    const tools = buildChatTools(CTX)
    await exec(tools.listServices, {})
    expect(listServicesMock).toHaveBeenCalledWith('company-SECRET', SUPABASE)
  })
})

describe('T-lrf-01 — no tenant in any tool inputSchema', () => {
  it('every tool uses inputSchema (not parameters) with NO companyId/tenant key', () => {
    const tools = buildChatTools(CTX)
    for (const [name, t] of Object.entries(tools)) {
      const tool = t as { inputSchema?: { shape?: Record<string, unknown> }; parameters?: unknown }
      // The v6 field is `inputSchema`, never the v3 `parameters`.
      expect(tool.inputSchema, `${name} must define inputSchema`).toBeDefined()
      expect(tool.parameters, `${name} must NOT use the v3 parameters field`).toBeUndefined()
      // Walk the zod object's shape keys.
      const keys = Object.keys(tool.inputSchema!.shape ?? {})
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, `${name} inputSchema must not expose ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})

describe('CHAT_SYSTEM_PROMPT', () => {
  it('is a non-empty owner-scoped string', () => {
    expect(typeof CHAT_SYSTEM_PROMPT).toBe('string')
    expect(CHAT_SYSTEM_PROMPT.length).toBeGreaterThan(50)
    // Owner-scoped: it speaks to/about the business owner.
    expect(CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('owner')
  })
})
