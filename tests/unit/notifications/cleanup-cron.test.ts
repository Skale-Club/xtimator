import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Phase 77 plan 06 — Notification cleanup cron tests (NOTIF-10 + NOTIF-12).
 *
 * The function deletes notifications where:
 *   - created_at < now() - 60 days
 *   - AND pinned = false
 *   - AND (expires_at IS NULL OR expires_at < now())
 *
 * The actual Inngest scheduled function wraps a pure helper `runCleanup`
 * that takes a service client — exported so tests can drive it without
 * standing up the Inngest test harness.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))

import { runNotificationCleanup } from '@/lib/inngest/functions/notification-cleanup'

function makeDeleteChain(resp: { data: unknown[] | null; error: { message: string } | null }) {
  const chain: Record<string, unknown> = {}
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.or = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockResolvedValue(resp)
  return chain
}

function makeSvc(chain: ReturnType<typeof makeDeleteChain>) {
  const deleteFn = vi.fn().mockReturnValue(chain)
  return {
    from: vi.fn().mockReturnValue({ delete: deleteFn }),
    __delete: deleteFn,
    __chain: chain,
  }
}

describe('runNotificationCleanup (NOTIF-10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes rows matching age + pinned + expires_at predicates', async () => {
    const chain = makeDeleteChain({ data: [{ id: '1' }, { id: '2' }], error: null })
    const svc = makeSvc(chain)

    const result = await runNotificationCleanup(svc as never)

    expect(svc.from).toHaveBeenCalledWith('notifications')
    expect(svc.__delete).toHaveBeenCalled()
    // 60-day cutoff applied
    expect(chain.lt).toHaveBeenCalledWith('created_at', expect.any(String))
    const cutoffArg = (chain.lt as ReturnType<typeof vi.fn>).mock.calls[0]![1]
    const cutoff = new Date(cutoffArg as string).getTime()
    const expected = Date.now() - 60 * 24 * 60 * 60 * 1000
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000) // within 5s drift

    // Pinned rows must be excluded
    expect(chain.eq).toHaveBeenCalledWith('pinned', false)

    // expires_at: null OR less than now
    expect(chain.or).toHaveBeenCalled()
    const orArg = (chain.or as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(orArg).toContain('expires_at.is.null')
    expect(orArg).toContain('expires_at.lt.')

    expect(result).toEqual({ deleted: 2 })
  })

  it('returns {deleted: 0} when no rows match', async () => {
    const chain = makeDeleteChain({ data: [], error: null })
    const svc = makeSvc(chain)
    const result = await runNotificationCleanup(svc as never)
    expect(result.deleted).toBe(0)
  })

  it('returns error info + deleted:0 when delete fails (best-effort, no throw)', async () => {
    const chain = makeDeleteChain({ data: null, error: { message: 'permission denied' } })
    const svc = makeSvc(chain)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runNotificationCleanup(svc as never)
    expect(result.deleted).toBe(0)
    expect(result.error).toBe('permission denied')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('passes a stable ISO cutoff that is exactly 60 days before now (±1s)', async () => {
    const chain = makeDeleteChain({ data: [], error: null })
    const svc = makeSvc(chain)
    const before = Date.now()
    await runNotificationCleanup(svc as never)
    const after = Date.now()
    const cutoffArg = (chain.lt as ReturnType<typeof vi.fn>).mock.calls[0]![1]
    const cutoffMs = new Date(cutoffArg as string).getTime()
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 60 * 24 * 60 * 60 * 1000 - 1000)
    expect(cutoffMs).toBeLessThanOrEqual(after - 60 * 24 * 60 * 60 * 1000 + 1000)
  })
})
