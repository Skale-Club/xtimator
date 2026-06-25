import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Imports the real intent-router (LangChain ChatOpenAI / ReAct agent tree) at
// runtime; under vitest's reused forked worker the import can exceed the 5s
// default (import latency under contention, not a mock leak). Per-file timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 121-01 — WhatsApp KNOWLEDGE intent (WAKB-01 + WAKB-02).
 *
 * classifyAndRoute gains a 5th KNOWLEDGE intent that routes a generic trade
 * how-to question to dispatchKnowledge → lib/knowledge/answer, scoped by the
 * resolved company's industries[] (caller-supplied, NEVER from the LLM). The
 * existing 4 intents and the safe CREATE default for unrecognized output are
 * untouched. Mock harness cloned from intent-router.test.ts.
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

// --- knowledge module (the new consumer target) ---------------------------
const mockAnswer = vi.fn()
vi.mock('@/lib/knowledge/answer', () => ({
  answer: (...a: unknown[]) => mockAnswer(...a),
}))

import { classifyAndRoute } from '@/lib/whatsapp/intent-router'
import { AIMessage } from '@langchain/core/messages'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

// Dual-purpose supabase mock. maybeSingle() resolves a row that satisfies BOTH
// callers: (1) loadConversationHistory's `.select('id')...maybeSingle()` — a row
// with `id` is harmless, and `limit()` returns [] so history degrades empty;
// (2) dispatchKnowledge's `.select('industries, default_estimate_language')
// ...maybeSingle()` — the industries fixture drives the retrieval scope.
function makeSupabase() {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
  chain.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: {
        id: 'conv-1',
        industries: ['carpet_cleaning'],
        default_estimate_language: 'en',
      },
      error: null,
    })
  )
  return { from: vi.fn(() => chain) } as never
}

const TEXT = (body: string): WhatsAppMessage => ({
  id: 'wamid.text',
  from: '15551112222',
  timestamp: '1',
  type: 'text',
  text: { body },
})

beforeEach(() => {
  vi.clearAllMocks()
  mockLogOutbound.mockResolvedValue(undefined)
  mockSendWhatsAppMessage.mockResolvedValue(undefined)
  mockActionCancel.mockResolvedValue(undefined)
  mockProcessInboundMessages.mockResolvedValue(undefined)
  mockProcessConfirmationReply.mockResolvedValue(undefined)
  mockRunConfirmationAgent.mockResolvedValue(undefined)
  mockMakeQueryTools.mockReturnValue([{ name: 'list_recent_estimates' }])
  mockAnswer.mockResolvedValue(
    'Pre-treat the stain with an enzyme cleaner, blot — do not rub.'
  )
})

describe('classifyAndRoute — KNOWLEDGE intent', () => {
  it('Test A (WAKB-01 routing): KNOWLEDGE → answer() called, NOT query tools / NOT processInboundMessages; owner receives the answer', async () => {
    mockNormalize.mockResolvedValue({
      text: 'how do I pre-treat a pet stain?',
      kind: 'text',
      ok: true,
    })
    mockInvoke.mockResolvedValue(new AIMessage('KNOWLEDGE'))

    await classifyAndRoute({
      companyId: 'company-K',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('how do I pre-treat a pet stain?'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockAnswer).toHaveBeenCalledTimes(1)
    expect(mockMakeQueryTools).not.toHaveBeenCalled()
    expect(mockProcessInboundMessages).not.toHaveBeenCalled()
    // The answer is delivered to the owner via sendWhatsAppMessage.
    expect(mockSendWhatsAppMessage).toHaveBeenCalled()
    expect(mockSendWhatsAppMessage.mock.calls[0][0]).toBe('+15551112222')
  })

  it('Test B (WAKB-01 regression): unrecognized output STILL → CREATE; answer() NOT called', async () => {
    mockNormalize.mockResolvedValue({ text: 'something', kind: 'text', ok: true })
    mockInvoke.mockResolvedValue(new AIMessage('garbage-not-a-label'))

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('something'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockProcessInboundMessages).toHaveBeenCalledTimes(1)
    expect(mockAnswer).not.toHaveBeenCalled()
  })

  it('Test C (WAKB-01 regression): classifier throws STILL → CREATE; answer() NOT called', async () => {
    mockNormalize.mockResolvedValue({
      text: 'replace the bathroom vanity',
      kind: 'text',
      ok: true,
    })
    mockInvoke.mockRejectedValue(new Error('OpenAI key missing'))

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('replace the bathroom vanity'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockProcessInboundMessages).toHaveBeenCalledTimes(1)
    expect(mockAnswer).not.toHaveBeenCalled()
  })

  it('Test D (WAKB-02 scope): answer() called with { industries, companyId } from the trusted company read, not the LLM', async () => {
    mockNormalize.mockResolvedValue({
      text: 'how do I remove pet odor from carpet?',
      kind: 'text',
      ok: true,
    })
    mockInvoke.mockResolvedValue(new AIMessage('KNOWLEDGE'))

    await classifyAndRoute({
      companyId: 'company-K',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('how do I remove pet odor from carpet?'),
      session: null,
      supabase: makeSupabase(),
    })

    expect(mockAnswer).toHaveBeenCalledTimes(1)
    const ctx = mockAnswer.mock.calls[0][1] as {
      industries: string[]
      companyId: string
    }
    expect(ctx.industries).toEqual(['carpet_cleaning'])
    // companyId is the trusted, upstream-resolved tenant — never from the LLM.
    expect(ctx.companyId).toBe('company-K')
  })

  it('Test E (WAKB-01 prompt + WAKB-02 neutrality): static source contracts on intent-router.ts', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/whatsapp/intent-router.ts'),
      'utf8'
    )
    // KNOWLEDGE present in the Intent union.
    expect(src).toMatch(/\|\s*'KNOWLEDGE'/)
    // The dispatch function + switch case.
    expect(src).toMatch(/dispatchKnowledge/)
    expect(src).toMatch(/case 'KNOWLEDGE'/)
    // The classify prompt has a KNOWLEDGE bullet + the QUERY-vs-KNOWLEDGE rule
    // + KNOWLEDGE appended to the closing enumeration.
    expect(src).toMatch(/KNOWLEDGE:/)
    expect(src).toMatch(/DISAMBIGUATION/)
    expect(src).toMatch(/CONFIRM_OR_CANCEL, EDIT, CREATE, QUERY, KNOWLEDGE/)
    // The consumer imports FROM the channel-neutral knowledge module.
    expect(src).toMatch(/from '@\/lib\/knowledge\/answer'/)
    // Negative: parseIntent's unconditional safe-default is still CREATE.
    expect(src).toMatch(/return 'CREATE'/)
  })
})
