import { describe, expect, it, vi, beforeEach } from 'vitest'

// SEED-057 C: plan_scope's spend must ride on the ONE drafting cost row
// (ai_cost_events is unique per attempt + operation), so the credit debit covers
// draft + plan (OpenRouter adapter; the only provider).
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn().mockResolvedValue('k') }))
vi.mock('@/lib/billing/record-ai-cost', () => ({ recordAICost: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/observability/langfuse', () => ({
  langfuseClient: { generation: vi.fn(() => ({ end: vi.fn() })), flushAsync: vi.fn().mockResolvedValue(undefined) },
}))

import { OpenRouterAdapter } from '@/lib/ai/providers/openrouter'
import { recordAICost } from '@/lib/billing/record-ai-cost'
import type { EstimateInput } from '@/lib/ai/types'

const ARGS = {
  suggested_project_name: 'x',
  summary: 's',
  sections: [{ title: 'T', items: [{ description: 'd', quantity: 1, unit_price: 5, price_source: 'ai_estimate' }] }],
}
const input = (extraCostUsd?: number): EstimateInput => ({
  industry: 'painting', projectName: 'p', projectType: null, targetBudget: null, clientName: null,
  clientAddress: null, transcripts: [], photoDescriptions: [], priceBookItems: [],
  costContext: { attemptId: 'att', companyId: 'co', projectId: 'pr', extraCostUsd },
})

beforeEach(() => {
  vi.mocked(recordAICost).mockClear()
})

describe('the drafting cost row carries the planning spend', () => {
  it('openrouter: realCostUsd = draft + plan, in ONE row', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { tool_calls: [{ function: { name: 'create_estimate', arguments: JSON.stringify(ARGS) } }] } }],
        usage: { cost: 0.05 },
      }),
    }))
    await new OpenRouterAdapter('m').generateEstimate(input(0.004))
    expect(recordAICost).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordAICost).mock.calls[0][0].realCostUsd).toBeCloseTo(0.054, 8)
    vi.unstubAllGlobals()
  })

  it('openrouter: no plan spend leaves the cost untouched; unknown draft cost stays null (never 0)', async () => {
    const resp = (usage?: unknown) => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { tool_calls: [{ function: { name: 'create_estimate', arguments: JSON.stringify(ARGS) } }] } }],
        ...(usage ? { usage } : {}),
      }),
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(resp({ cost: 0.05 })).mockResolvedValueOnce(resp()))
    await new OpenRouterAdapter('m').generateEstimate(input())
    expect(vi.mocked(recordAICost).mock.calls[0][0].realCostUsd).toBe(0.05)
    await new OpenRouterAdapter('m').generateEstimate(input(0.004))
    expect(vi.mocked(recordAICost).mock.calls[1][0].realCostUsd).toBeNull()
    vi.unstubAllGlobals()
  })
})
