import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { McpAuthContext } from '@/lib/mcp/auth'

const DEMO_COMPANY_ID = '0000de00-0000-0000-0000-000000000001'
const NORMAL_COMPANY_ID = 'company-normal'
const READONLY_MESSAGE =
  'This is a read-only demo. Create a free account to make changes.'

const mocks = vi.hoisted(() => ({
  assertCompanyWritable: vi.fn(),
  requireServiceClient: vi.fn(),
  checkCredits: vi.fn(),
  inngestSend: vi.fn(),
  recordJobOwnership: vi.fn(),
  embed: vi.fn(),
  checkAgenticSendRateLimit: vi.fn(),
  createSendConfirmation: vi.fn(),
  resolvePendingByChannelRef: vi.fn(),
  resolveByToken: vi.fn(),
  markConfirmed: vi.fn(),
  markCancelled: vi.fn(),
  markRefused: vi.fn(),
  verifyBinding: vi.fn(),
  assertSendAllowed: vi.fn(),
  dispatchCustomerMessage: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  DEMO_READONLY_MESSAGE:
    'This is a read-only demo. Create a free account to make changes.',
  assertCompanyWritable: (...args: unknown[]) =>
    mocks.assertCompanyWritable(...args),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) =>
    mocks.requireServiceClient(...args),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: (...args: unknown[]) => mocks.checkCredits(...args),
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: (...args: unknown[]) => mocks.inngestSend(...args),
  },
}))

vi.mock('@/lib/inngest/job-ownership', () => ({
  recordJobOwnership: (...args: unknown[]) =>
    mocks.recordJobOwnership(...args),
}))

vi.mock('@/lib/knowledge/embed', () => ({
  embed: (...args: unknown[]) => mocks.embed(...args),
}))

vi.mock('@/lib/notifications/agentic-send-confirm', () => ({
  checkAgenticSendRateLimit: (...args: unknown[]) =>
    mocks.checkAgenticSendRateLimit(...args),
  createSendConfirmation: (...args: unknown[]) =>
    mocks.createSendConfirmation(...args),
  resolvePendingByChannelRef: (...args: unknown[]) =>
    mocks.resolvePendingByChannelRef(...args),
  resolveByToken: (...args: unknown[]) => mocks.resolveByToken(...args),
  markConfirmed: (...args: unknown[]) => mocks.markConfirmed(...args),
  markCancelled: (...args: unknown[]) => mocks.markCancelled(...args),
  markRefused: (...args: unknown[]) => mocks.markRefused(...args),
  verifyBinding: (...args: unknown[]) => mocks.verifyBinding(...args),
}))

vi.mock('@/lib/notifications/customer-send-gate', () => ({
  assertSendAllowed: (...args: unknown[]) =>
    mocks.assertSendAllowed(...args),
}))

vi.mock('@/lib/notifications/customer-send', () => ({
  sendCustomerMessage: (...args: unknown[]) =>
    mocks.dispatchCustomerMessage(...args),
}))

import { __testing as mcpTools } from '@/lib/mcp/tools/write'
import { createEstimate } from '@/lib/agent-tools/create-estimate'
import { createProject } from '@/lib/agent-tools/create-project'
import { createPriceBookService } from '@/lib/agent-tools/create-service'
import { addCompanyKnowledge } from '@/lib/agent-tools/add-knowledge'
import {
  cancelSendByChannelRef,
  confirmSendByChannelRef,
  confirmSendByToken,
  draftCustomerMessage,
} from '@/lib/agent-tools/send-customer-message'

type QueryResult = { data: unknown; error: null }

