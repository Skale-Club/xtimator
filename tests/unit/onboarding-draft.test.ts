// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({claims: {} as Record<string, unknown> | null, denied: null as null | object, from: vi.fn(), createCompany: vi.fn(), capture: vi.fn(), results: [] as Array<{data: unknown;error: unknown}>, chains: [] as Array<Record<string, ReturnType<typeof vi.fn>>>}))
vi.mock('@/lib/supabase/server', () => ({createClient: async () => ({auth: {getClaims: async () => ({data: {claims: mocks.claims}})}, from: mocks.from})}))
vi.mock('@/lib/auth/mode', () => ({ownedAuthEnabled: () => true}))
vi.mock('@/lib/demo/guard', () => ({assertWritable: async () => mocks.denied}))
vi.mock('@/lib/actions/company', () => ({createOrUpdateCompany: mocks.createCompany}))
vi.mock('@/lib/observability/capture', () => ({captureBackgroundError: () => mocks.capture}))
vi.mock('@/lib/storage/server', () => ({serverStorage: vi.fn()}))
vi.mock('@/lib/image/webp', () => ({convertImageToWebp: vi.fn()}))
vi.mock('next/headers', () => ({cookies: async () => ({get: () => ({value: 'company-created'})})}))
vi.mock('@/lib/queries/active-company', () => ({ACTIVE_COMPANY_COOKIE: 'active_company_id'}))
import { completeOnboarding, saveOnboardingDraft } from '@/lib/actions/onboarding-draft'
import { accountDefaults, draftValuesSchema, ownsDraftLogo } from '@/lib/onboarding/draft'
const user='11111111-1111-4111-8111-111111111111'
const id='22222222-2222-4222-8222-222222222222'
const payload={id,mode:'first',step:'location',values:{companyName:'Carter Services',language:'pt',city:'Greater Boston',brandPrimaryColor:'#406EF1'},clientId:'33333333-3333-4333-8333-333333333333',sequence:3}
const saved={last_activity_at:'2026-11-06T16:00:00Z',revision:1}
beforeEach(() => {
 vi.clearAllMocks();mocks.claims={sub:user,phone:'+16175550142',email:'verified@example.com',user_metadata:{full_name:'Verified Owner'}};mocks.denied=null;mocks.chains=[];mocks.results=[]
 mocks.from.mockImplementation(() => {
  const result=mocks.results.shift() ?? {data:saved,error:null}
  const chain: Record<string, ReturnType<typeof vi.fn>>={}
  for(const method of ['update','select','eq','is','or']) chain[method]=vi.fn().mockReturnValue(chain)
  chain.maybeSingle=vi.fn().mockResolvedValue(result)
  chain.then=vi.fn((resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve))
  mocks.chains.push(chain);return chain
 })
 mocks.createCompany.mockResolvedValue({error:'Please try again.'})
})
describe('durable onboarding drafts', () => {
 it('accepts incomplete answers, without requiring a finished company', () => {
  expect(draftValuesSchema.safeParse({brandPrimaryColor:'#406EF1'}).success).toBe(true)
  expect(draftValuesSchema.safeParse({...payload.values,city:'x'.repeat(121)}).success).toBe(false)
 })
 it('derives contact details solely from verified session claims', () => {
  expect(accountDefaults(mocks.claims!)).toEqual({phone:'+16175550142',email:'verified@example.com',ownerName:'Verified Owner'})
 })
 it('rejects unauthenticated or unverified phone sessions before writing', async () => {
  mocks.claims=null;expect(await saveOnboardingDraft(payload)).toHaveProperty('error');expect(mocks.from).not.toHaveBeenCalled()
  mocks.claims={sub:user,email:'google@example.com'};expect(await saveOnboardingDraft(payload)).toHaveProperty('error');expect(mocks.from).not.toHaveBeenCalled()
 })
 it('rejects demo writes and forged input ownership', async () => {
  mocks.denied={error:'Read-only'};expect(await saveOnboardingDraft(payload)).toHaveProperty('error');expect(mocks.from).not.toHaveBeenCalled()
  mocks.denied=null;expect(await saveOnboardingDraft({...payload,userId:'someone-else'})).toHaveProperty('error');expect(mocks.from).not.toHaveBeenCalled()
 })
 it('saves the current step under the authenticated account with ordered writes and a completion lock', async () => {
  expect(await saveOnboardingDraft(payload)).toEqual({savedAt:saved.last_activity_at,revision:1})
  const q=mocks.chains[0]
  expect(q.eq).toHaveBeenCalledWith('user_id',user);expect(q.eq).toHaveBeenCalledWith('id',id)
  expect(q.is).toHaveBeenCalledWith('completed_at',null)
  expect(q.or).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^and\(or\(completion_started_at.*or\(client_id/))
  expect(q.update.mock.calls[0][0].values).not.toHaveProperty('phone')
 })
 it('ignores delayed writes after completion and duplicate sequences', async () => {
  for(const current of [{...saved,completed_at:'2026-11-06T17:00:00Z'},{...saved,client_id:payload.clientId,client_sequence:5}]) {
   mocks.results=[{data:null,error:null},{data:current,error:null}]
   expect(await saveOnboardingDraft(payload)).toEqual({savedAt:saved.last_activity_at,revision:1})
  }
 })
 it('returns a retryable error on database failure', async () => {
  mocks.results=[{data:null,error:{message:'offline'}}]
  expect(await saveOnboardingDraft(payload)).toHaveProperty('error')
 })
 it('only accepts a logo belonging to this user and draft', async () => {
  const valid=`/storage/logos/${user}/onboarding/${id}/${crypto.randomUUID()}.webp`
  expect(ownsDraftLogo(valid,user,id)).toBe(true)
  expect(ownsDraftLogo(valid,'someone-else',id)).toBe(false)
  expect(ownsDraftLogo('https://external.test/logo.png',user,id)).toBe(false)
  expect(await saveOnboardingDraft({...payload,values:{...payload.values,logoUrl:'https://external.test/logo.png'}})).toHaveProperty('error')
  expect(mocks.from).not.toHaveBeenCalled()
 })
 it('does not create a company when final save fails', async () => {
  mocks.results=[{data:null,error:{message:'offline'}}]
  expect(await completeOnboarding(payload)).toHaveProperty('error');expect(mocks.createCompany).not.toHaveBeenCalled()
 })
 it('keeps an unsuccessful completion resumable and uses account contacts', async () => {
  mocks.results=[{data:saved,error:null},{data:{id},error:null},{data:null,error:null}]
  expect(await completeOnboarding({...payload,values:{...payload.values,phone:'+10000000000',email:'forged@example.com'}})).toEqual({error:'Please try again.'})
  expect(mocks.createCompany).toHaveBeenCalledWith(expect.objectContaining({phone:'+16175550142',email:'verified@example.com',city:'Greater Boston',address:'',state:'',zip:''}),{mode:'first'})
  expect(mocks.chains[2].update).toHaveBeenCalledWith({completion_started_at:null})
 })
 it('marks a successful onboarding completed before rethrowing the dashboard redirect', async () => {
  const redirect=Object.assign(new Error('redirect'),{digest:'NEXT_REDIRECT;replace;/dashboard;303;'})
  mocks.createCompany.mockRejectedValue(redirect)
  mocks.results=[{data:saved,error:null},{data:{id},error:null},{data:null,error:null}]
  await expect(completeOnboarding(payload)).rejects.toBe(redirect)
  expect(mocks.chains[2].update).toHaveBeenCalledWith({completed_at:expect.any(String),completed_company_id:'company-created'})
 })
 it('refuses double completion while another submit owns the lease', async () => {
  mocks.results=[{data:saved,error:null},{data:null,error:null}]
  expect(await completeOnboarding(payload)).toHaveProperty('error');expect(mocks.createCompany).not.toHaveBeenCalled()
 })
})
