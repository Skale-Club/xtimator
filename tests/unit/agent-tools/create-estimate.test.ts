import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NEUT-01 (RED scaffold) — neutral createEstimate.
 *
 * lib/agent-tools/create-estimate.ts mirrors the dispatch body of
 * handleCreateEstimate (lib/mcp/tools/write.ts), parameterized: it sends
 * EVENT_ESTIMATE_GENERATE with { companyId, projectId, requestId, prompts?,
 * language? } and returns { jobId: ids[0] }.
 *
 * T-lrf-01: companyId is a TRUSTED closure/arg field — NEVER an LLM tool-input.
 * The dispatched data.companyId equals exactly the passed companyId; no tenant
 * is ever sourced from elsewhere.
 *
 * RED by missing module (`@/lib/agent-tools/create-estimate` does not exist
 * until Plan 122-02). Module-not-found is the correct RED state.
 */

const mockSend = vi.fn()
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockSend(...args) },
}))

import { createEstimate } from '@/lib/agent-tools/create-estimate'
import { EVENT_ESTIMATE_GENERATE } from '@/lib/inngest/events'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createEstimate — EVENT_ESTIMATE_GENERATE dispatch (NEUT-01)', () => {
  it('Test 1: dispatches the event once with the parameterized payload + returns { jobId }', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_123'] })

    const out = await createEstimate({
      companyId: 'co-1',
      projectId: 'proj-1',
      prompts: ['paint the deck'],
      language: 'en',
    })

    expect(mockSend).toHaveBeenCalledTimes(1)
    const arg = mockSend.mock.calls[0][0] as { name: string; data: Record<string, unknown> }
    expect(arg.name).toBe(EVENT_ESTIMATE_GENERATE)
    expect(arg.data.companyId).toBe('co-1')
    expect(arg.data.projectId).toBe('proj-1')
    expect(arg.data.prompts).toEqual(['paint the deck'])
    expect(arg.data.language).toBe('en')
    expect(typeof arg.data.requestId).toBe('string')
    expect((arg.data.requestId as string).length).toBeGreaterThan(0)
    expect(out).toEqual({ jobId: 'evt_123' })
  })

  it('Test 2 (T-lrf-01): data.companyId equals the passed companyId — never an LLM field', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_xyz'] })

    await createEstimate({ companyId: 'trusted-co', projectId: 'proj-9' })

    const arg = mockSend.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.companyId).toBe('trusted-co')
    // No tenant sourced from anywhere but the trusted param: there is no snake_case
    // company_id key, and companyId is exactly what was passed in.
    expect(arg.data).not.toHaveProperty('company_id')
  })

  it('Test 3: rejects when inngest.send returns no event id', async () => {
    mockSend.mockResolvedValue({ ids: [] })
    await expect(
      createEstimate({ companyId: 'co-1', projectId: 'proj-1' })
    ).rejects.toThrow()
  })
})
