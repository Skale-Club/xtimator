import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * quick-260705-bml (FIX-1) — Gemini fallback-adapter cost capture.
 *
 * The Gemini adapter is the SILENT OpenRouter fallback. Before this fix it made
 * ZERO recordAICost calls, so a Gemini-served estimate was invisible in
 * ai_cost_events (the whole point of the OpenRouter-out-of-credits post-mortem).
 *
 * Pins:
 *   - generateEstimate success → recordAICost called EXACTLY once with
 *     provider 'gemini', model 'gemini-2.5-flash', operationType 'estimate',
 *     realCostUsd STRICTLY null (never 0), ids from input.costContext.
 *   - generateEstimate WITHOUT costContext → randomUUID attemptId (non-empty),
 *     companyId/projectId null.
 *   - refineEstimate success → recordAICost called once with provider 'gemini',
 *     operationType 'estimate', realCostUsd null, randomUUID attemptId, null ids.
 *   - Correlation ids come ONLY from costContext, NEVER from the model's returned
 *     args (suggested_client_name must never become companyId).
 */

const mockGeminiGenerate = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: (...args: unknown[]) => mockGeminiGenerate(...args) }
  },
  Type: { OBJECT: 'object', STRING: 'string', NUMBER: 'number', ARRAY: 'array', BOOLEAN: 'boolean' },
  FunctionCallingConfigMode: { ANY: 'any' },
}))
vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn().mockResolvedValue('test-key'),
}))
vi.mock('@/lib/ai/prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
  buildUserContent: vi.fn().mockReturnValue('user content'),
  buildRefineUserContent: vi.fn().mockReturnValue('refine user content'),
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: vi.fn().mockResolvedValue(undefined),
}))

import { GeminiAdapter } from '@/lib/ai/providers/gemini'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from '@/lib/ai/types'

const mockRecord = recordAICost as ReturnType<typeof vi.fn>

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

// A create_estimate tool-call payload whose suggested_client_name is the
// LLM-derived field — it must NEVER feed companyId/attemptId.
function makeFunctionCallResponse(items: unknown[]) {
  return {
    functionCalls: [
      {
        name: 'create_estimate',
        args: {
          suggested_project_name: 'Smith Plumbing',
          suggested_client_name: 'LLM-DERIVED-CLIENT-NAME',
          summary: 'Replace water heater',
          sections: [{ title: 'Labor', items }],
        },
      },
    ],
  }
}

const VALID_ITEMS = [
  { description: 'Water Heater Install', quantity: 1, unit_price: 800, price_source: 'price_book' },
]

// A normalizeOutput-valid EstimateOutput for the refine existingEstimate input.
const VALID_ESTIMATE: EstimateOutput = {
  suggested_project_name: 'Smith Plumbing',
  summary: 'Replace water heater',
  sections: [
    {
      title: 'Labor',
      items: [
        {
          description: 'Water Heater Install',
          quantity: 1,
          unit_price: 800,
          price_source: 'price_book',
        },
      ],
    },
  ],
} as EstimateOutput

describe('GeminiAdapter cost capture (quick-260705-bml FIX-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generate — records exactly one gemini/estimate/null-cost row with costContext ids', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS))

    const input: EstimateInput = {
      ...baseInput,
      costContext: {
        attemptId: 'attempt-123',
        companyId: 'company-abc',
        projectId: 'project-xyz',
      },
    }

    await new GeminiAdapter().generateEstimate(input)

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(arg).toEqual(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        operationType: 'estimate',
        attemptId: 'attempt-123',
        companyId: 'company-abc',
        projectId: 'project-xyz',
      })
    )
    // realCostUsd is STRICTLY null (a null-cost row still COUNTS the event).
    expect(arg.realCostUsd).toBeNull()
    expect(arg.realCostUsd).not.toBe(0)
  })

  it('generate — correlation ids come from costContext, never from the model args', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS))

    const input: EstimateInput = {
      ...baseInput,
      costContext: { attemptId: 'attempt-123', companyId: 'company-abc', projectId: 'project-xyz' },
    }

    await new GeminiAdapter().generateEstimate(input)

    const arg = mockRecord.mock.calls[0][0]
    expect(arg.companyId).not.toBe('LLM-DERIVED-CLIENT-NAME')
    expect(arg.attemptId).not.toBe('LLM-DERIVED-CLIENT-NAME')
  })

  it('generate WITHOUT costContext — randomUUID attemptId, null company/project ids', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS))

    await new GeminiAdapter().generateEstimate(baseInput)

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(typeof arg.attemptId).toBe('string')
    expect(arg.attemptId.length).toBeGreaterThan(0)
    expect(arg.companyId).toBeNull()
    expect(arg.projectId).toBeNull()
    expect(arg.provider).toBe('gemini')
    expect(arg.realCostUsd).toBeNull()
  })

  it('refine — records one gemini/estimate/null-cost row with randomUUID attemptId + null ids', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS))

    const refineInput: RefineEstimateInput = {
      existingEstimate: VALID_ESTIMATE,
      instruction: 'add a line',
      priceBookItems: [],
    }

    await new GeminiAdapter().refineEstimate(refineInput)

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(arg).toEqual(
      expect.objectContaining({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        operationType: 'estimate',
        companyId: null,
        projectId: null,
      })
    )
    expect(typeof arg.attemptId).toBe('string')
    expect(arg.attemptId.length).toBeGreaterThan(0)
    expect(arg.realCostUsd).toBeNull()
    expect(arg.realCostUsd).not.toBe(0)
  })
})
