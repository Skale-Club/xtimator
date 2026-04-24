import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

// Import the real TranslationLoadingOverlay — source exists in Plan 04
import { TranslationLoadingOverlay } from '@/components/i18n/translation-loading-overlay'

beforeEach(() => {
  useLanguageMock.mockReset()
})

describe('TranslationLoadingOverlay — I18N-07', () => {
  it('renders spinner and "Translating..." text when pendingCount > 0', () => {
    useLanguageMock.mockReturnValue({
      language: 'pt',
      setLanguage: vi.fn(),
      pendingCount: 1,
      setPendingCount: vi.fn(),
    })
    render(<TranslationLoadingOverlay />)
    expect(screen.getByText('Translating...')).toBeTruthy()
  })

  it('renders nothing when pendingCount is 0', () => {
    useLanguageMock.mockReturnValue({
      language: 'pt',
      setLanguage: vi.fn(),
      pendingCount: 0,
      setPendingCount: vi.fn(),
    })
    const { container } = render(<TranslationLoadingOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('has role="status" and aria-live="polite" when visible', () => {
    useLanguageMock.mockReturnValue({
      language: 'es',
      setLanguage: vi.fn(),
      pendingCount: 2,
      setPendingCount: vi.fn(),
    })
    render(<TranslationLoadingOverlay />)
    const statusEl = screen.getByRole('status')
    expect(statusEl).toBeTruthy()
    expect(statusEl.getAttribute('aria-live')).toBe('polite')
  })
})
