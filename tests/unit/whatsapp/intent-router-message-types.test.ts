import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 4 — single-message path: classifyAndRoute applies the shared per-type policy
 * (lib/whatsapp/message-policy.ts) before any normalization / AI work.
 */

const mockInvoke = vi.fn()
vi.mock('@/lib/whatsapp/llm', () => ({
  makeWhatsAppLLM: async () => ({ invoke: (...a: unknown[]) => mockInvoke(...a) }),
}))
vi.mock('@/lib/whatsapp/credits', () => ({ settleWhatsAppChat: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    invoke = (...a: unknown[]) => mockInvoke(...a)
  },
}))
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(() => ({ invoke: vi.fn() })),
}))

const mockNormalize = vi.fn()
vi.mock('@/lib/whatsapp/normalize', () => ({
  normalizeMessage: (...a: unknown[]) => mockNormalize(...a),
}))

const mockProcessConfirmationReply = vi.fn()
vi.mock('@/lib/whatsapp/confirm', () => ({
  processConfirmationReply: (...a: unknown[]) => mockProcessConfirmationReply(...a),
}))
vi.mock('@/lib/whatsapp/agent', () => ({ runConfirmationAgent: vi.fn() }))
vi.mock('@/lib/whatsapp/confirm-actions', () => ({ actionCancel: vi.fn() }))
const mockProcessInboundMessages = vi.fn()
vi.mock('@/lib/whatsapp/handler', () => ({
  processInboundMessages: (...a: unknown[]) => mockProcessInboundMessages(...a),
}))
vi.mock('@/lib/whatsapp/query-tools', () => ({ makeQueryTools: vi.fn(() => []) }))

const mockSend = vi.fn()
vi.mock('@/lib/whatsapp/client', () => ({
  sendWhatsAppMessage: (...a: unknown[]) => mockSend(...a),
}))
vi.mock('@/lib/whatsapp/conversations', () => ({
  logOutboundMessage: vi.fn().mockResolvedValue(undefined),
}))

import { classifyAndRoute } from '@/lib/whatsapp/intent-router'
import { AIMessage } from '@langchain/core/messages'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

/** Supabase mock: history loading finds nothing; companies.default_estimate_language = `lang`. */
function makeSupabase(lang: 'pt' | 'en' | 'es' | null = null) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => Promise.resolve({ data: [], error: null }))
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))
  chain.single = vi.fn(() => Promise.resolve({ data: { default_estimate_language: lang }, error: null }))
  return { from: vi.fn(() => chain) } as never
}

const base = { id: 'wamid.t', from: '15551112222', timestamp: '1' }

function route(message: WhatsAppMessage, lang: 'pt' | 'en' | 'es' | null = null) {
  return classifyAndRoute({
    companyId: 'company-1',
    ownerPhone: '+15551112222',
    fromPhone: '15551112222',
    message,
    session: null,
    supabase: makeSupabase(lang),
  })
}

function sentBodies(): string[] {
  return mockSend.mock.calls.map((c) => (c[1] as { text: { body: string } }).text.body)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue(undefined)
  mockProcessInboundMessages.mockResolvedValue(undefined)
})

describe('classifyAndRoute - Phase 4 per-type policy', () => {
  it('sticker and reaction: no reply, no normalization, no AI call', async () => {
    await route({ ...base, type: 'sticker', sticker: { id: 's1' } })
    await route({ ...base, type: 'reaction', reaction: { message_id: 'x', emoji: 'ok' } })

    expect(mockSend).not.toHaveBeenCalled()
    expect(mockNormalize).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('video: one short pt reply asking for photos or audio, no AI, never normalized', async () => {
    await route({ ...base, type: 'video', video: { id: 'v1' } }, 'pt')

    expect(sentBodies()).toEqual(['Não consigo processar vídeos. Me manda fotos ou um áudio do serviço.'])
    expect(mockNormalize).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('document/PDF: one reply that documents are not supported yet (en default)', async () => {
    await route({ ...base, type: 'document', document: { id: 'd1', mime_type: 'application/pdf', filename: 'a.pdf' } })

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(sentBodies()[0]).toMatch(/can't read documents or PDFs yet/)
    expect(sentBodies()[0]).not.toMatch(/I can only process text, audio, or photo/)
    expect(mockNormalize).not.toHaveBeenCalled()
  })

  it('unknown type: one localized reply (es)', async () => {
    await route({ ...base, type: 'unknown' }, 'es')
    expect(sentBodies()).toEqual(['Todavía no entiendo ese tipo de mensaje. Envíeme texto, audio o fotos.'])
  })

  it('over-limit audio (normalize reason too_large): localized "too long" reply, no AI', async () => {
    mockNormalize.mockResolvedValue({ text: '', kind: 'audio', ok: false, reason: 'too_large' })
    await route({ ...base, type: 'audio', audio: { id: 'a', mime_type: 'audio/ogg' } }, 'pt')

    expect(sentBodies()).toEqual(['Esse áudio é longo demais. Me manda em partes menores.'])
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('over-limit photo: localized "too large" reply', async () => {
    mockNormalize.mockResolvedValue({ text: '', kind: 'photo', ok: false, reason: 'too_large' })
    await route({ ...base, type: 'image', image: { id: 'i', mime_type: 'image/jpeg' } }, 'en')
    expect(sentBodies()[0]).toMatch(/too large \(10 MB max\)/)
  })

  it('unreadable audio / photo keep a localized graceful reply', async () => {
    mockNormalize.mockResolvedValue({ text: '', kind: 'audio', ok: false, reason: 'transcription_failed' })
    await route({ ...base, type: 'audio', audio: { id: 'a', mime_type: 'audio/ogg' } }, 'pt')
    expect(sentBodies()[0]).toBe('Não consegui ouvir seu áudio. Me descreve o serviço por texto.')
  })

  it('interactive button reply is handled as the owner text (reaches classification)', async () => {
    mockNormalize.mockResolvedValue({ text: 'Confirm', kind: 'text', ok: true })
    mockInvoke.mockResolvedValue(new AIMessage('CREATE'))

    await route({
      ...base,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'c', title: 'Confirm' } },
    })

    expect(mockNormalize).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalled() // classifier ran on the button text
    expect(mockSend).not.toHaveBeenCalled() // no canned "unsupported" reply
  })

  it('location and contacts go through normalization (context text), not the unsupported reply', async () => {
    mockNormalize.mockResolvedValue({ text: 'Job location: Site (1,2)', kind: 'text', ok: true })
    mockInvoke.mockResolvedValue(new AIMessage('CREATE'))

    await route({ ...base, type: 'location', location: { latitude: 1, longitude: 2, name: 'Site' } })
    await route({ ...base, type: 'contacts', contacts: [{ name: { formatted_name: 'John' } }] })

    expect(mockNormalize).toHaveBeenCalledTimes(2)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
