import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * AIREL-01 — bound the primary OpenRouter generation fetch with an
 * AbortSignal timeout.
 *
 * Before this fix, `lib/ai/providers/openrouter.ts`'s `callTool` fetch had no
 * signal at all: a hung socket never threw, so `callWithFallback` never ran
 * the Gemini fallback and the Inngest step stayed pinned indefinitely (audit
 * v4.19 § C1). Pins two things:
 *   1. The chat/completions fetch carries an AbortSignal built from the
 *      shared, exported `AI_CHAT_TIMEOUT_MS` constant (single source of truth
 *      with openrouter-client.ts — no duplicated number).
 *   2. An aborted/timed-out fetch propagates as a normal thrown error, so
 *      `callWithFallback` runs the fallback provider exactly once (today's
 *      behavior, now actually reachable).
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
import { callWithFallback } from '@/lib/ai/with-fallback'
import { AI_CHAT_TIMEOUT_MS } from '@/lib/ai/openrouter-client'
import type { EstimateInput, EstimateOutput } from '@/lib/ai/types'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>

const MODEL = 'anthropic/claude-sonnet-4-5'

const TOOL_ARGS = JSON.stringify({
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

function makeResponse() {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [{ function: { name: 'create_estimate', arguments: TOOL_ARGS } }],
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

describe('OpenRouterAdapter.callTool — request timeout (AIREL-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKey.mockResolvedValue('or-key')
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('passes an AbortSignal built from AI_CHAT_TIMEOUT_MS to the chat/completions fetch', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeResponse())

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    // Sanity: the exported constant is the documented 120s chat budget — this
    // guards against a future accidental duplication of the number.
    expect(AI_CHAT_TIMEOUT_MS).toBe(120_000)
  })

  it('an aborted fetch propagates so callWithFallback runs the Gemini fallback exactly once', async () => {
    const abortError = new DOMException('This operation was aborted', 'AbortError')
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError)

    const fallbackResult: EstimateOutput = {
      suggested_project_name: 'From Gemini',
      suggested_client_name: null,
      summary: 'served by fallback',
      sections: [],
    }
    const fallback = vi.fn().mockResolvedValue(fallbackResult)
    const primary = () => new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    const outcome = await callWithFallback({ op: 'generate_estimate', primary, fallback })

    expect(outcome.servedBy).toBe('fallback')
    expect(outcome.fallbackFired).toBe(true)
    expect(fallback).toHaveBeenCalledTimes(1)
  })
})
