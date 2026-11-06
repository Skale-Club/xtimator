import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftAutosave } from '@/lib/onboarding/use-draft-autosave'
import { draftValues, type OnboardingDraft } from '@/lib/onboarding/draft'
import type { OnboardingValues } from '@/lib/schemas/onboarding'
const mocks=vi.hoisted(() => ({save:vi.fn()}))
vi.mock('@/lib/actions/onboarding-draft', () => ({saveOnboardingDraft:mocks.save}))
const initial: OnboardingValues={companyName:'Carter Services',subdomain:'',ownerName:'',phone:'+16175550142',email:'verified@example.com',website:'',language:'en',industries:[],customIndustries:[],prefillPriceBook:false,brandPrimaryColor:'#406EF1',address:'',city:'',state:'',zip:'',licenseNumber:'',insuranceInfo:'',defaultTaxRate:0,defaultPaymentTerms:'Net 30',defaultWarrantyTerms:'1 year',defaultValidityDays:30}
const draft: OnboardingDraft={id:crypto.randomUUID(),mode:'first',step:'language',values:draftValues(initial),last_activity_at:new Date().toISOString(),revision:0}
beforeEach(()=>{vi.useFakeTimers();mocks.save.mockReset().mockResolvedValue({savedAt:new Date().toISOString(),revision:1})})
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks()})
describe('draft autosave',()=>{
 it('debounces typing, persists the current question, and excludes account contacts',async()=>{
  const {result,rerender}=renderHook(({name})=>useDraftAutosave(draft,{...initial,companyName:name},'companyName',true),{initialProps:{name:'C'}})
  rerender({name:'Carter'});rerender({name:'Carter Services'})
  expect(mocks.save).not.toHaveBeenCalled()
  await act(async()=>{await vi.advanceTimersByTimeAsync(600)})
  expect(mocks.save).toHaveBeenCalledOnce()
  expect(mocks.save.mock.calls[0][0]).toMatchObject({id:draft.id,step:'companyName',values:{companyName:'Carter Services'}})
  expect(mocks.save.mock.calls[0][0].values).not.toHaveProperty('phone')
  expect(result.current.status).toBe('saved')
 })
 it('shows failed sync and retries when the connection returns',async()=>{
  mocks.save.mockRejectedValueOnce(new Error('offline'))
  const {result}=renderHook(()=>useDraftAutosave(draft,initial,'industry',true))
  await act(async()=>{await vi.advanceTimersByTimeAsync(600)})
  expect(result.current.status).toBe('error')
  await act(async()=>{window.dispatchEvent(new Event('online'));await Promise.resolve()})
  expect(mocks.save).toHaveBeenCalledTimes(2);expect(result.current.status).toBe('saved')
 })
 it('flushes the latest unsent keystrokes on page close',async()=>{
  const beacon=vi.fn().mockReturnValue(true)
  Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:beacon})
  renderHook(()=>useDraftAutosave(draft,{...initial,companyName:'Last characters'},'companyName',true))
  act(()=>window.dispatchEvent(new Event('pagehide')))
  expect(beacon).toHaveBeenCalledWith('/api/onboarding/draft',expect.any(Blob))
  expect(mocks.save).not.toHaveBeenCalled()
 })
 it('waits for in-flight writes before producing a newer final payload',async()=>{
  let resolve!: (value:object)=>void
  mocks.save.mockReturnValueOnce(new Promise(r=>{resolve=r}))
  const {result}=renderHook(()=>useDraftAutosave(draft,initial,'brandColor',true))
  await act(async()=>{await vi.advanceTimersByTimeAsync(600)})
  const completing=result.current.prepareCompletion({...initial,city:'Connecticut'})
  let done=false;void completing.then(()=>{done=true})
  await act(async()=>{await Promise.resolve()});expect(done).toBe(false)
  await act(async()=>{resolve({savedAt:new Date().toISOString(),revision:1});await completing})
  const payload=await completing
  expect(payload.sequence).toBeGreaterThan(mocks.save.mock.calls[0][0].sequence)
  expect(payload.values.city).toBe('Connecticut')
 })
})
