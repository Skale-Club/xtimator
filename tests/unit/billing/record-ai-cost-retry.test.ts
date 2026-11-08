import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 1.5 — a repeat 'estimate' cost for the same attempt (schema-repair retry,
 * auto-refine pass, Inngest retry) collides with the partial unique index
 * (23505). recordAICost keeps it as 'estimate_retry'; when the migration that
 * widens the CHECK is not applied yet (23514) it warns and gives up. Never throws.
 */

const inserts: Array<Record<string, unknown>> = []
let results: Array<{ error: { code: string } | null }> = []
let throwOnInsert = false

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row)
        if (throwOnInsert) throw new Error('network down')
        return results.shift() ?? { error: null }
      },
    }),
  }),
}))

import { recordAICost } from '@/lib/billing/record-ai-cost'

const ev = {
  attemptId: 'att-1',
  operationType: 'estimate' as const,
  provider: 'openrouter' as const,
  realCostUsd: 0.04,
  companyId: 'co-1',
}

describe('recordAICost — estimate retry rows', () => {
  beforeEach(() => {
    inserts.length = 0
    results = []
    throwOnInsert = false
    vi.restoreAllMocks()
  })

  it('re-inserts a 23505 estimate row as estimate_retry with the same data', async () => {
    results = [{ error: { code: '23505' } }, { error: null }]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await recordAICost(ev)
    expect(inserts).toHaveLength(2)
    expect(inserts[0].operation_type).toBe('estimate')
    expect(inserts[1]).toMatchObject({
      operation_type: 'estimate_retry',
      attempt_id: 'att-1',
      real_cost_usd: 0.04,
      company_id: 'co-1',
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns and gives up when estimate_retry hits the CHECK (migration not applied)', async () => {
    results = [{ error: { code: '23505' } }, { error: { code: '23514' } }]
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordAICost(ev)).resolves.toBeUndefined()
    expect(inserts).toHaveLength(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 23505 on audio_minutes (the dedup guard doing its job)', async () => {
    results = [{ error: { code: '23505' } }]
    await recordAICost({ ...ev, operationType: 'audio_minutes' })
    expect(inserts).toHaveLength(1)
  })

  it('never throws, even when the client throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    throwOnInsert = true
    await expect(recordAICost(ev)).resolves.toBeUndefined()
  })
})
