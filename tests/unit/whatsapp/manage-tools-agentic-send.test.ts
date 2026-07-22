import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 178 Plan 03 (AGENT-01) — Task 1.
 *
 * makeManageTools(companyId, supabase, ownerPhone) gains draft_customer_message
 * (binds the channel-neutral draftCustomerMessage) and get_latest_estimate_for_client
 * (thin wrapper over the neutral getLatestEstimateForClient, same function
 * query-tools.ts already binds). Tests call each tool's underlying `.func`
 * directly — no ReAct agent — mirroring "test a server action directly".
 */

const mockDraftCustomerMessage = vi.fn()
const mockGetLatestEstimateForClient = vi.fn()
const mockCreatePriceBookService = vi.fn()
const mockAddCompanyKnowledge = vi.fn()

vi.mock('@/lib/agent-tools', () => ({
  draftCustomerMessage: (...a: unknown[]) => mockDraftCustomerMessage(...a),
  getLatestEstimateForClient: (...a: unknown[]) => mockGetLatestEstimateForClient(...a),
  createPriceBookService: (...a: unknown[]) => mockCreatePriceBookService(...a),
  addCompanyKnowledge: (...a: unknown[]) => mockAddCompanyKnowledge(...a),
}))

import { makeManageTools } from '@/lib/whatsapp/manage-tools'

const COMPANY_ID = 'company-1'
const OWNER_PHONE = '+15551112222'

function makeSupabase() {
  return {} as never
}

function findTool(tools: unknown[], name: string) {
  const found = tools.find((t) => (t as { name: string }).name === name) as
    | { func?: (...a: unknown[]) => unknown; invoke?: (...a: unknown[]) => unknown }
    | undefined
  if (!found) throw new Error(`tool "${name}" not found`)
  return found
}

async function callTool(tool: { func?: (...a: unknown[]) => unknown; invoke?: (...a: unknown[]) => unknown }, args: unknown) {
  if (tool.func) return tool.func(args)
  if (tool.invoke) return tool.invoke(args)
  throw new Error('tool has neither .func nor .invoke')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('makeManageTools — agentic-send binding (Phase 178-03)', () => {
  it('returns 4 tools: the 2 pre-existing tools are still present and unchanged', () => {
    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    expect(tools).toHaveLength(4)
    const names = tools.map((t) => (t as { name: string }).name)
    expect(names).toContain('add_service')
    expect(names).toContain('add_knowledge')
    expect(names).toContain('draft_customer_message')
    expect(names).toContain('get_latest_estimate_for_client')
  })

  it('draft_customer_message ok:true → echoes the EXACT recipient (name + phone/email) and EXACT body, asks YES/NO; calls draftCustomerMessage with triggerSource agentic-whatsapp + channelRef = ownerPhone', async () => {
    mockDraftCustomerMessage.mockResolvedValue({
      ok: true,
      confirmationId: 'conf-1',
      token: null,
      clientId: 'client-1',
      clientName: 'Sarah Jones',
      recipient: '+15559998888',
      channel: 'sms',
      body: "Your contractor: we're running a day late",
    })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'Sarah',
      channel: 'sms',
      body: "we're running a day late",
    })) as string

    expect(mockDraftCustomerMessage).toHaveBeenCalledTimes(1)
    const call = mockDraftCustomerMessage.mock.calls[0]
    expect(call[1]).toMatchObject({
      companyId: COMPANY_ID,
      clientQuery: 'Sarah',
      channel: 'sms',
      body: "we're running a day late",
      triggerSource: 'agentic-whatsapp',
      channelRef: OWNER_PHONE,
    })

    // Exact recipient (name + phone) and exact body echoed.
    expect(result).toContain('Sarah Jones')
    expect(result).toContain('+15559998888')
    expect(result).toContain("Your contractor: we're running a day late")
    // Explicit YES/NO ask.
    expect(result).toMatch(/YES/)
    expect(result).toMatch(/NO/)
  })

  it('draft_customer_message ok:false client_ambiguous → lists both candidate names, asks which one, does NOT claim anything was drafted', async () => {
    mockDraftCustomerMessage.mockResolvedValue({
      ok: false,
      error: 'client_ambiguous',
      candidates: ['Sarah Jones', 'Sarah Lee'],
    })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'Sarah',
      channel: 'sms',
      body: 'hello',
    })) as string

    expect(result).toContain('Sarah Jones')
    expect(result).toContain('Sarah Lee')
    expect(result).toMatch(/which/i)
    // Must not claim something WAS drafted/ready to send — an explicit
    // negation ("nothing has been drafted") is fine and expected here.
    expect(result).not.toMatch(/ready to send/i)
    expect(result).toMatch(/nothing.*drafted/i)
  })

  it('draft_customer_message ok:false client_not_found → clear "couldn\'t find" string, no confirmation language', async () => {
    mockDraftCustomerMessage.mockResolvedValue({ ok: false, error: 'client_not_found' })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'Nonexistent',
      channel: 'sms',
      body: 'hello',
    })) as string

    expect(result).toMatch(/couldn't find/i)
    expect(result).not.toMatch(/YES/)
    expect(result).not.toMatch(/reply/i)
  })

  it('draft_customer_message ok:false no_recipient_email → clear "no email on file" string', async () => {
    mockDraftCustomerMessage.mockResolvedValue({ ok: false, error: 'no_recipient_email' })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'John',
      channel: 'email',
      body: 'hello',
      subject: 'Hi',
    })) as string

    expect(result).toMatch(/email/i)
    expect(result).toMatch(/on file/i)
  })

  it('draft_customer_message ok:false no_recipient_phone → clear "no phone on file" string', async () => {
    mockDraftCustomerMessage.mockResolvedValue({ ok: false, error: 'no_recipient_phone' })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'John',
      channel: 'sms',
      body: 'hello',
    })) as string

    expect(result).toMatch(/phone/i)
    expect(result).toMatch(/on file/i)
  })

  it('draft_customer_message ok:false rate_limited → clear "hit the daily limit" string, does not imply the message was drafted', async () => {
    mockDraftCustomerMessage.mockResolvedValue({ ok: false, error: 'rate_limited' })

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const draftTool = findTool(tools, 'draft_customer_message')
    const result = (await callTool(draftTool, {
      client_name: 'John',
      channel: 'sms',
      body: 'hello',
    })) as string

    expect(result).toMatch(/daily limit/i)
    expect(result).not.toMatch(/ready to send/i)
    expect(result).toMatch(/nothing.*drafted/i)
  })

  it('get_latest_estimate_for_client calls the neutral getLatestEstimateForClient(companyId, supabase, name) and returns its string verbatim', async () => {
    mockGetLatestEstimateForClient.mockResolvedValue('Latest estimate for Maria: $1,234 (2026-07-01).')

    const tools = makeManageTools(COMPANY_ID, makeSupabase(), OWNER_PHONE)
    const estimateTool = findTool(tools, 'get_latest_estimate_for_client')
    const result = await callTool(estimateTool, { name: 'Maria' })

    expect(mockGetLatestEstimateForClient).toHaveBeenCalledTimes(1)
    expect(mockGetLatestEstimateForClient.mock.calls[0][0]).toBe(COMPANY_ID)
    expect(mockGetLatestEstimateForClient.mock.calls[0][2]).toBe('Maria')
    expect(result).toBe('Latest estimate for Maria: $1,234 (2026-07-01).')
  })
})
