import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingSurvey } from '@/components/onboarding/onboarding-survey'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { draftValuesSchema, type OnboardingDraft } from '@/lib/onboarding/draft'
const mocks=vi.hoisted(()=>({upload:vi.fn(),save:vi.fn(),complete:vi.fn(),toast:vi.fn()}))
vi.mock('@/lib/actions/onboarding-draft',()=>({uploadOnboardingDraftLogo:mocks.upload,saveOnboardingDraft:mocks.save,completeOnboarding:mocks.complete}))
vi.mock('sonner',()=>({toast:{error:mocks.toast}}))
const draft: OnboardingDraft={id:'22222222-2222-4222-8222-222222222222',mode:'first',step:'logo',values:draftValuesSchema.parse({companyName:'Carter Services',brandPrimaryColor:'#406EF1'}),last_activity_at:'2026-11-06T18:00:00Z',revision:1}
const uploaded='/storage/logos/11111111-1111-4111-8111-111111111111/onboarding/'+draft.id+'/33333333-3333-4333-8333-333333333333.webp'
function renderSurvey(){const view=render(<LanguageProvider><OnboardingSurvey appName="Xtimator" logoUrl={null} draft={draft}/></LanguageProvider>);return {...view,input:view.container.querySelector('input[type="file"]')!}}
const logo=()=>new File(['image-data'],'logo.png',{type:'image/png'})
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:logo-preview')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()});mocks.save.mockResolvedValue({savedAt:new Date().toISOString(),revision:2});mocks.complete.mockResolvedValue({error:'Expected test stop'})})
afterEach(()=>{cleanup();localStorage.clear()})
describe('onboarding logo preview and confirmation',()=>{
 it('shows the chosen image immediately, reports upload progress/success, and confirms from the final button',async()=>{
  let finish!: (value:object)=>void
  mocks.upload.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
  const {input}=renderSurvey()
  fireEvent.change(input,{target:{files:[logo()]}})
  expect(screen.getByRole('img',{name:'Logo preview'}).getAttribute('src')).toBe('blob:logo-preview')
  expect(screen.getByText('Uploading logo...')).toBeTruthy()
  expect((screen.getByRole('button',{name:'Confirm logo and start'}) as HTMLButtonElement).disabled).toBe(true)
  expect(mocks.complete).not.toHaveBeenCalled()
  await act(async()=>finish({url:uploaded}))
  await waitFor(()=>expect(screen.getByText('Logo uploaded')).toBeTruthy())
  expect(screen.getByRole('img',{name:'Logo preview'}).getAttribute('src')).toBe(uploaded)
  expect((screen.getByRole('button',{name:'Confirm logo and start'}) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Confirm logo and start'}))
  await waitFor(()=>expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({step:'logo',values:expect.objectContaining({logoUrl:uploaded})})))
 })
 it('keeps the image visible after a failed upload and allows retrying',async()=>{
  mocks.upload.mockResolvedValueOnce({error:'Could not save your logo. Please try again.'}).mockResolvedValueOnce({url:uploaded})
  const {input}=renderSurvey();fireEvent.change(input,{target:{files:[logo()]}})
  await waitFor(()=>expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy())
  expect(screen.getByRole('img',{name:'Logo preview'})).toBeTruthy()
  expect(mocks.complete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Retry'}))
  await waitFor(()=>expect(screen.getByText('Logo uploaded')).toBeTruthy())
  expect(mocks.upload).toHaveBeenCalledTimes(2)
 })
 it('removes the selected logo and can finish without a logo',async()=>{
  mocks.upload.mockResolvedValue({url:uploaded})
  const {input}=renderSurvey();fireEvent.change(input,{target:{files:[logo()]}})
  await waitFor(()=>expect(screen.getByText('Logo uploaded')).toBeTruthy())
  fireEvent.click(screen.getByRole('button',{name:'Remove'}))
  expect(screen.queryByRole('img',{name:'Logo preview'})).toBeNull()
  expect(screen.queryByText('Logo uploaded')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Start using Xtimator'}))
  await waitFor(()=>expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({values:expect.objectContaining({logoUrl:''})})))
 })
 it('rejects unsupported files before starting an upload',()=>{
  const {input}=renderSurvey();fireEvent.change(input,{target:{files:[new File(['svg'],'logo.svg',{type:'image/svg+xml'})]}})
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.toast).toHaveBeenCalledWith('Unsupported image format. Please upload a PNG or JPG file.')
  expect(screen.queryByRole('img',{name:'Logo preview'})).toBeNull()
 })
})
