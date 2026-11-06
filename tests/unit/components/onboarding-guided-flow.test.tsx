import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { SurveyShell } from '@/components/onboarding/survey/survey-shell'
import { useSurveyState } from '@/components/onboarding/survey/use-survey-state'
import { IndustryOptions } from '@/components/onboarding/industry-options'
import { ColorPicker } from '@/components/onboarding/color-picker'
import type { OnboardingValues } from '@/lib/schemas/onboarding'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const INITIAL: OnboardingValues = {
  companyName: '', subdomain: '', ownerName: '', phone: '+16175550142', email: 'verified@example.com', website: '', language: 'en', industries: [], customIndustries: [], prefillPriceBook: false,
  brandPrimaryColor: '#406EF1', address: '', city: '', state: '', zip: '', licenseNumber: '', insuranceInfo: '', defaultTaxRate: 0,
  defaultPaymentTerms: 'Net 30', defaultWarrantyTerms: '1 year', defaultValidityDays: 30,
}
function Survey({ onComplete = vi.fn() }: { onComplete?: () => void } = {}) {
  const state = useSurveyState(INITIAL)
  return <SurveyShell appName="Xtimator" logoUrl={null} state={state} isSubmitting={false} onComplete={onComplete} />
}
function Services() {
  const [value, onChange] = useState<string[]>([])
  const [customValues, onCustomChange] = useState<string[]>([])
  return <IndustryOptions {...{ value, onChange, customValues, onCustomChange }} />
}
function Colors({ onEnter = vi.fn() }: { onEnter?: () => void }) {
  const [value, onChange] = useState('#406EF1')
  return <><ColorPicker {...{ value, onChange, onEnter }} /><output aria-label="Selected color">{value}</output></>
}
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); localStorage.clear() })

