import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * quick-260705-bml (FIX-1) — Gemini fallback-adapter cost capture.
 * quick-260821 (real cost capture) — extended: Gemini serves ~95% of prod
 * traffic as the silent OpenRouter fallback, and lib/billing/credit-ledger.ts
 * (recordCreditDebit) treats a NULL realCostUsd as "no debit" — so an
 * always-null Gemini cost silently zeroed out credit metering for that
 * traffic. Gemini's SDK returns no USD figure directly, but DOES return token
 * counts on `response.usageMetadata`; computeGeminiCostUsd (lib/ai/pricing/
 * gemini.ts) prices those against Google's published rate card.
 *
 * Pins (original FIX-1, still true when usageMetadata is ABSENT from the
 * mocked SDK response — the pre-existing behavior of every test below that
 * does not opt in via `usageMetadata`):
 *   - generateEstimate success → recordAICost called EXACTLY once with
 *     provider 'gemini', model 'gemini-2.5-flash', operationType 'estimate',
 *     realCostUsd null (never 0) when usage is unknown, ids from
 *     input.costContext.
 *   - generateEstimate WITHOUT costContext → randomUUID attemptId (non-empty),
 *     companyId/projectId null.
 *   - refineEstimate success → recordAICost called once with provider 'gemini',
 *     operationType 'estimate', realCostUsd null when usage is unknown,
 *     randomUUID attemptId, null ids.
 *   - Correlation ids come ONLY from costContext, NEVER from the model's returned
 *     args (suggested_client_name must never become companyId).
 *
 * New pins (quick-260821):
 *   - generateEstimate/refineEstimate/analyzePhotoStructuredGemini — when the
 *     mocked SDK response carries `usageMetadata`, realCostUsd is a NUMBER
 *     computed via computeGeminiCostUsd (never null, never 0-by-guess).
 *   - All three sites — when usageMetadata is absent, realCostUsd is STRICTLY
 *     null (never 0).
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

import { GeminiAdapter, analyzePhotoStructuredGemini } from '@/lib/ai/providers/gemini'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import { computeGeminiCostUsd, GEMINI_USD_PER_MTOK } from '@/lib/ai/pricing/gemini'
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

// A sample usageMetadata shape matching @google/genai's
// GenerateContentResponseUsageMetadata — used to exercise the NUMERIC
// realCostUsd path. Includes thoughtsTokenCount to pin that thinking tokens
// are billed as output.
const SAMPLE_USAGE = { promptTokenCount: 1000, candidatesTokenCount: 500, thoughtsTokenCount: 200 }
const EXPECTED_SAMPLE_COST = computeGeminiCostUsd('gemini-2.5-flash', SAMPLE_USAGE)

// A create_estimate tool-call payload whose suggested_client_name is the
// LLM-derived field — it must NEVER feed companyId/attemptId. `usageMetadata`
// is optional so most tests keep exercising the pre-existing
// usageMetadata-absent → null path.
function makeFunctionCallResponse(items: unknown[], usageMetadata?: Record<string, number>) {
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
    ...(usageMetadata ? { usageMetadata } : {}),
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

  it('generate — realCostUsd is a NUMBER computed from response.usageMetadata when present', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS, SAMPLE_USAGE))

    await new GeminiAdapter().generateEstimate(baseInput)

    const arg = mockRecord.mock.calls[0][0]
    expect(typeof arg.realCostUsd).toBe('number')
    expect(arg.realCostUsd).not.toBeNull()
    expect(arg.realCostUsd).toBeGreaterThan(0)
    expect(arg.realCostUsd).toBe(EXPECTED_SAMPLE_COST)
  })

  it('refine — realCostUsd is a NUMBER computed from response.usageMetadata when present', async () => {
    mockGeminiGenerate.mockResolvedValueOnce(makeFunctionCallResponse(VALID_ITEMS, SAMPLE_USAGE))

    const refineInput: RefineEstimateInput = {
      existingEstimate: VALID_ESTIMATE,
      instruction: 'add a line',
      priceBookItems: [],
    }

    await new GeminiAdapter().refineEstimate(refineInput)

    const arg = mockRecord.mock.calls[0][0]
    expect(typeof arg.realCostUsd).toBe('number')
    expect(arg.realCostUsd).not.toBeNull()
    expect(arg.realCostUsd).toBeGreaterThan(0)
    expect(arg.realCostUsd).toBe(EXPECTED_SAMPLE_COST)
  })
})

