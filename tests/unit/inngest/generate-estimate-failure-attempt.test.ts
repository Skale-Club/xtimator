import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

// onFailure must record the failure on the attempt the run actually used.
const state = {
  rows: [] as { attempt_id: string }[],
  throwOnQuery: false,
  calls: [] as Array<[string, ...unknown[]]>,
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => {
    if (state.throwOnQuery) throw new Error('db down')
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'order']) {
      chain[m] = (...args: unknown[]) => {
        state.calls.push([m, ...args])
        return chain
      }
    }
    chain.limit = () => Promise.resolve({ data: state.rows, error: null })
    return { from: () => chain }
  }),
}))

vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: vi.fn() }))
vi.mock('@/lib/estimate/adapters/default', () => ({ makeDefaultAdapter: vi.fn() }))
vi.mock('@/lib/estimate/graph', () => ({ buildEstimateGraph: vi.fn() }))
vi.mock('@/lib/quota', () => ({ recordUsage: vi.fn(), notifyQuotaThresholds: vi.fn() }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn() }))
vi.mock('@/lib/notifications/copy', () => ({ buildNotificationCopy: vi.fn() }))
vi.mock('@/lib/observability/pipeline-events', () => ({ recordPipelineEvent: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { createFunction: vi.fn((opts: unknown, handler: unknown) => ({ opts, handler })) },
}))

import { resolveFailureAttemptId } from '@/lib/inngest/functions/generate-estimate'

const base = { companyId: 'company-1', projectId: 'project-1' }

describe('resolveFailureAttemptId', () => {
  beforeEach(() => {
    state.rows = []
    state.throwOnQuery = false
    state.calls = []
  })

  it('uses the producer attemptId when present (no lookup)', async () => {
    expect(await resolveFailureAttemptId({ ...base, attemptId: 'att-1' })).toBe('att-1')
    expect(state.calls).toHaveLength(0)
  })

  it('reads the attempt from the started pipeline_events row when the producer omitted it', async () => {
    state.rows = [{ attempt_id: 'att-from-db' }]
    const id = await resolveFailureAttemptId(base, Date.UTC(2026, 10, 8))
    expect(id).toBe('att-from-db')
    expect(state.calls).toContainEqual(['eq', 'step', 'generate_estimate'])
    expect(state.calls).toContainEqual(['eq', 'status', 'started'])
    expect(state.calls).toContainEqual(['gte', 'created_at', '2026-11-08T00:00:00.000Z'])
  })

  it('falls back to a random uuid when no row exists or the lookup throws', async () => {
    const uuid = /^[0-9a-f-]{36}$/
    expect(await resolveFailureAttemptId(base)).toMatch(uuid)
    state.throwOnQuery = true
    expect(await resolveFailureAttemptId(base)).toMatch(uuid)
  })
})
