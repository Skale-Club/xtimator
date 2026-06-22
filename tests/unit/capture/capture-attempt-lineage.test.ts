import { describe, it, expect, vi, beforeEach } from 'vitest'

// Imports the real /api/generate-estimate route + its Inngest events tree at
// runtime; under vitest's reused forked worker the import can exceed the 5s
// default (import latency under contention, not a mock leak). Per-file timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * REC-03 + REC-04: attempt lineage + idempotency-key stability across Retry.
 *
 * The capture session mints an `attemptId` (lineage) and a `requestId`
 * (generate-estimate idempotency key) ONCE on first Generate and reuses both on
 * Retry. The generate-estimate dispatch derives its Inngest event id from the
 * requestId via the pure helper `buildGenerateEventId(projectId, requestId)`, so
 * re-dispatching with the same requestId yields the SAME event id — Inngest then
 * dedups the re-dispatch and an already-completed generate step is NOT re-charged.
 *
 * RED until Tasks 2-3 land: the route does not yet accept a client-supplied
 * requestId, and `buildGenerateEventId` does not yet exist.
 */

// --- inngest.send capture ---------------------------------------------------
const sendMock = vi.fn(async (args: { id?: string }) => ({
  ids: [`${args.id ?? 'job'}`],
}))

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (args: unknown) => sendMock(args as { id?: string }) },
}))

// Supabase server client — authenticated user + company + passing quota.
const getClaimsMock = vi.fn(async () => ({
  data: { claims: { sub: 'user-1' } },
}))
function makeSupabase() {
  return {
    auth: { getClaims: getClaimsMock },
    from: (table: string) => {
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'company-1' } }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeSupabase(),
}))

// The route now resolves the company via getActiveCompanyId() (cookie-based,
// calls cookies()); mock it so the route doesn't call cookies() outside a
// request scope (otherwise it throws → 500 instead of 202).
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: async () => 'company-1',
}))

// Rate limit + quota always pass in this suite.
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: async () => ({ allowed: true, count: 0, max: 100 }),
}))
vi.mock('@/lib/quota', () => ({
  checkQuota: async () => ({ allowed: true }),
}))

describe('REC-03/REC-04: attempt lineage + stable generate event id on Retry', () => {
  beforeEach(() => {
    sendMock.mockClear()
  })

  it('buildGenerateEventId yields a stable event id for the same projectId + requestId', async () => {
    const { buildGenerateEventId } = await import('@/app/api/generate-estimate/route')
    const projectId = 'proj-1'
    const requestId = 'req-abc'
    const first = buildGenerateEventId(projectId, requestId)
    const second = buildGenerateEventId(projectId, requestId)
    expect(first).toBe(`estimate-${projectId}-${requestId}`)
    expect(second).toBe(first) // stable across Retry — same key, no re-charge
  })

  it('reuses a client-supplied requestId/attemptId instead of minting fresh ones', async () => {
    const { POST } = await import('@/app/api/generate-estimate/route')
    const projectId = 'proj-1'
    const suppliedRequestId = 'req-from-client'
    const suppliedAttemptId = 'attempt-from-client'

    const request = new Request('http://localhost/api/generate-estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        requestId: suppliedRequestId,
        attemptId: suppliedAttemptId,
      }),
    })

    const res = await POST(request)
    expect(res.status).toBe(202)

    expect(sendMock).toHaveBeenCalledTimes(1)
    const sentArgs = sendMock.mock.calls[0][0] as {
      id: string
      data: { requestId: string; attemptId?: string }
    }
    // The route honored the client requestId — did NOT mint a new one.
    expect(sentArgs.id).toBe(`estimate-${projectId}-${suppliedRequestId}`)
    expect(sentArgs.data.requestId).toBe(suppliedRequestId)
    expect(sentArgs.data.attemptId).toBe(suppliedAttemptId)
  })
})
