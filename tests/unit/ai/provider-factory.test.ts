import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/ai/providers/anthropic', () => ({
  AnthropicAdapter: class MockAnthropicAdapter {},
}))
vi.mock('@/lib/ai/providers/gemini', () => ({
  GeminiAdapter: class MockGeminiAdapter {},
}))

import { requireServiceClient } from '@/lib/supabase/service'
import { AnthropicAdapter } from '@/lib/ai/providers/anthropic'
import { GeminiAdapter } from '@/lib/ai/providers/gemini'
import { getAIProvider } from '@/lib/ai'

describe('getAIProvider factory', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns AnthropicAdapter when selected_ai_provider is anthropic', async () => {
    vi.mocked(requireServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: { selected_ai_provider: 'anthropic' } }, error: null }) }) }) }),
    } as any)
    const provider = await getAIProvider()
    expect(provider).toBeInstanceOf(AnthropicAdapter)
  })

  it('returns GeminiAdapter when selected_ai_provider is gemini', async () => {
    vi.mocked(requireServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: { selected_ai_provider: 'gemini' } }, error: null }) }) }) }),
    } as any)
    const provider = await getAIProvider()
    expect(provider).toBeInstanceOf(GeminiAdapter)
  })

  it('defaults to AnthropicAdapter when no ai_config row exists', async () => {
    vi.mocked(requireServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    } as any)
    const provider = await getAIProvider()
    expect(provider).toBeInstanceOf(AnthropicAdapter)
  })
})
