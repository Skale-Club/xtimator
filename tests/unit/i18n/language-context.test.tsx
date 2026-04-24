import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

// Stubs for source modules that don't exist yet — created in Plan 02
vi.mock('@/lib/i18n/language-context', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLanguage: vi.fn(() => ({ language: 'en', setLanguage: vi.fn(), pendingCount: 0, setPendingCount: vi.fn() })),
}))

describe('LanguageContext — I18N-01, I18N-02', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('I18N-02: initializes language to "en" when localStorage is empty', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-02: restores persisted language from localStorage on mount', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-02: setLanguage persists to localStorage under key "language"', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-01: setLanguage updates context language value', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })
})
