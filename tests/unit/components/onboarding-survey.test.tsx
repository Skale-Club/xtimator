import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, cleanup } from '@testing-library/react'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SURVEY_STEPS } from '@/components/onboarding/survey/survey-config'
import { SurveyProgress } from '@/components/onboarding/survey/survey-progress'
import { draftValues, type OnboardingDraft } from '@/lib/onboarding/draft'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const INITIAL: OnboardingValues = {
  companyName: '', subdomain: '', ownerName: 'Verified Owner', phone: '+16175550142', email: 'verified@example.com', website: '', language: 'en',
  industries: [], customIndustries: [], prefillPriceBook: false, brandPrimaryColor: '#406EF1',
  address: '', city: '', state: '', zip: '', licenseNumber: '', insuranceInfo: '',
  defaultTaxRate: 0, defaultPaymentTerms: 'Net 30', defaultWarrantyTerms: '1 year', defaultValidityDays: 30,
}
const remote: OnboardingDraft = { id: '11111111-1111-4111-8111-111111111111', mode: 'first', step: 'location',
  values: draftValues({ ...INITIAL, companyName: 'Cross-device company', language: 'pt' }), last_activity_at: '2026-11-06T16:00:00Z', revision: 4 }

beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); localStorage.clear() })

describe('short onboarding', () => {
  it('has six ordered questions, beginning with the tool language and no review', () => {
    expect(SURVEY_STEPS.map(s => s.key)).toEqual(['language', 'companyName', 'industry', 'location', 'brandColor', 'logo'])
    expect(SURVEY_STEPS.filter(s => s.required).map(s => s.key)).toEqual(['companyName'])
  })
  it('validates company name before continuing and keeps answers on Back', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    expect(result.current.totalSteps).toBe(6)
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.currentStep.key).toBe('companyName')
    expect(result.current.error).toBeTruthy()
    act(() => result.current.setValue('companyName', 'Carter Services'))
    act(() => result.current.goNext())
    expect(result.current.currentStep.key).toBe('industry')
    act(() => result.current.goBack())
    expect(result.current.values.companyName).toBe('Carter Services')
  })
  it('resumes remote answers, language, logo and stable step on a different device', () => {
    const draft = { ...remote, values: { ...remote.values, logoUrl: '/storage/logos/example.webp' } }
    const { result } = renderHook(() => useSurveyState(INITIAL, 'account-draft', draft))
    expect(result.current.currentStep.key).toBe('location')
    expect(result.current.values.companyName).toBe('Cross-device company')
    expect(result.current.values.language).toBe('pt')
    expect(result.current.logoPreview).toBe('/storage/logos/example.webp')
  })
  it('prefers newer offline answers and keeps verified contacts outside persisted values', () => {
    localStorage.setItem('account-draft', JSON.stringify({ version: 3, stepKey: 'industry', savedAt: Date.parse(remote.last_activity_at) + 1000,
      values: { ...INITIAL, companyName: 'Offline edits', phone: '+10000000000', email: 'stale@example.com', address: 'Old street', licenseNumber: 'Old license' } }))
    const { result } = renderHook(() => useSurveyState(INITIAL, 'account-draft', remote))
    expect(result.current.currentStep.key).toBe('industry')
    expect(result.current.values.companyName).toBe('Offline edits')
    expect(result.current.values.phone).toBe(INITIAL.phone)
    expect(result.current.values.email).toBe(INITIAL.email)
    expect(result.current.values.address).toBe('')
    expect(result.current.values.licenseNumber).toBe('')
    const stored = JSON.parse(localStorage.getItem('account-draft')!).values
    expect(stored).not.toHaveProperty('phone')
    expect(stored).not.toHaveProperty('email')
    expect(stored).not.toHaveProperty('address')
  })
  it('prefers the newer server draft over an older browser copy', () => {
    localStorage.setItem('account-draft', JSON.stringify({ version: 3, stepKey: 'companyName', savedAt: 1, values: { ...INITIAL, companyName: 'Old browser' } }))
    const { result } = renderHook(() => useSurveyState(INITIAL, 'account-draft', remote))
    expect(result.current.values.companyName).toBe('Cross-device company')
    expect(result.current.currentStep.key).toBe('location')
  })
  it('preserves useful legacy answers but restarts the shortened flow at language', () => {
    localStorage.setItem('xtimator_onboarding', JSON.stringify({ version: 2, stepKey: 'review', values: { ...INITIAL, companyName: 'Legacy Co', language: 'es', address: 'Obsolete address' } }))
    const { result } = renderHook(() => useSurveyState(INITIAL))
    expect(result.current.currentStep.key).toBe('language')
    expect(result.current.values.companyName).toBe('Legacy Co')
    expect(result.current.values.language).toBe('es')
    expect(result.current.values.address).toBe('')
  })
  it('recovers safely from malformed storage', () => {
    localStorage.setItem('xtimator_onboarding', '{bad json')
    const { result } = renderHook(() => useSurveyState(INITIAL))
    expect(result.current.currentStep.key).toBe('language')
    expect(result.current.ready).toBe(true)
  })
  it('keeps signup company prefills when the newly created remote draft is empty', () => {
    const empty = { ...remote, step: 'language' as const, values: {} as OnboardingDraft['values'] }
    const { result } = renderHook(() => useSurveyState({ ...INITIAL, companyName: 'Signup Company' }, 'empty-draft', empty))
    expect(result.current.values.companyName).toBe('Signup Company')
    expect(result.current.values.phone).toBe(INITIAL.phone)
  })
})

describe('SurveyProgress', () => {
  it('announces the actual position in the six-question flow', () => {
    const { container } = render(<SurveyProgress current={2} total={6} />)
    expect(container.textContent).toContain('Step 3 of 6')
    expect(container.textContent).toContain('50%')
    expect(container.firstElementChild?.getAttribute('aria-label')).toBe('Step 3 of 6')
  })
})
