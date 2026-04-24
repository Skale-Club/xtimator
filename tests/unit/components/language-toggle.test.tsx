import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const setLanguageMock = vi.fn()
const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

// Import the real LanguageToggle component (no stub needed — source exists in Plan 04)
import { LanguageToggle } from '@/components/app-shell/language-toggle'

function setupLanguage(lang: 'en' | 'pt' | 'es') {
  useLanguageMock.mockReturnValue({
    language: lang,
    setLanguage: setLanguageMock,
    pendingCount: 0,
    setPendingCount: vi.fn(),
  })
}

beforeEach(() => {
  setLanguageMock.mockReset()
  useLanguageMock.mockReset()
  setupLanguage('en')
})

describe('LanguageToggle — I18N-01', () => {
  it('renders a button with aria-label containing current language', async () => {
    setupLanguage('en')
    render(<LanguageToggle />)
    // mounted guard: useEffect fires after render
    const btn = await screen.findByRole('button', { name: /switch language: currently english/i })
    expect(btn).toBeTruthy()
  })

  it('clicking button calls setLanguage with "pt" when language is "en"', async () => {
    setupLanguage('en')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /switch language: currently english/i })
    await act(async () => { fireEvent.click(btn) })
    expect(setLanguageMock).toHaveBeenCalledWith('pt')
  })

  it('clicking button calls setLanguage with "es" when language is "pt"', async () => {
    setupLanguage('pt')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /switch language: currently português/i })
    await act(async () => { fireEvent.click(btn) })
    expect(setLanguageMock).toHaveBeenCalledWith('es')
  })

  it('clicking button calls setLanguage with "en" when language is "es"', async () => {
    setupLanguage('es')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /switch language: currently español/i })
    await act(async () => { fireEvent.click(btn) })
    expect(setLanguageMock).toHaveBeenCalledWith('en')
  })

  it('displays "EN" badge when language is "en"', async () => {
    setupLanguage('en')
    render(<LanguageToggle />)
    const badge = await screen.findByText('EN')
    expect(badge).toBeTruthy()
  })
})
