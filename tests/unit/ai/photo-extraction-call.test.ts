import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 171 (171-02) — PEXT-01/03/04/05: the structured extraction call path.
 *
 * Locks (per the plan's Opus plan-check fixes):
 *  (a) happy path -> validated PhotoExtraction, recordAICost called with the
 *      passed costContext.
 *  (b) finish_reason 'length' -> typed TruncatedOutputError (no persisted
 *      shape returned) — recordAICost STILL fires (a genuine tool-call
 *      attempt was made, even if truncated).
 *  (c) schema-invalid tool args -> typed InvalidPhotoExtractionError AND
 *      recordAICost was STILL called (the cost-ordering contract — a
 *      billable response that fails the zod gate still cost money).
 *  (d) PARITY: the same invalid fixture is rejected identically via BOTH
 *      provider paths (one shared zod gate — the real drift lock).
 *  (e) tool-declaration derivation: OpenRouter's request `parameters` IS
 *      `photoExtractionToolSchema()` (deep-equal); Gemini's declaration
 *      CANNOT deep-equal it (different SDK type system — no `Type.ENUM`) so
 *      property KEYS + the three enum VALUE-SETS (embedded in description
 *      text) are asserted instead, mirroring the AIREL-03 test's approach.
 *  (f) temperature 0.3 + max_tokens/maxOutputTokens 700 present in both
 *      providers' request bodies; Gemini's config is FLAT (no nested
 *      generationConfig key); the structured timeout is the dedicated 40s
 *      constant, distinct from the 120s chat constant.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(async () => 'test-key'),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: () => ({ end: () => {} }),
    flushAsync: async () => {},
  },
}))
const mockRecordAICost = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: (...args: unknown[]) => mockRecordAICost(...args),
}))
const mockGeminiGenerate = vi.fn()
vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: (...args: unknown[]) => mockGeminiGenerate(...args) }
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    ARRAY: 'ARRAY',
    BOOLEAN: 'BOOLEAN',
  },
  FunctionCallingConfigMode: { ANY: 'ANY' },
}))

import {
  analyzePhotoStructuredOR,
  InvalidPhotoExtractionError,
  STRUCTURED_VISION_TIMEOUT_MS,
  AI_CHAT_TIMEOUT_MS,
} from '@/lib/ai/openrouter-client'
import { analyzePhotoStructuredGemini, extractPhotoDeclaration } from '@/lib/ai/providers/gemini'
import { photoExtractionToolSchema } from '@/lib/ai/photo-extraction-schema'

type MockFetch = ReturnType<typeof vi.fn>

function mockToolCallResponse(
  args: Record<string, unknown>,
  finishReason: string | null = 'stop',
  cost: number | undefined = 0.01
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: 'extract_photo', arguments: JSON.stringify(args) } }],
          },
          finish_reason: finishReason,
        },
      ],
      ...(cost === undefined ? {} : { usage: { cost } }),
    }),
  }
}

function requestBody(callIndex = 0): Record<string, unknown> {
  const calls = (global.fetch as MockFetch).mock.calls
  const init = calls[callIndex][1] as RequestInit
  return JSON.parse(init.body as string)
}

const VALID_EXTRACTION = {
  version: 1,
  surfaces: [{ name: 'kitchen floor', material: 'tile', condition: 'worn' }],
  measurements: [
    { dimension: 'area', value: 120, unit: 'sq ft', subject: 'kitchen floor', confidence: 'estimated' },
  ],
  materials: ['tile'],
  damage: [{ description: 'cracked tile', severity: 'minor' }],
  trade_signals: ['flooring'],
  access_notes: null,
  overall_description: 'A kitchen with cracked tile flooring needing replacement.',
}

// Fails the ONE hard requirement (overall_description non-empty) — the
// shared invalid fixture used by the parity test (d).
const INVALID_EXTRACTION = { version: 1, overall_description: '' }