function makeQuery(result: QueryResult = { data: null, error: null }) {
  const chain: Record<string, unknown> = {}
  for (const method of [
    'select',
    'eq',
    'ilike',
    'limit',
    'insert',
    'order',
    'is',
    'or',
  ]) {
    chain[method] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(async () => result)
  chain.single = vi.fn(async () => result)
  chain.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return chain
}

function makeServiceClient() {
  const projectQuery = makeQuery({
    data: { id: 'project-1', company_id: NORMAL_COMPANY_ID },
    error: null,
  })
  const defaultQuery = makeQuery()
  return {
    from: vi.fn((table: string) =>
      table === 'projects' ? projectQuery : defaultQuery),
  } as unknown as SupabaseClient
}

function makeEffectClient() {
  return {
    from: vi.fn(() => makeQuery()),
  } as unknown as SupabaseClient
}

const DEMO_AUTH: McpAuthContext = {
  client_id: 'stale-client',
  user_id: 'stale-demo-user',
  company_id: DEMO_COMPANY_ID,
  scope: ['mcp:read', 'mcp:write'],
}

const NORMAL_AUTH: McpAuthContext = {
  client_id: 'normal-client',
  user_id: 'normal-user',
  company_id: NORMAL_COMPANY_ID,
  scope: ['mcp:read', 'mcp:write'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertCompanyWritable.mockImplementation(
    async (companyId?: string | null) =>
      companyId === DEMO_COMPANY_ID ? { error: READONLY_MESSAGE } : null,
  )
  mocks.requireServiceClient.mockImplementation(() => makeServiceClient())
  mocks.checkCredits.mockResolvedValue({
    allowed: true,
    balance: 100,
    shortfall: 0,
  })
  mocks.inngestSend.mockResolvedValue({ ids: ['event-1'] })
  mocks.recordJobOwnership.mockResolvedValue(undefined)
  mocks.embed.mockResolvedValue([0.1, 0.2])
  mocks.checkAgenticSendRateLimit.mockResolvedValue(true)
  mocks.createSendConfirmation.mockResolvedValue({
    id: 'confirmation-1',
    token: 'token-1',
    expiresAt: '2026-07-27T00:00:00.000Z',
  })
  mocks.resolvePendingByChannelRef.mockResolvedValue(null)
  mocks.resolveByToken.mockResolvedValue(null)
  mocks.markConfirmed.mockResolvedValue(true)
  mocks.markCancelled.mockResolvedValue(undefined)
  mocks.markRefused.mockResolvedValue(undefined)
  mocks.verifyBinding.mockReturnValue(true)
  mocks.assertSendAllowed.mockResolvedValue({
    allowed: false,
    reason: 'suppressed',
  })
  mocks.dispatchCustomerMessage.mockResolvedValue({ ok: true })
})

describe('SAFE-02: MCP bearer-context boundaries', () => {
  const writes: Array<{
    name: string
    handler: (auth: McpAuthContext, args: unknown) => Promise<unknown>
    args: Record<string, unknown>
  }> = [
    {
      name: 'create_estimate',
      handler: mcpTools.handleCreateEstimate,
      args: { project_id: 'project-1', prompt: 'Replace the roof' },
    },
    {
      name: 'create_project',
      handler: mcpTools.handleCreateProject,
      args: { name: 'Roof replacement' },
    },
    {
      name: 'add_service',
      handler: mcpTools.handleAddService,
      args: { name: 'Roofing labor', unit_price: 500 },
    },
    {
      name: 'add_knowledge',
      handler: mcpTools.handleAddKnowledge,
      args: { title: 'Warranty', body: 'Ten-year workmanship warranty.' },
    },
    {
      name: 'draft_customer_message',
      handler: mcpTools.handleDraftCustomerMessage,
      args: {
        client_name: 'Jane',
        channel: 'email',
        body: 'Your estimate is ready.',
      },
    },
    {
      name: 'send_customer_message',
      handler: mcpTools.handleSendCustomerMessage,
      args: { confirmation_token: 'token-1' },
    },
  ]

  for (const write of writes) {
    it(`rejects stale demo-company bearer context before ${write.name} service/effect access`, async () => {
      await expect(write.handler(DEMO_AUTH, write.args)).rejects.toThrow(
        /read-only demo/i,
      )

      expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
        DEMO_COMPANY_ID,
      )
      expect(mocks.requireServiceClient).not.toHaveBeenCalled()
      expect(mocks.checkCredits).not.toHaveBeenCalled()
      expect(mocks.inngestSend).not.toHaveBeenCalled()
      expect(mocks.embed).not.toHaveBeenCalled()
      expect(mocks.checkAgenticSendRateLimit).not.toHaveBeenCalled()
      expect(mocks.createSendConfirmation).not.toHaveBeenCalled()
      expect(mocks.dispatchCustomerMessage).not.toHaveBeenCalled()
    })
  }

  it('keeps the read-only check_job_status tool available to demo bearer context', async () => {
    const previousDev = process.env.INNGEST_DEV
    process.env.INNGEST_DEV = 'true'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      )

    try {
      const result = await mcpTools.handleCheckJobStatus(DEMO_AUTH, {
        job_id: 'event-1',
      })
      expect(result.content[0]?.text).toContain('"status": "queued"')
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(mocks.assertCompanyWritable).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
      if (previousDev === undefined) delete process.env.INNGEST_DEV
      else process.env.INNGEST_DEV = previousDev
    }
  })

  it('preserves a normal-tenant MCP write path', async () => {
    const result = await mcpTools.handleCreateEstimate(NORMAL_AUTH, {
      project_id: 'project-1',
      prompt: 'Replace the roof',
    })

    expect(result.content[0]?.text).toContain('"job_id": "event-1"')
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(
      NORMAL_COMPANY_ID,
    )
    expect(mocks.inngestSend).toHaveBeenCalledOnce()
  })
})

