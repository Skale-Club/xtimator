import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Phase 110 (COST-01) — OpenRouter estimate-adapter cost capture.
 *
 * Pins the cost-capture behavior of `OpenRouterAdapter.generateEstimate`:
 *   1. A response carrying `usage.cost` → `recordAICost` called with that USD
 *      value, operationType 'estimate', provider 'openrouter', the model id.
 *   2. A response with NO `usage.cost` → `recordAICost` called with `realCostUsd: null`
 *      (NEVER 0).
 *   3. The request body sent to fetch asks for inline usage accounting via
 *      `usage: { include: true }` (OpenRouter's documented way to get the real
 *      cost back in the SAME response) and makes NO second fetch to the
 *      deprecated `/api/v1/generation` endpoint.
 *   4. companyId/attemptId in the recorded cost come from the injected `costContext`,
 *      never from the parsed tool-call arguments.
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

import { OpenRouterAdapter } from '@/lib/ai/providers/openrouter'
import { getIntegrationKey } from '@/lib/platform-config'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import type { EstimateInput } from '@/lib/ai/types'

const mockGetKey = getIntegrationKey as ReturnType<typeof vi.fn>
const mockRecord = recordAICost as ReturnType<typeof vi.fn>

const MODEL = 'anthropic/claude-sonnet-4-5'

// A valid create_estimate tool-call argument payload (so normalizeOutput passes
// and callTool returns rather than throwing). The `suggested_client_name` here is
// the LLM-derived field — it must NEVER feed companyId/attemptId.
const TOOL_ARGS = JSON.stringify({
  suggested_project_name: 'Smith Bathroom Remodel',
  suggested_client_name: 'LLM-DERIVED-CLIENT-NAME',
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

function makeResponse(usage: Record<string, unknown> | undefined) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: 'create_estimate', arguments: TOOL_ARGS } },
            ],
          },
        },
      ],
      ...(usage ? { usage } : {}),
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
    costContext: {
      attemptId: 'attempt-123',
      companyId: 'company-abc',
      projectId: 'project-xyz',
    },
  }
}

describe('OpenRouterAdapter cost capture (COST-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKey.mockResolvedValue('or-key')
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('captures usage.cost and records it as realCostUsd', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ prompt_tokens: 100, completion_tokens: 50, cost: 0.0123 })
    )

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    expect(mockRecord).toHaveBeenCalledTimes(1)
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'estimate',
        provider: 'openrouter',
        model: MODEL,
        realCostUsd: 0.0123,
      })
    )
  })

  it('records realCostUsd null (NOT 0) when usage.cost is absent', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ prompt_tokens: 100, completion_tokens: 50 })
    )

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    expect(mockRecord).toHaveBeenCalledTimes(1)
    const arg = mockRecord.mock.calls[0][0]
    expect(arg.realCostUsd).toBeNull()
    expect(arg.realCostUsd).not.toBe(0)
  })

  it('records realCostUsd null when usage is entirely absent', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse(undefined)
    )

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    expect(mockRecord.mock.calls[0][0].realCostUsd).toBeNull()
  })

  it('requests inline usage accounting (usage.include) and makes no /api/v1/generation call', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue(
      makeResponse({ cost: 0.01 })
    )

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    // Exactly one call — cost comes back INLINE via usage accounting, never
    // from a second round-trip to the deprecated generation endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain('/api/v1/generation')
    const sentBody = JSON.parse((init as { body: string }).body)
    expect(sentBody.usage).toEqual({ include: true })
  })

  it('correlates companyId/attemptId from costContext, never from parsed tool output', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ cost: 0.02 })
    )

    await new OpenRouterAdapter(MODEL).generateEstimate(makeInput())

    const arg = mockRecord.mock.calls[0][0]
    expect(arg.attemptId).toBe('attempt-123')
    expect(arg.companyId).toBe('company-abc')
    expect(arg.projectId).toBe('project-xyz')
    // Defensive: the LLM-derived client name must never leak into correlation ids.
    expect(arg.companyId).not.toBe('LLM-DERIVED-CLIENT-NAME')
    expect(arg.attemptId).not.toBe('LLM-DERIVED-CLIENT-NAME')
  })
})