describe('analyzePhotoStructuredOR (PEXT-01/03/05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('(a) happy path — validated PhotoExtraction, recordAICost called with the passed costContext', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce(mockToolCallResponse(VALID_EXTRACTION, 'stop', 0.01))
    const costContext = { attemptId: 'attempt-1', companyId: 'company-1', projectId: 'project-1' }

    const result = await analyzePhotoStructuredOR('base64data', 'image/jpeg', undefined, costContext)

    expect(result.overall_description).toBe(VALID_EXTRACTION.overall_description)
    expect(result.measurements).toHaveLength(1)
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-1',
        companyId: 'company-1',
        projectId: 'project-1',
        operationType: 'vision',
        provider: 'openrouter',
        realCostUsd: 0.01,
      })
    )
  })

  it('(b) finish_reason "length" -> typed TruncatedOutputError; recordAICost STILL fires (attempt was made)', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce(
      mockToolCallResponse(VALID_EXTRACTION, 'length', 0.02)
    )

    await expect(analyzePhotoStructuredOR('base64data', 'image/jpeg')).rejects.toThrow(/truncated/i)
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledWith(expect.objectContaining({ realCostUsd: 0.02 }))
  })

  it('(c) schema-invalid tool args -> typed InvalidPhotoExtractionError AND recordAICost was STILL called (cost-ordering)', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce(
      mockToolCallResponse(INVALID_EXTRACTION, 'stop', 0.03)
    )

    await expect(analyzePhotoStructuredOR('base64data', 'image/jpeg')).rejects.toThrow(
      InvalidPhotoExtractionError
    )
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledWith(
      expect.objectContaining({ operationType: 'vision', realCostUsd: 0.03 })
    )
  })

  it('a response with NO tool-call attempt at all is not billed (mirrors the estimate callTool convention)', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'plain text, ignored the forced tool_choice' }, finish_reason: 'stop' }],
        usage: { cost: 0.01 },
      }),
    })

    await expect(analyzePhotoStructuredOR('base64data', 'image/jpeg')).rejects.toThrow(
      /did not return a structured extraction/i
    )
    expect(mockRecordAICost).not.toHaveBeenCalled()
  })

  it('(f) request body: temperature 0.3, max_tokens 700, tools[0].function.parameters IS photoExtractionToolSchema()', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce(mockToolCallResponse(VALID_EXTRACTION))

    await analyzePhotoStructuredOR('base64data', 'image/jpeg')

    const body = requestBody(0)
    expect(body.temperature).toBe(0.3)
    expect(body.max_tokens).toBe(700)
    const tools = body.tools as Array<{ function: { parameters: unknown } }>
    expect(tools[0].function.parameters).toEqual(photoExtractionToolSchema())
  })

  it('the structured timeout constant is a dedicated 40s budget, distinct from the 120s chat constant', () => {
    expect(STRUCTURED_VISION_TIMEOUT_MS).toBe(40_000)
    expect(STRUCTURED_VISION_TIMEOUT_MS).not.toBe(AI_CHAT_TIMEOUT_MS)
  })
})

describe('analyzePhotoStructuredGemini (PEXT-01/03/04/05)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path — validated PhotoExtraction, recordAICost called (provider gemini, realCostUsd null)', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: VALID_EXTRACTION }],
    })
    const costContext = { attemptId: 'attempt-2', companyId: 'company-2', projectId: 'project-2' }

    const result = await analyzePhotoStructuredGemini('base64data', 'image/jpeg', costContext)

    expect(result.overall_description).toBe(VALID_EXTRACTION.overall_description)
    expect(mockRecordAICost).toHaveBeenCalledOnce()
    expect(mockRecordAICost).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-2',
        companyId: 'company-2',
        projectId: 'project-2',
        operationType: 'vision',
        provider: 'gemini',
        realCostUsd: null,
      })
    )
  })

  it('(f) config is FLAT (no nested generationConfig), maxOutputTokens 700, temperature 0.3', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: VALID_EXTRACTION }],
    })

    await analyzePhotoStructuredGemini('base64data', 'image/jpeg')

    const callArgs = mockGeminiGenerate.mock.calls[0][0] as { config: Record<string, unknown> }
    expect(callArgs.config.generationConfig).toBeUndefined()
    expect(callArgs.config.maxOutputTokens).toBe(700)
    expect(callArgs.config.temperature).toBe(0.3)
  })

  it('(c/d) schema-invalid tool args -> typed InvalidPhotoExtractionError, same fixture as the OR path', async () => {
    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: INVALID_EXTRACTION }],
    })

    await expect(analyzePhotoStructuredGemini('base64data', 'image/jpeg')).rejects.toThrow(
      InvalidPhotoExtractionError
    )
  })
})

