import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * recordClientResponse (lib/actions/estimate-response.ts): the owner records
 * the client's answer in-app. Guards: auth, membership (company-scoped read),
 * is_current, signature present -> refused. Happy path writes client_response
 * + responded_at, never touches updated_at, logs activity {source:'manual'}.
 */

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...a: unknown[]) => getActiveCompanyId(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: vi.fn().mockResolvedValue(null) }))
const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
  assertCompanyWritable: (...a: unknown[]) => assertCompanyWritable(...a),
}))

let claims: { sub: string } | null = { sub: 'u_1' }
let estimateRow: Record<string, unknown> | null
let signatureRow: Record<string, unknown> | null
let estimateUpdate: Record<string, unknown> | null
const activityInsert = vi.fn()
const projectUpdate = vi.fn()
const estimateSelectEqs: Array<[string, unknown]> = []

function from(table: string) {
  if (table === 'estimates') {
    return {
      select: () => {
        const q: Record<string, unknown> = {}
        q.eq = (c: string, v: unknown) => {
          estimateSelectEqs.push([c, v])
          return q
        }
        q.single = () => Promise.resolve({ data: estimateRow, error: null })
        return q
      },
      update: (payload: Record<string, unknown>) => {
        estimateUpdate = payload
        const q: Record<string, unknown> = {}
        q.eq = () => q
        q.select = () => Promise.resolve({ data: [{ id: 'est_1', updated_at: '2026-11-06T12:00:00Z' }], error: null })
        return q
      },
    }
  }
  if (table === 'estimate_signatures') {
    return {
      select: () => ({
        eq: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: signatureRow, error: null }) }) }),
      }),
    }
  }
  if (table === 'projects') {
    return { update: (p: unknown) => { projectUpdate(p); return { eq: () => Promise.resolve({ error: null }) } } }
  }
  if (table === 'estimate_activity') {
    return { insert: (p: unknown) => { activityInsert(p); return Promise.resolve({ error: null }) } }
  }
  throw new Error(`Unexpected table ${table}`)
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getClaims: () => Promise.resolve({ data: { claims } }) },
    from,
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  claims = { sub: 'u_1' }
  getActiveCompanyId.mockResolvedValue('co_1')
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  estimateRow = { id: 'est_1', project_id: 'p_1', company_id: 'co_1', is_current: true, sent_at: null, client_response: null }
  signatureRow = null
  estimateUpdate = null
  estimateSelectEqs.length = 0
})

async function run(r: 'accepted' | 'declined' | null) {
  const { recordClientResponse } = await import('@/lib/actions/estimate-response')
  return recordClientResponse('est_1', r)
}

describe('recordClientResponse', () => {
  it('refuses when unauthenticated', async () => {
    claims = null
    const res = await run('accepted')
    expect(res).toEqual({ success: false, error: 'Not authenticated' })
    expect(estimateUpdate).toBeNull()
  })

  it('refuses a demo/read-only tenant', async () => {
    assertWritable.mockResolvedValue({ error: 'read-only demo' })
    const res = await run('accepted')
    expect(res.success).toBe(false)
    expect(estimateUpdate).toBeNull()
  })

  it('refuses a non-member: estimate not visible in the active company', async () => {
    estimateRow = null
    const res = await run('accepted')
    expect(res).toEqual({ success: false, error: 'Estimate not found' })
    expect(estimateSelectEqs).toContainEqual(['company_id', 'co_1'])
    expect(estimateUpdate).toBeNull()
  })

  it('refuses a non-current version', async () => {
    estimateRow = { ...estimateRow!, is_current: false }
    const res = await run('accepted')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/current version/)
    expect(estimateUpdate).toBeNull()
  })

  it('refuses when a signature row exists (accept, decline and clear)', async () => {
    signatureRow = { id: 'sig_1' }
    for (const r of ['accepted', 'declined', null] as const) {
      const res = await run(r)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/signed online/)
    }
    expect(estimateUpdate).toBeNull()
    expect(activityInsert).not.toHaveBeenCalled()
  })

  it('happy path: writes client_response/responded_at (not updated_at), project status and manual activity', async () => {
    const res = await run('accepted')
    expect(res.success).toBe(true)
    expect(res.data?.updated_at).toBe('2026-11-06T12:00:00Z')
    expect(estimateUpdate).toMatchObject({ client_response: 'accepted' })
    expect(typeof estimateUpdate!.responded_at).toBe('string')
    expect(estimateUpdate).not.toHaveProperty('updated_at')
    expect(projectUpdate).toHaveBeenCalledWith({ status: 'accepted' })
    expect(activityInsert).toHaveBeenCalledWith(
      expect.objectContaining({ estimate_id: 'est_1', event_type: 'estimate_accepted', metadata: { source: 'manual' } })
    )
  })

  it('records declined with estimate_declined', async () => {
    await run('declined')
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'estimate_declined' }))
  })

  it('null clears client_response and responded_at and reverts project status', async () => {
    estimateRow = { ...estimateRow!, client_response: 'accepted', sent_at: '2026-11-01T00:00:00Z' }
    const res = await run(null)
    expect(res.success).toBe(true)
    expect(estimateUpdate).toEqual({ client_response: null, responded_at: null })
    expect(projectUpdate).toHaveBeenCalledWith({ status: 'sent' })
    expect(activityInsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: { source: 'manual' } }))
  })
})
