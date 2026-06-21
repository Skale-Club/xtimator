import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, cleanup } from '@testing-library/react'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { SURVEY_STEPS } from '@/components/onboarding/survey/survey-config'
import { SurveyProgress } from '@/components/onboarding/survey/survey-progress'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

const INITIAL: OnboardingValues = {
  companyName: '',
  subdomain: '',
  ownerName: '',
  phone: '',
  email: '',
  website: '',
  language: 'en',
  industries: [],
  customIndustry: '',
  prefillPriceBook: false,
  brandPrimaryColor: '#0D9488',
  address: '',
  city: '',
  state: '',
  zip: '',
  licenseNumber: '',
  insuranceInfo: '',
  defaultTaxRate: 0,
  defaultPaymentTerms: 'Net 30',
  defaultWarrantyTerms: '1 year',
  defaultValidityDays: 30,
}

describe('SURVEY_STEPS configuration', () => {
  it('exports exactly 10 ordered steps', () => {
    expect(SURVEY_STEPS).toHaveLength(10)
  })

  it('lists step keys in the documented order', () => {
    expect(SURVEY_STEPS.map((s) => s.key)).toEqual([
      'companyName',
      'ownerName',
      'phone',
      'email',
      'industry',
      'language',
      'brandColor',
      'logo',
      'location',
      'review',
    ])
  })

  it('marks only companyName as required', () => {
    const required = SURVEY_STEPS.filter((s) => s.required).map((s) => s.key)
    expect(required).toEqual(['companyName'])
  })
})

describe('useSurveyState', () => {
  // useSurveyState persists { stepIndex, values } to localStorage under
  // 'xtimator_onboarding' and restores it on mount. Without clearing between
  // tests, a prior test's persisted stepIndex/values leak into the next mount
  // (e.g. stepIndex restored as 1 instead of 0). Clear the draft + unmount each.
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('starts at step 0 with the initial values', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    expect(result.current.stepIndex).toBe(0)
    expect(result.current.totalSteps).toBe(10)
    expect(result.current.values.companyName).toBe('')
    expect(result.current.isFirst).toBe(true)
    expect(result.current.isLast).toBe(false)
  })

  it('blocks goNext on the required companyName step when value is empty', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    act(() => {
      result.current.goNext()
    })
    expect(result.current.stepIndex).toBe(0)
    expect(result.current.error).not.toBeNull()
  })

  it('advances when companyName meets validation', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    act(() => {
      result.current.setValue('companyName', 'Acme Co')
    })
    act(() => {
      result.current.goNext()
    })
    expect(result.current.stepIndex).toBe(1)
    expect(result.current.error).toBeNull()
  })

  it('preserves values when navigating back', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    act(() => {
      result.current.setValue('companyName', 'Acme Co')
    })
    act(() => {
      result.current.goNext()
    })
    act(() => {
      result.current.goBack()
    })
    expect(result.current.stepIndex).toBe(0)
    expect(result.current.values.companyName).toBe('Acme Co')
  })

  it('rejects an invalid email but allows blank', () => {
    const { result } = renderHook(() => useSurveyState(INITIAL))
    act(() => {
      result.current.setValue('companyName', 'Acme Co')
    })
    // step 0 -> 1 (ownerName)
    act(() => result.current.goNext())
    // step 1 -> 2 (phone)
    act(() => result.current.goNext())
    // step 2 -> 3 (email)
    act(() => result.current.goNext())
    expect(result.current.stepIndex).toBe(3)
    act(() => {
      result.current.setValue('email', 'not-an-email')
    })
    act(() => result.current.goNext())
    expect(result.current.stepIndex).toBe(3)
    expect(result.current.error).not.toBeNull()
    act(() => {
      result.current.setValue('email', '')
    })
    act(() => result.current.goNext())
    expect(result.current.stepIndex).toBe(4)
  })
})

describe('SurveyProgress', () => {
  it('renders "Step N of M" with computed percentage', () => {
    const { container } = render(<SurveyProgress current={2} total={10} />)
    expect(container.textContent).toContain('Step 3 of 10')
    expect(container.textContent).toContain('30%')
  })

  it('exposes an aria-label on the wrapping element', () => {
    const { container } = render(<SurveyProgress current={0} total={10} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-label')).toBe('Step 1 of 10')
  })
})
