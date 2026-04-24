import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

// Stub overlay — source created in Plan 04
vi.mock('@/components/i18n/translation-loading-overlay', () => ({
  TranslationLoadingOverlay: () => null,
}))

import { TranslationLoadingOverlay } from '@/components/i18n/translation-loading-overlay'

describe('TranslationLoadingOverlay — I18N-07', () => {
  beforeEach(() => {
    useLanguageMock.mockReset()
  })

  it('renders spinner and "Translating..." text when pendingCount > 0', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('renders nothing when pendingCount is 0', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })

  it('has role="status" and aria-live="polite" when visible', () => {
    expect(true).toBe(false) // stub — implement in Plan 04
  })
})