describe('language-first guided onboarding', () => {
  it.each([
    ['Português (BR)', 'Próximo', 'Qual é o nome da sua empresa?', 'Nome da empresa', 'Quais serviços sua empresa oferece?', 'Voltar'],
    ['Español', 'Siguiente', '¿Cómo se llama su empresa?', 'Nombre de la empresa', '¿Qué servicios ofrece su empresa?', 'Atrás'],
  ])('immediately follows %s, validates and advances with Enter', (language, next, question, companyLabel, serviceQuestion, back) => {
    render(<LanguageProvider><Survey /></LanguageProvider>)
    expect(screen.getByRole('heading', { name: 'Which language would you like to use Xtimator in?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: language }))
    fireEvent.click(screen.getByRole('button', { name: next }))
    expect(screen.getByRole('heading', { name: question })).toBeTruthy()
    const company = screen.getByRole('textbox', { name: companyLabel })
    expect(document.activeElement).toBe(company)
    fireEvent.keyDown(company, { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).not.toContain('Company name must')
    fireEvent.change(company, { target: { value: 'Carter Home Services' } })
    fireEvent.keyDown(company, { key: 'Enter' })
    expect(screen.getByRole('heading', { name: serviceQuestion })).toBeTruthy()
    expect(screen.getByRole('button', { name: back })).toBeTruthy()
    expect(localStorage.getItem('language')).toBe(language === 'Español' ? 'es' : 'pt')
  })
  it('asks only a general region, focuses it and advances through separate color and logo screens', () => {
    localStorage.setItem('xtimator_onboarding', JSON.stringify({ version: 3, stepKey: 'location', values: { ...INITIAL, companyName: 'Carter Services' } }))
    render(<LanguageProvider><Survey /></LanguageProvider>)
    const region = screen.getByRole('textbox', { name: 'Service area' })
    expect(document.activeElement).toBe(region)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByLabelText('Street address')).toBeNull()
    fireEvent.change(region, { target: { value: 'Greater Boston' } }); fireEvent.keyDown(region, { key: 'Enter' })
    expect(screen.getByRole('heading', { name: 'Pick a brand color' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Upload company logo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start using Xtimator' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Upload your logo' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Brand color' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Start using Xtimator' })).toBeTruthy()
    expect(screen.queryByText('Review and finish')).toBeNull()
  })
  it('does not advance while an IME composition is being confirmed', () => {
    localStorage.setItem('xtimator_onboarding', JSON.stringify({ version: 3, stepKey: 'companyName', values: { ...INITIAL, companyName: 'New Company' } }))
    render(<LanguageProvider><Survey /></LanguageProvider>)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Company Name' }), { key: 'Enter', isComposing: true })
    expect(screen.getByRole('heading', { name: "What's your company name?" })).toBeTruthy()
  })
  it('resumes an existing color draft, advances with Enter and finishes only on the logo screen', () => {
    localStorage.setItem('xtimator_onboarding', JSON.stringify({ version: 3, stepKey: 'brandColor', values: { ...INITIAL, companyName: 'Saved Company', logoUrl: '/storage/logos/saved.webp' } }))
    const complete = vi.fn()
    render(<LanguageProvider><Survey onComplete={complete} /></LanguageProvider>)
    expect(screen.getByRole('heading', { name: 'Pick a brand color' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Logo preview' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const color = screen.getByRole('textbox', { name: 'Hex color' })
    fireEvent.change(color, { target: { value: '123abc' } })
    fireEvent.keyDown(color, { key: 'Enter' })
    expect(screen.getByRole('heading', { name: 'Upload your logo' })).toBeTruthy()
    expect(complete).not.toHaveBeenCalled()
    const draft = JSON.parse(localStorage.getItem('xtimator_onboarding')!)
    expect(draft.stepKey).toBe('logo')
    expect(draft.values.logoUrl).toBe('/storage/logos/saved.webp')
    expect(draft.values.brandPrimaryColor).toBe('#123ABC')
    fireEvent.click(screen.getByRole('button', { name: 'Start using Xtimator' }))
    expect(complete).toHaveBeenCalledOnce()
  })
  it('shows draft syncing errors with a retry action', () => {
    function ErrorSurvey() {const state = useSurveyState(INITIAL); return <SurveyShell appName="Xtimator" logoUrl={null} state={state} isSubmitting={false} onComplete={vi.fn()} draftStatus="error" onRetrySave={retry} />}
    const retry=vi.fn()
    render(<ErrorSurvey />)
    expect(screen.getByRole('status').textContent).toContain('Saved on this device')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('visible service choices', () => {
  it('opens one group at a time and preserves selections across groups', () => {
    render(<Services />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    fireEvent.click(screen.getByRole('checkbox', { name: 'House Cleaning' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Upholstery & Carpet Cleaning' }))
    fireEvent.click(screen.getByRole('button', { name: /^Construction & Remodeling/ }))
    expect(screen.queryByRole('checkbox', { name: 'House Cleaning' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Painting' }))
    fireEvent.click(screen.getByRole('button', { name: /^Cleaning/ }))
    expect(screen.getByRole('checkbox', { name: 'House Cleaning' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Upholstery & Carpet Cleaning' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('checkbox', { name: 'House Cleaning' }))
    expect(screen.getByRole('checkbox', { name: 'House Cleaning' }).getAttribute('aria-checked')).toBe('false')
  })
  it('adds custom services with Enter without duplicating built-in ones', () => {
    render(<Services />)
    fireEvent.click(screen.getByRole('button', { name: 'Another service' }))
    const input = screen.getByRole('textbox', { name: 'Another service' })
    fireEvent.change(input, { target: { value: 'Solar installation' } }); fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('checkbox', { name: 'Solar installation' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.change(input, { target: { value: 'House Cleaning' } }); fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByRole('checkbox', { name: 'House Cleaning' })).toHaveLength(1)
  })
})

describe('compact brand colors', () => {
  it('selects presets and validates a custom hex before Enter', () => {
    const onEnter = vi.fn()
    render(<Colors onEnter={onEnter} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Orange' }))
    expect(screen.getByLabelText('Selected color').textContent).toBe('#EA580C')
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const hex = screen.getByRole('textbox', { name: 'Hex color' })
    expect(document.activeElement).toBe(hex)
    fireEvent.change(hex, { target: { value: 'xyz' } }); fireEvent.keyDown(hex, { key: 'Enter' })
    expect(onEnter).not.toHaveBeenCalled()
    fireEvent.change(hex, { target: { value: '123abc' } }); fireEvent.keyDown(hex, { key: 'Enter' })
    expect(screen.getByLabelText('Selected color').textContent).toBe('#123ABC')
    expect(onEnter).toHaveBeenCalledOnce()
    expect(screen.getByRole('radio', { name: 'Custom' }).getAttribute('aria-checked')).toBe('true')
  })
  it('supports arrow-key selection', () => {
    render(<Colors />)
    const first = screen.getByRole('radio', { name: 'System primary' })
    first.focus(); fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'System secondary' }).getAttribute('aria-checked')).toBe('true')
  })
})