describe('SAFE-02: channel-neutral agent write boundaries', () => {
  it('denies estimate generation before service-role, credits, enqueue, or ownership writes', async () => {
    await expect(
      createEstimate({
        companyId: DEMO_COMPANY_ID,
        projectId: 'project-1',
      }),
    ).rejects.toThrow(/read-only demo/i)

    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(mocks.checkCredits).not.toHaveBeenCalled()
    expect(mocks.inngestSend).not.toHaveBeenCalled()
    expect(mocks.recordJobOwnership).not.toHaveBeenCalled()
  })

  it('denies project creation before client lookup or persistence', async () => {
    const supabase = makeEffectClient()

    await expect(
      createProject(supabase, DEMO_COMPANY_ID, { name: 'Demo project' }),
    ).rejects.toThrow(/read-only demo/i)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('denies price-book service creation before company lookup or persistence', async () => {
    const supabase = makeEffectClient()

    await expect(
      createPriceBookService(supabase, DEMO_COMPANY_ID, {
        name: 'Demo service',
        unitPrice: 100,
      }),
    ).rejects.toThrow(/read-only demo/i)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('denies company knowledge before embedding or persistence', async () => {
    const supabase = makeEffectClient()

    await expect(
      addCompanyKnowledge(supabase, DEMO_COMPANY_ID, {
        title: 'Demo knowledge',
        body: 'Must never be embedded or saved.',
      }),
    ).rejects.toThrow(/read-only demo/i)

    expect(mocks.embed).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('denies every customer-message draft/confirm/cancel funnel before persistence, gating, or dispatch', async () => {
    const supabase = makeEffectClient()

    const attempts = [
      draftCustomerMessage(supabase, {
        companyId: DEMO_COMPANY_ID,
        clientQuery: 'Jane',
        channel: 'email',
        body: 'Do not send.',
        triggerSource: 'agentic-mcp',
      }),
      confirmSendByChannelRef(
        supabase,
        DEMO_COMPANY_ID,
        'channel-reference',
      ),
      confirmSendByToken(supabase, DEMO_COMPANY_ID, 'token-1'),
      cancelSendByChannelRef(
        supabase,
        DEMO_COMPANY_ID,
        'channel-reference',
      ),
    ]

    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrow(/read-only demo/i)
    }

    expect(mocks.checkAgenticSendRateLimit).not.toHaveBeenCalled()
    expect(mocks.createSendConfirmation).not.toHaveBeenCalled()
    expect(mocks.resolvePendingByChannelRef).not.toHaveBeenCalled()
    expect(mocks.resolveByToken).not.toHaveBeenCalled()
    expect(mocks.markConfirmed).not.toHaveBeenCalled()
    expect(mocks.markCancelled).not.toHaveBeenCalled()
    expect(mocks.assertSendAllowed).not.toHaveBeenCalled()
    expect(mocks.dispatchCustomerMessage).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
