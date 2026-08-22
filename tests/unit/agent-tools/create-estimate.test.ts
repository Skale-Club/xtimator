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

// Billing v2: createEstimate now runs the credit gate before dispatch — stub it
// permissive here (gate behavior has its own tests) + a bare service client.
const mockCheckCredits = vi.fn()
vi.mock('@/lib/billing/credit-ledger', () => ({
  checkCredits: (...args: unknown[]) => mockCheckCredits(...args),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({}),
}))

import { createEstimate, INSUFFICIENT_CREDITS_MESSAGE } from '@/lib/agent-tools/create-estimate'
import { EVENT_ESTIMATE_GENERATE } from '@/lib/inngest/events'

beforeEach(() => {
  vi.clearAllMocks()
  mockCheckCredits.mockResolvedValue({ allowed: true, balance: 1000, shortfall: 0 })
})

describe('createEstimate — EVENT_ESTIMATE_GENERATE dispatch (NEUT-01)', () => {
  it('Test 1: dispatches the event once with the parameterized payload + returns { jobId }', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_123'] })

    const out = await createEstimate({
      companyId: 'co-1',
      projectId: 'proj-1',
      prompts: ['paint the deck'],
      language: 'en',
      channel: 'mcp',
    })

    expect(mockSend).toHaveBeenCalledTimes(1)
    const arg = mockSend.mock.calls[0][0] as { name: string; id: string; data: Record<string, unknown> }
    expect(arg.name).toBe(EVENT_ESTIMATE_GENERATE)
    // Idempotency id folds the channel in before the projectId (channel-namespaced).
    expect(arg.id).toMatch(/^estimate-mcp-proj-1-/)
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

  it('namespaces the idempotency id by channel for the web path', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_web'] })
    await createEstimate({ companyId: 'co-1', projectId: 'proj-1', channel: 'web' })
    const arg = mockSend.mock.calls[0][0] as { id: string }
    expect(arg.id).toMatch(/^estimate-web-proj-1-/)
  })

  it('omits the channel segment when no channel is passed', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_none'] })
    await createEstimate({ companyId: 'co-1', projectId: 'proj-1' })
    const arg = mockSend.mock.calls[0][0] as { id: string }
    expect(arg.id).toMatch(/^estimate-proj-1-/)
    expect(arg.id).not.toMatch(/^estimate-(web|mcp)-/)
  })

  it('Test 3: rejects when inngest.send returns no event id', async () => {
    mockSend.mockResolvedValue({ ids: [] })
    await expect(
      createEstimate({ companyId: 'co-1', projectId: 'proj-1' })
    ).rejects.toThrow()
  })

  // 260821 (billing double-debit fix): the producer mints a stable UUID
  // attemptId so it is never absent downstream — without this, the
  // generate-estimate job's `data.attemptId ?? randomUUID()` fallback used to
  // re-mint a FRESH id on every Inngest replay leg (outside its memoized
  // step), silently breaking the record-credit-debit read-back on retry.
  it('260821: dispatches a UUID attemptId in the payload', async () => {
    mockSend.mockResolvedValue({ ids: ['evt_attempt'] })

    await createEstimate({ companyId: 'co-1', projectId: 'proj-1' })

    const arg = mockSend.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(typeof arg.data.attemptId).toBe('string')
    expect(arg.data.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    // Distinct from requestId — two independently-purposed UUIDs.
    expect(arg.data.attemptId).not.toBe(arg.data.requestId)
  })

  // Billing v2: the credit wall — a blocked balance rejects BEFORE any dispatch.
  it('Test 4: throws INSUFFICIENT_CREDITS_MESSAGE and dispatches NOTHING when the gate blocks', async () => {
    mockCheckCredits.mockResolvedValue({ allowed: false, balance: 0, shortfall: 1 })
    await expect(
      createEstimate({ companyId: 'co-1', projectId: 'proj-1' })
    ).rejects.toThrow(INSUFFICIENT_CREDITS_MESSAGE)
    expect(mockSend).not.toHaveBeenCalled()
  })
})
