import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockAnthropicCreate(...args) }
  },
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))
vi.mock('@/lib/ai/prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildUserContent: vi.fn().mockReturnValue('user content'),
}))

describe('AnthropicAdapter', () => {
  it('price_source field is present in create_estimate input_schema as required', () => {
    expect.fail('not implemented')
  })

  it('tool_choice forces create_estimate tool', () => {
    expect.fail('not implemented')
  })

  it('returns EstimateOutput with price_source on each item', () => {
    expect.fail('not implemented')
  })

  it('defensive fallback: item missing price_source defaults to ai_estimate', () => {
    expect.fail('not implemented')
  })
})
