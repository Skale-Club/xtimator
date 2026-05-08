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

import { GeminiAdapter } from '@/lib/ai/providers/gemini'
import type { EstimateInput } from '@/lib/ai/types'

const baseInput: EstimateInput = {
  industry: 'plumbing',
  projectName: 'Test Project',
  projectType: null,
  targetBudget: null,
  clientName: 'John Smith',
  clientAddress: null,
  transcripts: [],
  photoDescriptions: [],
  priceBookItems: [],
  defaultPaymentTerms: null,
  defaultWarrantyTerms: null,
}

function makeFunctionCallResponse(items: unknown[]) {
  return {
    functionCalls: [
      {
        name: 'create_estimate',
        args: {
          suggested_project_name: 'Smith Plumbing',
          summary: 'Replace water heater',
          sections: [{ title: 'Labor', items }],
        },
      },
    ],
  }
}

describe('GeminiAdapter', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('functionDeclarations contains price_source field', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(
      makeFunctionCallResponse([{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }])
    )
    await new GeminiAdapter().generateEstimate(baseInput)
    const callArgs = mockGeminiGenerate.mock.calls[0][0]
    const itemProps = callArgs.config.tools[0].functionDeclarations[0].parameters.properties.sections.items.properties.items.items.properties
    expect(itemProps).toHaveProperty('price_source')
    const itemRequired = callArgs.config.tools[0].functionDeclarations[0].parameters.properties.sections.items.properties.items.items.required
    expect(itemRequired).toContain('price_source')
  })

  it('FunctionCallingConfigMode.ANY is used in toolConfig', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(
      makeFunctionCallResponse([{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }])
    )
    await new GeminiAdapter().generateEstimate(baseInput)
    const callArgs = mockGeminiGenerate.mock.calls[0][0]
    expect(callArgs.config.toolConfig.functionCallingConfig.mode).toBe('any')
    expect(callArgs.config.toolConfig.functionCallingConfig.allowedFunctionNames).toContain('create_estimate')
  })

  it('returns EstimateOutput from functionCalls[0].args', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(
      makeFunctionCallResponse([{ description: 'Water Heater Install', quantity: 1, unit_price: 800, price_source: 'price_book' }])
    )
    const result = await new GeminiAdapter().generateEstimate(baseInput)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.suggested_project_name).toBe('Smith Plumbing')
  })

  it('defensive fallback: item missing price_source defaults to ai_estimate', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(
      makeFunctionCallResponse([{ description: 'Labor', quantity: 2, unit_price: 150 }])
    )
    const result = await new GeminiAdapter().generateEstimate(baseInput)
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
  })
})
