import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 4c: per-step model slots. THE contract tested here: with nothing saved
 * every call uses exactly the model it used before the slots existed; a valid
 * slot replaces it; an invalid slot is ignored.
 */
const HAIKU = 'anthropic/claude-haiku-5.5'
const SONNET = 'anthropic/claude-sonnet-5.5'
const OPUS = 'anthropic/claude-opus-5'

let settings: { defaultModel: string | null; models: Record<string, string>; escalation: unknown }
const getAiModelSettings = vi.fn(async () => settings)
const getOpenRouterDefaultModel = vi.fn(async () => settings.defaultModel)

vi.mock('@/lib/platform-config', () => ({
  getAiModelSettings: () => getAiModelSettings(),
  getOpenRouterDefaultModel: () => getOpenRouterDefaultModel(),
  getIntegrationKey: vi.fn(async () => 'sk-test-placeholder'),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => null) }))
vi.mock('@/lib/ai/openrouter-client', () => ({
  getORKey: vi.fn(async () => 'platform-key'),
  resolveOpenRouterKey: vi.fn(async () => ({ apiKey: 'platform-key' })),
  OPENROUTER_BASE: 'https://openrouter.test/api/v1',
  OR_DEFAULTS: { chat: 'anthropic/claude-sonnet-5.5', fast: 'anthropic/claude-haiku-5.5' },
  AI_CHAT_TIMEOUT_MS: 5_000,
}))
vi.mock('@/lib/billing/byok', () => ({ getByokOpenRouterKey: vi.fn(async () => null) }))
const costMock = vi.fn()
vi.mock('@/lib/billing/record-ai-cost', () => ({ recordAICost: (...a: unknown[]) => costMock(...a) }))

import { resolveSlotModel } from '@/lib/ai/step-models'
import { planScope } from '@/lib/ai/plan-scope'
import { buildNeedsDetails } from '@/lib/ai/needs-details'
import { makeOpenRouterWebProvider } from '@/lib/estimate/price-research/adapters/openrouter-web'
import type { EstimateInput } from '@/lib/ai/types'

const input: EstimateInput = {
  industry: 'painting',
  projectName: 'Job',
  projectType: 'General',
  targetBudget: null,
  clientName: null,
  clientAddress: null,
  transcripts: ['Paint the bedroom walls, twelve by fourteen, two coats.'],
  photoDescriptions: [],
  priceBookItems: [],
}

function stubFetch(body: unknown = { choices: [{ message: { content: '{}' } }] }) {
  const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as unknown as Response)
  vi.stubGlobal('fetch', f)
  return f
}
const sentModel = (f: ReturnType<typeof vi.fn>) =>
  JSON.parse(((f.mock.calls[0] as unknown as [string, RequestInit])[1]).body as string).model as string

beforeEach(() => {
  settings = { defaultModel: null, models: {}, escalation: null }
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('resolveSlotModel', () => {
  it('returns the fallback when nothing is configured, the slot is invalid, or the read fails', async () => {
    expect(await resolveSlotModel('vision', 'FALLBACK')).toBe('FALLBACK')
    settings.models = { draft: HAIKU } // Haiku is not allowed for draft (also dropped at read time)
    expect(await resolveSlotModel('draft', 'FALLBACK')).toBe('FALLBACK')
    getAiModelSettings.mockRejectedValueOnce(new Error('db down'))
    expect(await resolveSlotModel('vision', 'FALLBACK')).toBe('FALLBACK')
  })

  it('returns the slot model when valid', async () => {
    settings.models = { vision: HAIKU }
    expect(await resolveSlotModel('vision', undefined)).toBe(HAIKU)
  })
})

describe('plan slot (planScope)', () => {
  it('DEFAULT: Haiku (OR_DEFAULTS.fast)', async () => {
    const f = stubFetch()
    await planScope(input)
    expect(sentModel(f)).toBe(HAIKU)
  })
  it('slot set: uses it', async () => {
    settings.models = { plan: SONNET }
    const f = stubFetch()
    await planScope(input)
    expect(sentModel(f)).toBe(SONNET)
  })
})

describe('review slot (needs-details)', () => {
  it('DEFAULT: Haiku, and the cost row records Haiku', async () => {
    const f = stubFetch()
    await buildNeedsDetails('paint a room', 'en')
    expect(sentModel(f)).toBe(HAIKU)
    expect(costMock.mock.calls[0][0]).toMatchObject({ model: HAIKU })
  })
  it('slot set: uses it for the call and the cost row', async () => {
    settings.models = { review: SONNET }
    const f = stubFetch()
    await buildNeedsDetails('paint a room', 'en')
    expect(sentModel(f)).toBe(SONNET)
    expect(costMock.mock.calls[0][0]).toMatchObject({ model: SONNET })
  })
})

describe('research slot (openrouter-web)', () => {
  const lookup = () => makeOpenRouterWebProvider().lookup([{ name: 'Drywall repair' }], { city: 'Austin', state: 'TX' }, 'USD')

  it('DEFAULT: the platform default model, else Sonnet', async () => {
    let f = stubFetch()
    await lookup()
    expect(sentModel(f)).toBe(SONNET)
    settings.defaultModel = OPUS
    f = stubFetch()
    await lookup()
    expect(sentModel(f)).toBe(OPUS)
  })
  it('slot set: beats the platform default', async () => {
    settings.defaultModel = OPUS
    settings.models = { research: SONNET }
    const f = stubFetch()
    await lookup()
    expect(sentModel(f)).toBe(SONNET)
  })
})
