import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))
vi.mock('@/lib/ai/providers/anthropic', () => ({
  AnthropicAdapter: class MockAnthropicAdapter {},
}))
vi.mock('@/lib/ai/providers/gemini', () => ({
  GeminiAdapter: class MockGeminiAdapter {},
}))

describe('getAIProvider factory', () => {
  it('returns AnthropicAdapter when selected_ai_provider is anthropic', () => {
    expect.fail('not implemented')
  })

  it('returns GeminiAdapter when selected_ai_provider is gemini', () => {
    expect.fail('not implemented')
  })

  it('defaults to AnthropicAdapter when no ai_config row exists', () => {
    expect.fail('not implemented')
  })
})
