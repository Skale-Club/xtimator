import { describe, it, expect, vi, beforeEach } from 'vitest'

// Imports the real intent-router (LangChain ChatOpenAI / ReAct agent tree) at
// runtime; under vitest's reused forked worker the import can exceed the 5s
// default (import latency under contention, not a mock leak). Per-file timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 178 Plan 03 (AGENT-01) — Task 2.
 *
 * classifyAndRoute gains a pending-confirmation pre-check that runs BEFORE
 * loadConversationHistory and BEFORE the LLM classifier. When a pending
 * agentic-send confirmation exists for this ownerPhone, the owner's reply is
 * interpreted (confirm/cancel/unclear) directly — the classifier is never
 * invoked. Mock harness cloned from intent-router-knowledge.test.ts VERBATIM.
 */

// --- classifier LLM (ChatOpenAI) ------------------------------------------
const mockInvoke = vi.fn()
vi.mock('@langchain/openai', () => ({
  // Class-based so `new ChatOpenAI()` is constructible after vi.clearAllMocks.
  ChatOpenAI: class {
    invoke = (...a: unknown[]) => mockInvoke(...a)
  },
}))

// --- QUERY ReAct agent -----------------------------------------------------
const mockAgentInvoke = vi.fn()
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(() => ({ invoke: mockAgentInvoke })),
}))

// --- normalize -------------------------------------------------------------
const mockNormalize = vi.fn()
vi.mock('@/lib/whatsapp/normalize', () => ({
  normalizeMessage: (...a: unknown[]) => mockNormalize(...a),
}))

// --- reused flows ----------------------------------------------------------
const mockProcessConfirmationReply = vi.fn()
vi.mock('@/lib/whatsapp/confirm', () => ({
  processConfirmationReply: (...a: unknown[]) => mockProcessConfirmationReply(...a),
}))

const mockRunConfirmationAgent = vi.fn()
vi.mock('@/lib/whatsapp/agent', () => ({
  runConfirmationAgent: (...a: unknown[]) => mockRunConfirmationAgent(...a),
}))

const mockActionCancel = vi.fn()
vi.mock('@/lib/whatsapp/confirm-actions', () => ({
  actionCancel: (...a: unknown[]) => mockActionCancel(...a),
}))

const mockProcessInboundMessages = vi.fn()
vi.mock('@/lib/whatsapp/handler', () => ({
  processInboundMessages: (...a: unknown[]) => mockProcessInboundMessages(...a),
}))

const mockMakeQueryTools = vi.fn(
  (..._a: unknown[]) => [{ name: 'list_recent_estimates' }] as unknown[]
)
vi.mock('@/lib/whatsapp/query-tools', () => ({
  makeQueryTools: (...a: unknown[]) => mockMakeQueryTools(...a),
}))

const mockSendWhatsAppMessage = vi.fn()
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...a: unknown[]) => mockSendWhatsAppMessage(...a),
}))

const mockLogOutbound = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: (...a: unknown[]) => mockLogOutbound(...a),
}))

// --- agentic-send pending-confirmation pre-check (new for 178-03) ---------
const mockResolvePending = vi.fn()
const mockConfirmSend = vi.fn()
const mockCancelSend = vi.fn()
vi.mock('@/lib/notifications/agentic-send-confirm', () => ({
  resolvePendingByChannelRef: (...a: unknown[]) => mockResolvePending(...a),
  interpretConfirmationReply: vi.fn((t: string) => {
    const s = t.trim().toLowerCase()
    if (/^(yes|confirm|send it)\b/.test(s)) return 'confirm'
    if (/^(no|cancel)\b/.test(s)) return 'cancel'
    return 'unclear'
  }),
  explainSendGateRefusal: (r: string | undefined) => `refused:${r ?? 'unknown'}`,
}))
vi.mock('@/lib/agent-tools', () => ({
  confirmSendByChannelRef: (...a: unknown[]) => mockConfirmSend(...a),
  cancelSendByChannelRef: (...a: unknown[]) => mockCancelSend(...a),
}))

import { classifyAndRoute } from '@/lib/whatsapp/intent-router'
import { AIMessage } from '@langchain/core/messages'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

// Chainable supabase mock for history loading (returns no conversation → empty history)
function makeSupabase() {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
  return { from: vi.fn(() => chain) } as never
}

const TEXT = (body: string): WhatsAppMessage => ({
  id: 'wamid.text',
  from: '15551112222',
  timestamp: '1',
  type: 'text',
  text: { body },
})

const SESSION = {
  id: 'sess-1',
  state: 'awaiting_confirm',
  draft_project_id: 'p-1',
  draft_estimate_id: 'e-1',
}