describe('computeGeminiCostUsd (lib/ai/pricing/gemini.ts)', () => {
  it('returns a positive number for a priced model with valid usage', () => {
    const cost = computeGeminiCostUsd('gemini-2.5-flash', SAMPLE_USAGE)
    expect(typeof cost).toBe('number')
    expect(cost).toBeGreaterThan(0)
  })

  it('counts thoughtsTokenCount as output — a response with thinking tokens costs MORE', () => {
    const withoutThoughts = computeGeminiCostUsd('gemini-2.5-flash', {
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
    })
    const withThoughts = computeGeminiCostUsd('gemini-2.5-flash', {
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
      thoughtsTokenCount: 200,
    })
    expect(withThoughts).not.toBeNull()
    expect(withoutThoughts).not.toBeNull()
    expect(withThoughts as number).toBeGreaterThan(withoutThoughts as number)
  })

  it('returns null (never a guessed 0) for an unknown/unpriced model', () => {
    expect(computeGeminiCostUsd('gemini-9.9-nonexistent', SAMPLE_USAGE)).toBeNull()
  })

  it('returns null (never 0) when usage is missing', () => {
    expect(computeGeminiCostUsd('gemini-2.5-flash', null)).toBeNull()
    expect(computeGeminiCostUsd('gemini-2.5-flash', undefined)).toBeNull()
  })

  it('returns null when token counts are non-numeric/absent', () => {
    expect(computeGeminiCostUsd('gemini-2.5-flash', {})).toBeNull()
    expect(
      computeGeminiCostUsd('gemini-2.5-flash', {
        promptTokenCount: Number.NaN,
        candidatesTokenCount: 500,
      })
    ).toBeNull()
  })

  it('covers the models this repo actually calls (at least flash/pro/2.0-flash priced)', () => {
    expect(GEMINI_USD_PER_MTOK['gemini-2.5-flash']).toBeDefined()
    expect(GEMINI_USD_PER_MTOK['gemini-2.5-pro']).toBeDefined()
    expect(GEMINI_USD_PER_MTOK['gemini-2.0-flash']).toBeDefined()
  })
})

describe('analyzePhotoStructuredGemini cost capture (quick-260821, third recordAICost site)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const VALID_EXTRACTION = { overall_description: 'A kitchen with cracked tile flooring.' }

  it('realCostUsd is null when usageMetadata is absent (pre-existing behavior)', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: VALID_EXTRACTION }],
    })

    await analyzePhotoStructuredGemini('base64data', 'image/jpeg', {
      attemptId: 'attempt-vision-1',
      companyId: 'company-vision-1',
      projectId: 'project-vision-1',
    })

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(arg.provider).toBe('gemini')
    expect(arg.operationType).toBe('vision')
    expect(arg.realCostUsd).toBeNull()
    expect(arg.realCostUsd).not.toBe(0)
  })

  it('realCostUsd is a NUMBER computed from response.usageMetadata when present', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: VALID_EXTRACTION }],
      usageMetadata: SAMPLE_USAGE,
    })

    await analyzePhotoStructuredGemini('base64data', 'image/jpeg', {
      attemptId: 'attempt-vision-2',
      companyId: 'company-vision-2',
      projectId: 'project-vision-2',
    })

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(typeof arg.realCostUsd).toBe('number')
    expect(arg.realCostUsd).not.toBeNull()
    expect(arg.realCostUsd).toBeGreaterThan(0)
    expect(arg.realCostUsd).toBe(EXPECTED_SAMPLE_COST)
  })
})
