import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// getAiModelSettings: 30 s in-memory cache, read-time validation, invalidation.
let metadata: Record<string, unknown> | null = null
const maybeSingle = vi.fn(async () => ({ data: metadata === null ? null : { metadata }, error: null }))
const from = vi.fn((_t: string) => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from }), requireServiceClient: () => ({ from }) }))
vi.mock('@/lib/crypto/aes', () => ({ decrypt: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({ invalidateBillingConfigCache: vi.fn() }))

import {
  getAiModelSettings,
  getOpenRouterDefaultModel,
  invalidatePlatformConfig,
} from '@/lib/platform-config'

describe('getAiModelSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'))
    metadata = null
    maybeSingle.mockClear()
    invalidatePlatformConfig()
  })
  afterEach(() => vi.useRealTimers())

  it('nothing configured -> empty settings (today\'s behavior)', async () => {
    expect(await getAiModelSettings()).toEqual({ defaultModel: null, models: {}, escalation: null })
    expect(await getOpenRouterDefaultModel()).toBeNull()
  })

  it('validates slots and escalation at read time', async () => {
    metadata = {
      openrouter_default_model: 'anthropic/claude-opus-5',
      models: { vision: 'anthropic/claude-haiku-5.5', draft: 'anthropic/claude-haiku-5.5', plan: 'openai/gpt-5' },
      escalation: { enabled: true, model: 'anthropic/claude-sonnet-5.5' },
    }
    const s = await getAiModelSettings()
    expect(s.models).toEqual({ vision: 'anthropic/claude-haiku-5.5' })
    expect(s.escalation).toBeNull()
    expect(s.defaultModel).toBe('anthropic/claude-opus-5')
  })

  it('caches for 30 s, then re-reads', async () => {
    metadata = { models: { review: 'anthropic/claude-haiku-5.5' } }
    await getAiModelSettings()
    await getAiModelSettings()
    await getOpenRouterDefaultModel()
    expect(maybeSingle).toHaveBeenCalledTimes(1)

    metadata = { models: { review: 'anthropic/claude-sonnet-5.5' } }
    vi.advanceTimersByTime(29_000)
    expect((await getAiModelSettings()).models.review).toBe('anthropic/claude-haiku-5.5')
    vi.advanceTimersByTime(2_000)
    expect((await getAiModelSettings()).models.review).toBe('anthropic/claude-sonnet-5.5')
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })

  it('invalidatePlatformConfig (every admin save) drops the cache immediately', async () => {
    metadata = { models: { plan: 'anthropic/claude-haiku-5.5' } }
    await getAiModelSettings()
    metadata = { models: {} }
    invalidatePlatformConfig()
    expect((await getAiModelSettings()).models).toEqual({})
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })

  it('a failed read is not cached and resolves to defaults', async () => {
    maybeSingle.mockRejectedValueOnce(new Error('db down'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getAiModelSettings()).toEqual({ defaultModel: null, models: {}, escalation: null })
    metadata = { models: { plan: 'anthropic/claude-haiku-5.5' } }
    expect((await getAiModelSettings()).models.plan).toBe('anthropic/claude-haiku-5.5')
  })
})
