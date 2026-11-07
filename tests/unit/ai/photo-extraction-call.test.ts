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
 *  (e) tool-declaration derivation: OpenRouter's request `parameters` IS
 *      `photoExtractionToolSchema()` (deep-equal).
 *  (f) temperature 0.3 + max_tokens 700 present in the request body; the
 *      structured timeout is the dedicated 40s constant, distinct from the
 *      120s chat constant.
 * Owner rule: OpenRouter only (the Gemini sibling path was removed).
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

import {
  analyzePhotoStructuredOR,
  InvalidPhotoExtractionError,
  STRUCTURED_VISION_TIMEOUT_MS,
  AI_CHAT_TIMEOUT_MS,
} from '@/lib/ai/openrouter-client'
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
