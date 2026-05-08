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

import { AnthropicAdapter } from '@/lib/ai/providers/anthropic'
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

function makeToolUseResponse(items: unknown[]) {
  return {
    content: [
      {
        type: 'tool_use',
        input: {
          suggested_project_name: 'Smith Plumbing',
          summary: 'Replace water heater',
          sections: [{ title: 'Labor', items }],
        },
      },
    ],
  }
}

describe('AnthropicAdapter', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('price_source field is present in create_estimate input_schema as required', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      makeToolUseResponse([{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }])
    )
    await new AnthropicAdapter().generateEstimate(baseInput)
    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    const itemSchema = callArgs.tools[0].input_schema.properties.sections.items.properties.items.items
    expect(itemSchema.required).toContain('price_source')
    expect(itemSchema.properties.price_source.enum).toEqual(['price_book', 'ai_estimate'])
  })

  it('tool_choice forces create_estimate tool', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      makeToolUseResponse([{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }])
    )
    await new AnthropicAdapter().generateEstimate(baseInput)
    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'create_estimate' })
  })

  it('returns EstimateOutput with price_source on each item', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      makeToolUseResponse([{ description: 'Water Heater Install', quantity: 1, unit_price: 800, price_source: 'price_book' }])
    )
    const result = await new AnthropicAdapter().generateEstimate(baseInput)
    expect(result.sections[0].items[0].price_source).toBe('price_book')
    expect(result.suggested_project_name).toBe('Smith Plumbing')
  })

  it('defensive fallback: item missing price_source defaults to ai_estimate', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      makeToolUseResponse([{ description: 'Labor', quantity: 2, unit_price: 150 }])
    )
    const result = await new AnthropicAdapter().generateEstimate(baseInput)
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
  })
})
