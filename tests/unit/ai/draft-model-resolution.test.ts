import { describe, expect, it, vi, beforeEach } from 'vitest'

/** Phase 4c/4g: draft model = escalation override > company override > draft slot > platform default > Sonnet. */
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/billing/byok', () => ({ getByokOpenRouterKey: vi.fn(async () => null) }))
vi.mock('@/lib/ai/providers/openrouter', () => ({
  OpenRouterAdapter: class {
    constructor(
      public model: string,
      public byok?: string
    ) {}
  },
}))

import { requireServiceClient } from '@/lib/supabase/service'
import { getAIProvider } from '@/lib/ai'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'

const HAIKU = 'anthropic/claude-haiku-5.5'
const OPUS = 'anthropic/claude-opus-5'
const SONNET_X = 'anthropic/claude-sonnet-5.6'

function svc(meta: Record<string, unknown> | null, override: string | null = null) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'companies'
              ? { data: { ai_model_override: override } }
              : { data: meta ? { metadata: meta } : null },
        }),
      }),
    }),
  } as never
}
const modelOf = (p: unknown) => (p as { model: string }).model

describe('getAIProvider draft resolution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('DEFAULT: nothing configured -> OR_DEFAULTS.chat (with and without a company)', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(svc(null))
    expect(modelOf(await getAIProvider())).toBe(OR_DEFAULTS.chat)
    expect(modelOf(await getAIProvider('co'))).toBe(OR_DEFAULTS.chat)
  })

  it('an unrelated or invalid draft slot leaves today\'s chain untouched', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(
      svc({ openrouter_default_model: OPUS, models: { draft: HAIKU, vision: HAIKU } })
    )
    expect(modelOf(await getAIProvider('co'))).toBe(OPUS)
  })

  it('a valid draft slot beats the platform default but not the company override', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(svc({ openrouter_default_model: OPUS, models: { draft: SONNET_X } }))
    expect(modelOf(await getAIProvider('co'))).toBe(SONNET_X)
    vi.mocked(requireServiceClient).mockReturnValue(
      svc({ openrouter_default_model: OPUS, models: { draft: SONNET_X } }, OR_DEFAULTS.chat)
    )
    expect(modelOf(await getAIProvider('co'))).toBe(OR_DEFAULTS.chat)
  })

  it('an escalation modelOverride beats everything, but only when it is Sonnet/Opus', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(svc({ models: { draft: SONNET_X } }, OR_DEFAULTS.chat))
    expect(modelOf(await getAIProvider('co', { modelOverride: OPUS }))).toBe(OPUS)
    expect(modelOf(await getAIProvider(undefined, { modelOverride: OPUS }))).toBe(OPUS)
    expect(modelOf(await getAIProvider('co', { modelOverride: HAIKU }))).toBe(OR_DEFAULTS.chat)
  })
})