describe('PARITY (PEXT-04) — the ONE zod gate rejects the same invalid fixture via BOTH provider paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('(d) the same invalid fixture is rejected identically via OpenRouter AND Gemini', async () => {
    ;(global.fetch as MockFetch).mockResolvedValueOnce(mockToolCallResponse(INVALID_EXTRACTION))
    await expect(analyzePhotoStructuredOR('base64data', 'image/jpeg')).rejects.toThrow(
      InvalidPhotoExtractionError
    )

    mockGeminiGenerate.mockResolvedValueOnce({
      functionCalls: [{ name: 'extract_photo', args: INVALID_EXTRACTION }],
    })
    await expect(analyzePhotoStructuredGemini('base64data', 'image/jpeg')).rejects.toThrow(
      InvalidPhotoExtractionError
    )
  })

  it('(e) OpenRouter tool parameters IS photoExtractionToolSchema() (deep-equal) — Gemini CANNOT (different SDK type system)', () => {
    // OpenRouter's parameters are asserted deep-equal in the (f) test above.
    // Gemini's declaration uses @google/genai Type.* enums (STRING/OBJECT/...)
    // with no Type.ENUM, so it structurally cannot match the JSON-schema
    // shape — key+enum parity (below) is the actual drift lock instead.
    expect(extractPhotoDeclaration.parameters).not.toEqual(photoExtractionToolSchema())
  })

  it('(e) Gemini declaration property KEYS match photoExtractionToolSchema() top-level keys', () => {
    const zodKeys = Object.keys(photoExtractionToolSchema().properties as Record<string, unknown>).sort()
    const geminiKeys = Object.keys(extractPhotoDeclaration.parameters.properties).sort()
    expect(geminiKeys).toEqual(zodKeys)
  })

  it('(e) Gemini enum VALUE-SETS (dimension/confidence/severity) match the zod tool schema exactly', () => {
    type ToolSchema = {
      properties: {
        measurements: { items: { properties: { dimension: { enum: string[] }; confidence: { enum: string[] } } } }
        damage: { items: { properties: { severity: { enum: string[] } } } }
      }
    }
    const toolSchema = photoExtractionToolSchema() as unknown as ToolSchema

    function extractQuoted(desc: string): string[] {
      return [...desc.matchAll(/'([^']+)'/g)].map((m) => m[1])
    }

    const geminiMeasurements = extractPhotoDeclaration.parameters.properties.measurements.items
      .properties as { dimension: { description: string }; confidence: { description: string } }
    const geminiDamage = extractPhotoDeclaration.parameters.properties.damage.items.properties as {
      severity: { description: string }
    }

    expect(new Set(extractQuoted(geminiMeasurements.dimension.description))).toEqual(
      new Set(toolSchema.properties.measurements.items.properties.dimension.enum)
    )
    expect(new Set(extractQuoted(geminiMeasurements.confidence.description))).toEqual(
      new Set(toolSchema.properties.measurements.items.properties.confidence.enum)
    )
    expect(new Set(extractQuoted(geminiDamage.severity.description))).toEqual(
      new Set(toolSchema.properties.damage.items.properties.severity.enum)
    )
  })
})
