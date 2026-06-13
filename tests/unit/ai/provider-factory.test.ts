import { describe, expect, it, vi, beforeEach } from 'vitest'

// getAIProvider() reads ai_config / company override via the service client.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

// The AI layer is OpenRouter-only now (lib/ai/index.ts: "Anthropic/Gemini SDKs are no
// longer used here"). getAIProvider dynamically imports the OpenRouter adapter; mock it so
// we can capture the resolved model id.
vi.mock('@/lib/ai/providers/openrouter', () => ({
  OpenRouterAdapter: class MockOpenRouterAdapter {
    model: string
    constructor(model: string) {
      this.model = model
    }
  },
}))

import { requireServiceClient } from '@/lib/supabase/service'
import { OpenRouterAdapter } from '@/lib/ai/providers/openrouter'
import { getAIProvider } from '@/lib/ai'
import { OR_DEFAULTS } from '@/lib/ai/openrouter-client'

/**
 * Build a service-client mock matching getAIProvider's two reads:
 *   from('companies').select('ai_model_override').eq('id', companyId).maybeSingle()
 *   from('platform_integrations').select('metadata').eq('provider','ai_config').maybeSingle()
 */
function mockSvc(rows: {
  company?: { ai_model_override?: string | null } | null
  aiConfig?: { metadata?: { openrouter_default_model?: string } | null } | null
}) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'companies'
              ? { data: rows.company ?? null }
              : { data: rows.aiConfig ?? null },
        }),
      }),
    }),
  }
}

describe('getAIProvider (OpenRouter resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an OpenRouterAdapter on the platform-default model when nothing is configured', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(mockSvc({}) as never)
    const provider = await getAIProvider()
    expect(provider).toBeInstanceOf(OpenRouterAdapter)
    expect((provider as unknown as { model: string }).model).toBe(OR_DEFAULTS.chat)
  })

  it('uses the platform ai_config.openrouter_default_model when set', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSvc({ aiConfig: { metadata: { openrouter_default_model: 'openai/gpt-4o' } } }) as never
    )
    const provider = await getAIProvider()
    expect(provider).toBeInstanceOf(OpenRouterAdapter)
    expect((provider as unknown as { model: string }).model).toBe('openai/gpt-4o')
  })

  it('prefers the per-company ai_model_override when present', async () => {
    vi.mocked(requireServiceClient).mockReturnValue(
      mockSvc({
        company: { ai_model_override: 'google/gemini-2.0-flash' },
        aiConfig: { metadata: { openrouter_default_model: 'openai/gpt-4o' } },
      }) as never
    )
    const provider = await getAIProvider('company-1')
    expect((provider as unknown as { model: string }).model).toBe('google/gemini-2.0-flash')
  })
})
