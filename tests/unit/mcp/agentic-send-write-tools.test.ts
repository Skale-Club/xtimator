// tests/unit/mcp/agentic-send-write-tools.test.ts
// Phase 178 Plan 04 (AGENT-02/03) — contract tests for the MCP
// draft_customer_message / send_customer_message tool pair.
//
// Mirrors the mcp-create-estimate.test.ts convention: drive the handlers via
// write.ts's `__testing` export, mocking only the boundary modules
// (`@/lib/agent-tools`, `@/lib/supabase/service`). `explainSendGateRefusal`
// is imported for real (pure function, lazy Redis init) so the gate-refusal
// assertions exercise the actual copy, not a re-implemented stub.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/agent-tools', () => ({
  draftCustomerMessage: vi.fn(),
  confirmSendByToken: vi.fn(),
  // Other write.ts imports from this barrel — unused by these tests, stubbed
  // so the module mock stays complete.
  createEstimate: vi.fn(),
  createProject: vi.fn(),
  createPriceBookService: vi.fn(),
  addCompanyKnowledge: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  // Trivial stub — the handlers never touch it directly beyond passing it
  // through to draftCustomerMessage/confirmSendByToken.
  requireServiceClient: vi.fn(() => ({ __stub: true })),
}))

import { __testing } from '@/lib/mcp/tools/write'
import type { McpAuthContext } from '@/lib/mcp/auth'
import { draftCustomerMessage, confirmSendByToken } from '@/lib/agent-tools'

const mockDraftCustomerMessage = vi.mocked(draftCustomerMessage)
const mockConfirmSendByToken = vi.mocked(confirmSendByToken)

const {
  handleDraftCustomerMessage,
  handleSendCustomerMessage,
  DRAFT_CUSTOMER_MESSAGE_DEFINITION,
  SEND_CUSTOMER_MESSAGE_DEFINITION,
} = __testing

const AUTH_WRITE: McpAuthContext = {
  client_id: 'c',
  user_id: 'u',
  company_id: 'co_target',
  scope: ['mcp:read', 'mcp:write'],
}

const AUTH_READ_ONLY: McpAuthContext = {
  ...AUTH_WRITE,
  scope: ['mcp:read'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

function readContent(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ type: string; text: string }> }
  expect(r.content[0]!.type).toBe('text')
  return JSON.parse(r.content[0]!.text) as Record<string, unknown>
}

// ── draft_customer_message ───────────────────────────────────────────────────

describe('draft_customer_message — scope gate', () => {
  it('throws insufficient_scope when the token lacks mcp:write; draftCustomerMessage never called', async () => {
    await expect(
      handleDraftCustomerMessage(AUTH_READ_ONLY, {
        client_name: 'Jane',
        channel: 'sms',
        body: 'Your estimate is ready.',
      }),
    ).rejects.toMatchObject({ data: { kind: 'insufficient_scope' } })
    expect(mockDraftCustomerMessage).not.toHaveBeenCalled()
  })
})

describe('draft_customer_message — input validation', () => {
  it('rejects empty client_name; draftCustomerMessage never called', async () => {
    await expect(
      handleDraftCustomerMessage(AUTH_WRITE, {
        client_name: '',
        channel: 'sms',
        body: 'Your estimate is ready.',
      }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
    expect(mockDraftCustomerMessage).not.toHaveBeenCalled()
  })
})

describe('draft_customer_message — happy path', () => {
  it('returns the preview payload with confirmation_token, resolved recipient/client_name/channel, and the EXACT body/subject echoed back', async () => {
    mockDraftCustomerMessage.mockResolvedValue({
      ok: true,
      confirmationId: 'confirmation-1',
      token: 'tok-abc',
      clientId: 'client-1',
      clientName: 'Jane Client',
      recipient: '+15551234567',
      channel: 'sms',
      body: "Joe's Plumbing: Your estimate is ready.",
      subject: undefined,
    })

    const result = await handleDraftCustomerMessage(AUTH_WRITE, {
      client_name: 'Jane',
      channel: 'sms',
      body: 'Your estimate is ready.',
    })

    const body = readContent(result)
    expect(body.confirmation_token).toBe('tok-abc')
    expect(body.recipient).toBe('+15551234567')
    expect(body.client_name).toBe('Jane Client')
    expect(body.channel).toBe('sms')
    // Exact echo — never paraphrased.
    expect(body.body).toBe("Joe's Plumbing: Your estimate is ready.")
  })

  it('calls draftCustomerMessage with triggerSource "agentic-mcp" and no WhatsApp-shaped channelRef', async () => {
    mockDraftCustomerMessage.mockResolvedValue({
      ok: true,
      confirmationId: 'confirmation-1',
      token: 'tok-abc',
      clientId: 'client-1',
      clientName: 'Jane Client',
      recipient: 'jane@example.com',
      channel: 'email',
      body: 'Your estimate is ready.',
      subject: 'Estimate',
    })

    await handleDraftCustomerMessage(AUTH_WRITE, {
      client_name: 'Jane',
      channel: 'email',
      body: 'Your estimate is ready.',
      subject: 'Estimate',
    })

    expect(mockDraftCustomerMessage).toHaveBeenCalledTimes(1)
    const [supabaseArg, params] = mockDraftCustomerMessage.mock.calls[0]!
    expect(supabaseArg).toEqual({ __stub: true })
    expect(params).toMatchObject({
      companyId: 'co_target',
      clientQuery: 'Jane',
      channel: 'email',
      body: 'Your estimate is ready.',
      subject: 'Estimate',
      triggerSource: 'agentic-mcp',
    })
    // Never a WhatsApp-shaped channelRef (a phone number / binding key) —
    // MCP omits channelRef entirely.
    expect(params.channelRef).toBeUndefined()
  })
})

describe('draft_customer_message — failure mapping', () => {
  it('client_ambiguous -> invalid_input listing the candidates', async () => {
    mockDraftCustomerMessage.mockResolvedValue({
      ok: false,
      error: 'client_ambiguous',
      candidates: ['Jane A', 'Jane B'],
    })

    await expect(
      handleDraftCustomerMessage(AUTH_WRITE, {
        client_name: 'Jane',
        channel: 'sms',
        body: 'hi',
      }),
    ).rejects.toThrow(/Jane A.*Jane B/)
  })

  it('client_not_found, no_recipient_email, no_recipient_phone, rate_limited each surface a distinct, non-generic message', async () => {
    const cases: Array<{
      error: 'client_not_found' | 'no_recipient_email' | 'no_recipient_phone' | 'rate_limited'
    }> = [
      { error: 'client_not_found' },
      { error: 'no_recipient_email' },
      { error: 'no_recipient_phone' },
      { error: 'rate_limited' },
    ]

    const messages = new Set<string>()
    for (const { error } of cases) {
      mockDraftCustomerMessage.mockResolvedValue({ ok: false, error })
      try {
        await handleDraftCustomerMessage(AUTH_WRITE, {
          client_name: 'Jane',
          channel: 'sms',
          body: 'hi',
        })
        throw new Error(`expected handleDraftCustomerMessage to throw for error=${error}`)
      } catch (err) {
        messages.add((err as Error).message)
      }
    }

    // 4 distinct cases -> 4 distinct messages (not one generic string reused).
    expect(messages.size).toBe(cases.length)
  })
})

describe('draft_customer_message — schema walk (T-lrf-01)', () => {
  it('inputSchema.properties contains client_name, channel, body, subject and NEVER company_id/companyId/tenant/tenantId', () => {
    const props = DRAFT_CUSTOMER_MESSAGE_DEFINITION.inputSchema.properties as Record<string, unknown>
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['client_name', 'channel', 'body', 'subject']),
    )
    expect(props).not.toHaveProperty('company_id')
    expect(props).not.toHaveProperty('companyId')
    expect(props).not.toHaveProperty('tenant')
    expect(props).not.toHaveProperty('tenantId')
  })
})

