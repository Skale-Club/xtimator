import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGeminiGenerate = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: (...args: unknown[]) => mockGeminiGenerate(...args) }
  },
  Type: { OBJECT: 'object', STRING: 'string', NUMBER: 'number', ARRAY: 'array' },
  FunctionCallingConfigMode: { ANY: 'any' },
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))
vi.mock('@/lib/ai/prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildUserContent: vi.fn().mockReturnValue('user content'),
}))

describe('GeminiAdapter', () => {
  it('functionDeclarations contains price_source field', () => {
    expect.fail('not implemented')
  })

  it('FunctionCallingConfigMode.ANY is used in toolConfig', () => {
    expect.fail('not implemented')
  })

  it('returns EstimateOutput from functionCalls[0].args', () => {
    expect.fail('not implemented')
  })

  it('defensive fallback: item missing price_source defaults to ai_estimate', () => {
    expect.fail('not implemented')
  })
})