const PENDING = {
  id: 'pending-1',
  companyId: 'company-1',
  clientId: 'client-1',
  channel: 'sms' as const,
  subject: null,
  body: 'hello',
  triggerSource: 'agentic-whatsapp' as const,
  channelRef: '+15551112222',
  token: null,
  status: 'pending' as const,
  expiresAt: '2099-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLogOutbound.mockResolvedValue(undefined)
  mockSendWhatsAppMessage.mockResolvedValue(undefined)
  mockActionCancel.mockResolvedValue(undefined)
  mockProcessInboundMessages.mockResolvedValue(undefined)
  mockProcessConfirmationReply.mockResolvedValue(undefined)
  mockRunConfirmationAgent.mockResolvedValue(undefined)
  mockMakeQueryTools.mockReturnValue([{ name: 'list_recent_estimates' }])
  mockResolvePending.mockResolvedValue(null)
  mockConfirmSend.mockResolvedValue({ ok: true })
  mockCancelSend.mockResolvedValue({ ok: true })
})

describe('classifyAndRoute — pending agentic-send confirmation pre-check (Phase 178-03)', () => {
  it('pending row + "yes" → confirmSendByChannelRef(supabase, companyId, ownerPhone) called; classifier NEVER called; owner gets exactly one success reply', async () => {
    mockResolvePending.mockResolvedValue(PENDING)
    mockNormalize.mockResolvedValue({ text: 'yes', kind: 'text', ok: true })
    mockConfirmSend.mockResolvedValue({ ok: true })

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('yes'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockConfirmSend).toHaveBeenCalledTimes(1)
    expect(mockConfirmSend.mock.calls[0][1]).toBe('company-1')
    expect(mockConfirmSend.mock.calls[0][2]).toBe('+15551112222')
    // Classifier LLM never invoked — the pre-check short-circuits BEFORE classification.
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
  })

  it('pending row + "no" → cancelSendByChannelRef called; classifier never called; owner gets exactly one cancellation reply', async () => {
    mockResolvePending.mockResolvedValue(PENDING)
    mockNormalize.mockResolvedValue({ text: 'no', kind: 'text', ok: true })

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('no'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockCancelSend).toHaveBeenCalledTimes(1)
    expect(mockConfirmSend).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
  })

  it('pending row + "maybe later" (unclear) → NEITHER confirm nor cancel called; owner gets exactly one re-prompt asking explicitly for YES/NO; classifier never called', async () => {
    mockResolvePending.mockResolvedValue(PENDING)
    mockNormalize.mockResolvedValue({ text: 'maybe later', kind: 'text', ok: true })

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('maybe later'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockConfirmSend).not.toHaveBeenCalled()
    expect(mockCancelSend).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendWhatsAppMessage.mock.calls[0] as [string, { text: { body: string } }]
    expect(payload.text.body).toMatch(/YES/)
    expect(payload.text.body).toMatch(/NO/)
  })

  it('pending row + confirmSendByChannelRef resolves gate refusal (quiet_hours) → owner reply contains explainSendGateRefusal text, never silent/generic', async () => {
    mockResolvePending.mockResolvedValue(PENDING)
    mockNormalize.mockResolvedValue({ text: 'yes', kind: 'text', ok: true })
    mockConfirmSend.mockResolvedValue({ ok: false, error: 'quiet_hours' })

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('yes'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendWhatsAppMessage.mock.calls[0] as [string, { text: { body: string } }]
    expect(payload.text.body).toContain('refused:quiet_hours')
  })

  it('regression (LOAD-BEARING): no pending row → normal classification proceeds exactly as before', async () => {
    mockResolvePending.mockResolvedValue(null)
    mockNormalize.mockResolvedValue({ text: 'send it', kind: 'text', ok: true })
    mockInvoke.mockResolvedValue(new AIMessage('CONFIRM_OR_CANCEL'))

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('send it'),
      session: SESSION,
      supabase: makeSupabase(),
    })

    expect(mockProcessConfirmationReply).toHaveBeenCalledTimes(1)
    expect(mockProcessConfirmationReply.mock.calls[0][0]).toBe('send it')
    expect(mockConfirmSend).not.toHaveBeenCalled()
    expect(mockCancelSend).not.toHaveBeenCalled()
  })

  it('unexpected thrown error from confirmSendByChannelRef → caught, owner still receives exactly one reply, function does not reject', async () => {
    mockResolvePending.mockResolvedValue(PENDING)
    mockNormalize.mockResolvedValue({ text: 'yes', kind: 'text', ok: true })
    mockConfirmSend.mockRejectedValue(new Error('db exploded'))

    await expect(
      classifyAndRoute({
        companyId: 'company-1',
        ownerPhone: '+15551112222',
        fromPhone: '15551112222',
        message: TEXT('yes'),
        session: null,
        supabase: makeSupabase(),
      })
    ).resolves.toBeUndefined()

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
  })
})
