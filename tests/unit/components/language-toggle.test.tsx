import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const setLanguageMock = vi.fn()
const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

// Stub LanguageToggle — source does not exist yet (created in Plan 04)
vi.mock('@/components/app-shell/language-toggle', () => ({
  LanguageToggle: () => <button aria-label="Switch language: currently English">EN</button>,
}))

import { LanguageToggle } from '@/components/app-shell/language-toggle'

describe('LanguageToggle — I18N-01', () => {
  beforeEach(() => {
    setLanguageMock.mockReset()
    useLanguageMock.mockReset()
    useLanguageMock.mockReturnValue({ language: 'en', setLanguage: setLanguageMock, pendingCount: 0, setPendingCount: vi.fn() })
  })

  it('renders a button with aria-label containing current language', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('clicking button calls setLanguage with "pt" when language is "en"', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('clicking button calls setLanguage with "es" when language is "pt"', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('clicking button calls setLanguage with "en" when language is "es"', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('displays "EN" badge when language is "en"', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })
})