// ── send_customer_message ────────────────────────────────────────────────────

describe('send_customer_message — schema walk (LOAD-BEARING, AGENT-03)', () => {
  it('inputSchema.properties contains EXACTLY confirmation_token and nothing else', () => {
    const props = SEND_CUSTOMER_MESSAGE_DEFINITION.inputSchema.properties as Record<string, unknown>
    expect(Object.keys(props)).toEqual(['confirmation_token'])
    for (const forbidden of [
      'to',
      'recipient',
      'channel',
      'body',
      'subject',
      'client_id',
      'client_name',
      'company_id',
      'companyId',
    ]) {
      expect(props).not.toHaveProperty(forbidden)
    }
  })
})

describe('send_customer_message — scope gate', () => {
  it('throws insufficient_scope when the token lacks mcp:write; confirmSendByToken never called', async () => {
    await expect(
      handleSendCustomerMessage(AUTH_READ_ONLY, { confirmation_token: 'tok-abc' }),
    ).rejects.toMatchObject({ data: { kind: 'insufficient_scope' } })
    expect(mockConfirmSendByToken).not.toHaveBeenCalled()
  })
})

describe('send_customer_message — input validation', () => {
  it('rejects empty confirmation_token; confirmSendByToken never called', async () => {
    await expect(
      handleSendCustomerMessage(AUTH_WRITE, { confirmation_token: '' }),
    ).rejects.toMatchObject({ data: { kind: 'invalid_input' } })
    expect(mockConfirmSendByToken).not.toHaveBeenCalled()
  })
})

describe('send_customer_message — happy path', () => {
  it('ok:true -> returns jsonContent({ ok: true, ... }); confirmSendByToken called with (supabase, auth.company_id, token)', async () => {
    mockConfirmSendByToken.mockResolvedValue({ ok: true })

    const result = await handleSendCustomerMessage(AUTH_WRITE, {
      confirmation_token: 'tok-abc',
    })

    expect(mockConfirmSendByToken).toHaveBeenCalledWith(
      { __stub: true },
      'co_target',
      'tok-abc',
    )
    const body = readContent(result)
    expect(body.ok).toBe(true)
  })
})

describe('send_customer_message — failure mapping', () => {
  it('not_found -> invalid_input telling the caller the confirmation expired/was used and to draft again', async () => {
    mockConfirmSendByToken.mockResolvedValue({ ok: false, error: 'not_found' })

    await expect(
      handleSendCustomerMessage(AUTH_WRITE, { confirmation_token: 'tok-abc' }),
    ).rejects.toThrow(/expired|already used/i)
    await expect(
      handleSendCustomerMessage(AUTH_WRITE, { confirmation_token: 'tok-abc' }),
    ).rejects.toThrow(/draft/i)
  })

  it('gate refusal (quiet_hours) -> invalid_input using explainSendGateRefusal, never a bare error code', async () => {
    mockConfirmSendByToken.mockResolvedValue({ ok: false, error: 'quiet_hours' })

    await expect(
      handleSendCustomerMessage(AUTH_WRITE, { confirmation_token: 'tok-abc' }),
    ).rejects.toThrow(/allowed contact hours/i)
  })

  it('gate refusal (suppressed) -> a distinct explainSendGateRefusal message, not the quiet_hours copy', async () => {
    mockConfirmSendByToken.mockResolvedValue({ ok: false, error: 'suppressed' })

    await expect(
      handleSendCustomerMessage(AUTH_WRITE, { confirmation_token: 'tok-abc' }),
    ).rejects.toThrow(/opted out/i)
  })
})
