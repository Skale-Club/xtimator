import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Imports the real intent-router (LangChain ChatOpenAI / ReAct agent tree) at
// runtime; under vitest's reused forked worker the import can exceed the 5s
// default (import latency under contention, not a mock leak). Per-file timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Quick task 260603-lrf — Task 2.
 *
 * classifyAndRoute: normalize → loadHistory → classify (ChatOpenAI) → dispatch
 * into one of CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY, reusing the existing
 * flows. All collaborators are mocked so the routing logic is asserted in
 * isolation.
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

const AUDIO: WhatsAppMessage = {
  id: 'wamid.audio',
  from: '15551112222',
  timestamp: '1',
  type: 'audio',
  audio: { id: 'media-a', mime_type: 'audio/ogg' },
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

beforeEach(() => {
  vi.clearAllMocks()
  mockLogOutbound.mockResolvedValue(undefined)
  mockSendWhatsAppMessage.mockResolvedValue(undefined)
  mockActionCancel.mockResolvedValue(undefined)
  mockProcessInboundMessages.mockResolvedValue(undefined)
  mockProcessConfirmationReply.mockResolvedValue(undefined)
  mockRunConfirmationAgent.mockResolvedValue(undefined)
  mockMakeQueryTools.mockReturnValue([{ name: 'list_recent_estimates' }])
})

describe('classifyAndRoute', () => {
  it('Test 1: "send it" in awaiting_confirm → CONFIRM_OR_CANCEL → processConfirmationReply', async () => {
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
    expect(mockRunConfirmationAgent).not.toHaveBeenCalled()
    expect(mockProcessInboundMessages).not.toHaveBeenCalled()
  })

  it('Test 2: new audio job while awaiting_confirm → CREATE → actionCancel then processInboundMessages', async () => {
    mockNormalize.mockResolvedValue({
      text: 'build a new deck 20x20',
      kind: 'audio',
      ok: true,
    })
    mockInvoke.mockResolvedValue(new AIMessage('CREATE'))

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: AUDIO,
      session: SESSION,
      supabase: makeSupabase(),
    })

    expect(mockActionCancel).toHaveBeenCalledTimes(1)
    expect(mockProcessInboundMessages).toHaveBeenCalledTimes(1)
    // processInboundMessages(messages, companyId, fromPhone, supabase) — fromPhone has NO '+'
    expect(mockProcessInboundMessages.mock.calls[0][1]).toBe('company-1')
    expect(mockProcessInboundMessages.mock.calls[0][2]).toBe('15551112222')
  })

  it('Test 3: query with no session → QUERY → ReAct agent with company-scoped tools', async () => {
    mockNormalize.mockResolvedValue({
      text: 'qual o ultimo estimate do cliente Joao',
      kind: 'text',
      ok: true,
    })
    mockInvoke.mockResolvedValue(new AIMessage('QUERY'))
    mockAgentInvoke.mockResolvedValue({
      messages: [new AIMessage('The latest estimate for Joao is $1,234.')],
    })

    await classifyAndRoute({
      companyId: 'company-QUERY',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: TEXT('qual o ultimo estimate do cliente Joao'),
      session: null,
      supabase: makeSupabase(),
    })

    // company-scoped tools built with the trusted companyId
    expect(mockMakeQueryTools).toHaveBeenCalledTimes(1)
    expect(mockMakeQueryTools.mock.calls[0][0]).toBe('company-QUERY')
    // answer sent to the owner
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
    expect(mockSendWhatsAppMessage.mock.calls[0][0]).toBe('+15551112222')
  })

  it('normalize ok:false → graceful reply, no classification crash', async () => {
    mockNormalize.mockResolvedValue({
      text: '',
      kind: 'audio',
      ok: false,
      reason: 'transcription_failed',
    })

    await classifyAndRoute({
      companyId: 'company-1',
      ownerPhone: '+15551112222',
      fromPhone: '15551112222',
      message: AUDIO,
      session: SESSION,
      supabase: makeSupabase(),
    })

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1)
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(mockProcessConfirmationReply).not.toHaveBeenCalled()
  })

  it('unrecognized classifier output defaults to CREATE (safe default)', async () => {
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
  })

  it('classifier failure defaults to CREATE so inbound messages still get processed', async () => {
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
    expect(mockProcessInboundMessages.mock.calls[0][1]).toBe('company-1')
    expect(mockProcessInboundMessages.mock.calls[0][2]).toBe('15551112222')
  })
})

describe('Task 2: Inngest job + event registration', () => {
  it('Test 4: whatsAppIntentRouterJob has id "whatsapp-intent" and idempotency "event.data.batchKey"', async () => {
    const { whatsAppIntentRouterJob } = await import(
      '@/lib/inngest/functions/whatsapp-process'
    )
    const fn = whatsAppIntentRouterJob as unknown as {
      opts: { id: string; idempotency?: string }
    }
    expect(fn.opts.id).toBe('whatsapp-intent')
    expect(fn.opts.idempotency).toBe('event.data.batchKey')
  })

  it('index.ts registers whatsAppIntentRouterJob', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'lib/inngest/functions/index.ts'),
      'utf8'
    )
    expect(src).toMatch(/whatsAppIntentRouterJob/)
  })

  it('events.ts exports EVENT_WHATSAPP_INTENT', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/inngest/events.ts'), 'utf8')
    expect(src).toMatch(/EVENT_WHATSAPP_INTENT/)
  })
})
