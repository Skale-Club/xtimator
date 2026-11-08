/**
 * Phase 3 (D3, 3.1 / 3.5 / 3.8 / 3.10): BYOK key resolution on every AI call,
 * Whisper cost precedence, new cost rows and structured-vision ops alerts.
 *
 * BYOK is rare and opt-in (super-admin only, companies.byok_enabled). The
 * default for every company is the PLATFORM key; these tests lock that the
 * default path is unchanged and that the company key is used only when
 * getByokOpenRouterKey returns one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async () => 'platform-key'),
  getOpenRouterDefaultModel: vi.fn(async () => null),
}))
const byokMock = vi.fn(async (_companyId: string): Promise<string | null> => null)
vi.mock('@/lib/billing/byok', () => ({
  getByokOpenRouterKey: (id: string) => byokMock(id),
}))
const recordMock = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...a: unknown[]) => recordMock(...a),
}))
const notifyMock = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: (...a: unknown[]) => notifyMock(...a),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: { generation: () => ({ end: () => {} }), flushAsync: async () => {} },
}))
const billingCfg = vi.fn(async () => ({ whisperUsdPerMinute: 0.01 }) as { whisperUsdPerMinute: number })
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: () => billingCfg(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(() => null),
}))
const createOpenRouterMock = vi.fn((_s: { apiKey?: string }) => (id: string) => ({ __model: id }))
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: (s: { apiKey?: string }) => createOpenRouterMock(s),
}))

import {
  resolveOpenRouterKey,
  analyzePhotoOR,
  analyzePhotoStructuredOR,
  transcribeAudioOR,
  translateTextsOR,
} from '@/lib/ai/openrouter-client'
import { buildNeedsDetails } from '@/lib/ai/needs-details'
import { embed } from '@/lib/knowledge/embed'
import { resolveChatModel } from '@/lib/chat/provider'
import { makeOpenRouterWebProvider } from '@/lib/estimate/price-research/adapters/openrouter-web'
import { WHISPER_USD_PER_MINUTE } from '@/lib/billing/whisper-cost'

const fetchMock = vi.fn()
const authOf = (i = 0) =>
  ((fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>).Authorization

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json, text: async () => '' })

beforeEach(() => {
  vi.clearAllMocks()
  byokMock.mockResolvedValue(null)
  billingCfg.mockResolvedValue({ whisperUsdPerMinute: 0.01 })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('resolveOpenRouterKey', () => {
  it('no company context -> platform key, BYOK lookup never attempted', async () => {
    expect(await resolveOpenRouterKey()).toEqual({ apiKey: 'platform-key', byok: false })
    expect(await resolveOpenRouterKey(null)).toEqual({ apiKey: 'platform-key', byok: false })
    expect(byokMock).not.toHaveBeenCalled()
  })
  it('non-BYOK company (default) -> platform key', async () => {
    expect(await resolveOpenRouterKey('co-1')).toEqual({ apiKey: 'platform-key', byok: false })
  })
  it('BYOK company with a decryptable key -> company key', async () => {
    byokMock.mockResolvedValue('company-key')
    expect(await resolveOpenRouterKey('co-1')).toEqual({ apiKey: 'company-key', byok: true })
  })
  it('a throwing BYOK lookup never throws -> platform key', async () => {
    byokMock.mockRejectedValue(new Error('boom'))
    expect(await resolveOpenRouterKey('co-1')).toEqual({ apiKey: 'platform-key', byok: false })
  })
})

describe('BYOK key on every call (platform key otherwise)', () => {
  const visionResp = ok({ choices: [{ message: { content: 'a photo' }, finish_reason: 'stop' }] })

  it.each([
    ['company key', 'company-key', 'Bearer company-key'],
    ['platform key', null, 'Bearer platform-key'],
  ])('vision (prose) uses the %s', async (_n, byok, expected) => {
    byokMock.mockResolvedValue(byok)
    fetchMock.mockResolvedValue(visionResp)
    await analyzePhotoOR('b64', 'image/jpeg', undefined, { companyId: 'co-1' })
    expect(authOf()).toBe(expected)
  })

  it.each([
    ['company key', 'company-key', 'Bearer company-key'],
    ['platform key', null, 'Bearer platform-key'],
  ])('transcription uses the %s', async (_n, byok, expected) => {
    byokMock.mockResolvedValue(byok)
    fetchMock.mockResolvedValue(ok({ text: 'hello' }))
    await transcribeAudioOR(new Blob(['x']), 'webm', undefined, { companyId: 'co-1' })
    expect(authOf()).toBe(expected)
  })

  it('translation uses the company key', async () => {
    byokMock.mockResolvedValue('company-key')
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{"a":"b"}' } }] }))
    await translateTextsOR(['a'], 'pt', undefined, { companyId: 'co-1' })
    expect(authOf()).toBe('Bearer company-key')
  })

  it('structured vision uses the company key', async () => {
    byokMock.mockResolvedValue('company-key')
    fetchMock.mockResolvedValue(ok({ choices: [{ message: {}, finish_reason: 'stop' }] }))
    await analyzePhotoStructuredOR('b64', 'image/jpeg', undefined, { companyId: 'co-1' }).catch(() => {})
    expect(authOf()).toBe('Bearer company-key')
  })

  it('needs-details uses the company key, platform key without company', async () => {
    byokMock.mockResolvedValue('company-key')
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{"reason":"too_short","questions":["q"]}' } }] }))
    await buildNeedsDetails('x', 'en', null, { companyId: 'co-1' })
    expect(authOf()).toBe('Bearer company-key')
    fetchMock.mockClear()
    await buildNeedsDetails('x', 'en')
    expect(authOf()).toBe('Bearer platform-key')
  })

  it('knowledge embed uses the company key', async () => {
    byokMock.mockResolvedValue('company-key')
    fetchMock.mockResolvedValue(ok({ data: [{ embedding: new Array(1536).fill(0) }] }))
    await embed('q', { companyId: 'co-1' })
    expect(authOf()).toBe('Bearer company-key')
  })

  it('price research uses the company key', async () => {
    byokMock.mockResolvedValue('company-key')
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }))
    await makeOpenRouterWebProvider().lookup([{ name: 'tile' }] as never, 'US' as never, 'USD', {
      companyId: 'co-1',
    })
    expect(authOf()).toBe('Bearer company-key')
  })

  it('chat model is built with the company key when BYOK, platform key otherwise', async () => {
    byokMock.mockResolvedValue('company-key')
    await resolveChatModel(undefined as never).catch(() => {})
    expect(createOpenRouterMock.mock.calls.at(-1)?.[0].apiKey).toBe('platform-key')
    createOpenRouterMock.mockClear()
    // companyId path: model-id lookup hits the (mocked) service client; tolerate it.
    const { requireServiceClient } = await import('@/lib/supabase/service')
    vi.mocked(requireServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    } as never)
    await resolveChatModel('co-1')
    expect(createOpenRouterMock.mock.calls.at(-1)?.[0].apiKey).toBe('company-key')
  })
})

describe('Whisper cost precedence (3.5)', () => {
  const cost = () => (recordMock.mock.calls[0][0] as { realCostUsd: number | null }).realCostUsd
  // 1 MB blob at 128 kbps = ~1.0417 min
  const blob = new Blob([new Uint8Array(1_000_000)])
  const minutes = (1_000_000 * 8) / 128_000 / 60

  it('uses the provider usage cost when present', async () => {
    fetchMock.mockResolvedValue(ok({ text: 'hi', usage: { cost: 0.0421 } }))
    await transcribeAudioOR(blob, 'webm', undefined, { companyId: 'co-1' })
    expect(cost()).toBe(0.0421)
  })
  it('falls back to minutes x billing_config.whisperUsdPerMinute', async () => {
    fetchMock.mockResolvedValue(ok({ text: 'hi' }))
    await transcribeAudioOR(blob, 'webm', undefined, { companyId: 'co-1' })
    expect(cost()).toBeCloseTo(minutes * 0.01, 8)
  })
  it('falls back to the constant when billing_config is unreadable', async () => {
    billingCfg.mockRejectedValue(new Error('db down'))
    fetchMock.mockResolvedValue(ok({ text: 'hi' }))
    await transcribeAudioOR(blob, 'webm', undefined, { companyId: 'co-1' })
    expect(cost()).toBeCloseTo(minutes * WHISPER_USD_PER_MINUTE, 8)
  })
  it('records nothing without costContext (Inngest job keeps its own row)', async () => {
    fetchMock.mockResolvedValue(ok({ text: 'hi' }))
    await transcribeAudioOR(blob, 'webm')
    expect(recordMock).not.toHaveBeenCalled()
  })
})

describe('new cost rows (3.8)', () => {
  it('needs-details records a measure-only chat row with the company', async () => {
    fetchMock.mockResolvedValue(
      ok({ choices: [{ message: { content: '{"reason":"too_short","questions":["q"]}' } }], usage: { cost: 0.002 } })
    )
    await buildNeedsDetails('x', 'en', null, { companyId: 'co-1', attemptId: 'att-1' })
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'chat', attemptId: 'att-1', companyId: 'co-1', realCostUsd: 0.002 })
    )
  })
  it('embed records a chat row with the embedding usage cost', async () => {
    fetchMock.mockResolvedValue(ok({ data: [{ embedding: new Array(1536).fill(0) }], usage: { cost: 0.0001 } }))
    await embed('q', { companyId: 'co-1' })
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'chat', companyId: 'co-1', realCostUsd: 0.0001 })
    )
  })
})

describe('structured vision failure alerts (3.10)', () => {
  it('raises ai_provider_failed and rethrows the ORIGINAL error (no retry)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'upstream down' })
    await expect(analyzePhotoStructuredOR('b64', 'image/jpeg')).rejects.toThrow(/structured vision failed \(500\)/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ai_provider_failed' }))
  })
  it('does not alert on success', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { tool_calls: [{ function: { name: 'extract_photo', arguments: JSON.stringify({ version: 1, overall_description: 'ok' }) } }] }, finish_reason: 'stop' }] }))
    await analyzePhotoStructuredOR('b64', 'image/jpeg').catch(() => {})
    expect(notifyMock).not.toHaveBeenCalled()
  })
})
