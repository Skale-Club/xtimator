import { beforeEach, describe, expect, it, vi } from 'vitest'
const activeCompany = vi.fn()
const writable = vi.fn()
const companyWritable = vi.fn()
const billing = vi.fn()
const rpc = vi.fn()
const history = { recordAcceptedEstimatePrices: vi.fn(), forgetEstimatePrices: vi.fn() }
let claims: object | null
let row: Record<string, unknown> | null
const filters: Array<[string, unknown]> = []
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: (...a: unknown[]) => activeCompany(...a) }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: (...a: unknown[]) => writable(...a), assertCompanyWritable: (...a: unknown[]) => companyWritable(...a) }))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: (...a: unknown[]) => billing(...a) }))
vi.mock('@/lib/estimate/pricing/company-history', () => ({ recordAcceptedEstimatePrices: (...a: unknown[]) => history.recordAcceptedEstimatePrices(...a), forgetEstimatePrices: (...a: unknown[]) => history.forgetEstimatePrices(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims } }) }, rpc,
  from: (table: string) => {
    expect(table).toBe('estimates')
    const q = { select: () => q, eq: (k: string, v: unknown) => { filters.push([k,v]); return q }, single: async () => ({ data: row }) }
    return q
  },
}) }))
import { recordClientResponse } from '@/lib/actions/estimate-response'
beforeEach(() => {
  vi.clearAllMocks()
  filters.length = 0
  claims = { sub: 'u1' }
  row = { id: 'e1', project_id: 'p1', company_id: 'c1', is_current: true, updated_at: 'version' }
  activeCompany.mockResolvedValue('c1'); writable.mockResolvedValue(null); companyWritable.mockResolvedValue(null); billing.mockResolvedValue(null)
  rpc.mockImplementation(async (_name, args) => ({ data: { client_response: args.p_response, responded_at: args.p_response ? 'server-time' : null, updated_at: 'committed-version' }, error: null }))
})
describe('manual estimate response transaction', () => {
  it('refuses unauthenticated callers', async () => {
    claims = null
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each(['accepted','declined',null] as const)('records %s through the atomic RPC without browser-side evidence prechecks or partial writes', async (response) => {
    const result = await recordClientResponse('e1',response)
    expect(result).toEqual({ success: true, data: { client_response: response, responded_at: response ? 'server-time' : null, updated_at: 'committed-version' } })
    expect(filters).toContainEqual(['company_id','c1'])
    expect(rpc).toHaveBeenCalledWith('record_estimate_response_atomic',{ p_estimate_id:'e1',p_company_id:'c1',p_expected_updated_at:'version',p_response:response })
  })
  it('does not skip the locked evidence check when the apparent response is unchanged', async () => {
    row = { ...row, client_response: 'accepted' }
    rpc.mockResolvedValue({ error: { code:'P0022' } })
    expect(await recordClientResponse('e1','accepted')).toMatchObject({ success: false, error: expect.stringMatching(/signed online/) })
  })
  it.each(['P0002','P0003','P0022','XX000'])('fails closed on transaction error %s', async (code) => {
    rpc.mockResolvedValue({ error: { code } })
    expect((await recordClientResponse('e1',null)).success).toBe(false)
    expect(history.forgetEstimatePrices).not.toHaveBeenCalled()
  })
  it('fails closed on missing transaction result', async () => {
    rpc.mockResolvedValue({ data:null,error:null })
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
  })
  it('rejects a superseded estimate before the transaction', async () => {
    row = { ...row, is_current:false }
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refuses missing or inaccessible estimates', async () => {
    row = null
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves demo and billing edit gates', async () => {
    writable.mockResolvedValue({error:'Read only'})
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
    writable.mockResolvedValue(null); billing.mockResolvedValue({error:'Read only'})
    expect((await recordClientResponse('e1','accepted')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects invalid responses', async () => {
    expect((await recordClientResponse('e1','other' as never)).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
