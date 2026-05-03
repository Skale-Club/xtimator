import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const setLanguageMock = vi.fn()
const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

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
  it('renders a trigger button with aria-label for current language', async () => {
    setupLanguage('en')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: english/i })
    expect(btn).toBeTruthy()
  })

  it('renders trigger button for pt', async () => {
    setupLanguage('pt')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: português/i })
    expect(btn).toBeTruthy()
  })

  it('renders trigger button for es', async () => {
    setupLanguage('es')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: español/i })
    expect(btn).toBeTruthy()
  })

  // Radix DropdownMenu renders via Portal — interaction tests require full browser env
  it.todo('opening dropdown shows all 3 language options')
  it.todo('clicking Português menu item calls setLanguage with "pt"')
  it.todo('clicking Español menu item calls setLanguage with "es"')
})
