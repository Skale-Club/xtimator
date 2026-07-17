import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * AIREL-02 — finish_reason==='length' is typed as TruncatedOutputError, not a
 * generic malformed-JSON error, and cannot silently persist a partial
 * estimate.
 *
 * Before this fix, `finish_reason` was never read at all:
 *   - a truncation landing mid-JSON parsed as a SyntaxError, surfacing the
 *     generic "OpenRouter returned malformed tool-call arguments" (masking
 *     the real cause — audit v4.19 C2).
 *   - a "lucky" truncation landing on byte-for-byte VALID (but incomplete)
 *     JSON parsed successfully and could persist as a SILENT partial estimate
 *     — the most dangerous case, exercised by test (b) below.
 *
 * Mirrors openrouter-cost-capture.test.ts's mocking conventions.
 */

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))
vi.mock('@/lib/billing/record-ai-cost', () => ({
  recordAICost: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: {
    generation: vi.fn(() => ({ end: vi.fn() })),
    flushAsync: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))

import { OpenRouterAdapter } from '@/lib/ai/providers/openrouter'
import { getIntegrationKey } from '@/lib/platform-config'
import { notifyOps } from '@/lib/observability/ops-alert'
import { callWithFallback, TruncatedOutputError } from '@/lib/ai/with-fallback'
import type { EstimateInput, EstimateOutput } from '@/lib/ai/types'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>
const mockNotifyOps = notifyOps as ReturnType<typeof vi.fn>

const MODEL = 'anthropic/claude-sonnet-4-5'

const VALID_TOOL_ARGS = JSON.stringify({
  suggested_project_name: 'Smith Bathroom Remodel',
  summary: 'Bathroom remodel',
  sections: [
    {
      title: 'Demo',
      items: [
        {
          description: 'Remove old tile',
          quantity: 1,
          unit_price: 100,
          price_source: 'ai_estimate',
        },
      ],
    },
  ],
})

// A tool-call arguments string cut off mid-object — genuinely malformed JSON,
// simulating a truncation that lands mid-token.
const TRUNCATED_INVALID_ARGS = '{"suggested_project_name":"Smith Bathroom Rem'

function makeResponse(finishReason: string, argsJson?: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: finishReason,
          message: {
            tool_calls: argsJson
              ? [{ function: { name: 'create_estimate', arguments: argsJson } }]
              : [],
          },
        },
      ],
    }),
  }
}

function makeInput(): EstimateInput {
  return {
    industry: 'construction',
    projectName: 'Smith Remodel',
    projectType: null,
    targetBudget: null,
    clientName: null,
    clientAddress: null,
    transcripts: ['kitchen remodel'],
    photoDescriptions: [],
    priceBookItems: [],
    defaultPaymentTerms: null,
    defaultWarrantyTerms: null,
  }
}

describe('OpenRouterAdapter — finish_reason truncation (AIREL-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKey.mockResolvedValue('or-key')
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('(a) finish_reason=length + truncated/invalid JSON -> TruncatedOutputError (NOT a generic SyntaxError-wrapped error)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('length', TRUNCATED_INVALID_ARGS)
    )

    let caught: unknown
    try {
      await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TruncatedOutputError)
    expect((caught as Error).message).not.toMatch(/malformed tool-call arguments/)
  })

  it('(b) finish_reason=length + VALID JSON -> STILL TruncatedOutputError (the silent-partial killer)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('length', VALID_TOOL_ARGS)
    )

    const adapter = new OpenRouterAdapter(MODEL)
    await expect(adapter.generateEstimate(makeInput())).rejects.toBeInstanceOf(
      TruncatedOutputError
    )
  })

  it('(c) finish_reason=tool_calls + valid JSON -> parses normally (no truncation)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('tool_calls', VALID_TOOL_ARGS)
    )

    const result = await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())
    expect(result.suggested_project_name).toBe('Smith Bathroom Remodel')
  })

  it('finish_reason=stop + valid JSON -> parses normally (no truncation)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('stop', VALID_TOOL_ARGS)
    )

    const result = await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())
    expect(result.suggested_project_name).toBe('Smith Bathroom Remodel')
  })

  it('finish_reason=length with NO tool-call args at all -> still typed as truncation, not the generic "did not return a structured estimate" error', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse('length'))

    await expect(
      new OpenRouterAdapter(MODEL).generateEstimate(makeInput())
    ).rejects.toBeInstanceOf(TruncatedOutputError)
  })

  it('TruncatedOutputError carries the .truncated marker and the operation name in its message', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse('length', VALID_TOOL_ARGS)
    )

    let caught: unknown
    try {
      await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TruncatedOutputError)
    expect((caught as { truncated?: boolean }).truncated).toBe(true)
    expect((caught as Error).message).toContain('generate_estimate')
    expect((caught as Error).message).toContain('finish_reason=length')
  })
})

describe('TruncatedOutputError x callWithFallback — not terminal, diagnosable (AIREL-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a primary TruncatedOutputError still runs the fallback exactly once (NOT treated as terminal like InvalidEstimateOutputError)', async () => {
    const primary = vi.fn().mockRejectedValue(new TruncatedOutputError('generate_estimate'))
    const fallbackResult: EstimateOutput = {
      suggested_project_name: 'From Gemini',
      suggested_client_name: null,
      summary: 'served by fallback',
      sections: [],
    }
    const fallback = vi.fn().mockResolvedValue(fallbackResult)

    const outcome = await callWithFallback({ op: 'generate_estimate', primary, fallback })

    expect(outcome.servedBy).toBe('fallback')
    expect(outcome.fallbackFired).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('the fallback-served ops alert names TruncatedOutputError so the cause is diagnosable (not masked as a generic Error)', async () => {
    const primary = vi.fn().mockRejectedValue(new TruncatedOutputError('generate_estimate'))
    const fallback = vi.fn().mockResolvedValue('ok')

    await callWithFallback({ op: 'generate_estimate', primary, fallback })

    expect(mockNotifyOps).toHaveBeenCalledTimes(1)
    const [alert] = mockNotifyOps.mock.calls[0]
    expect(String(alert.message)).toContain('TruncatedOutputError')
  })
})
