import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The overlay now reads the count from the dedicated pending-count context
// (split out of useLanguage so count bumps don't re-render every consumer).
const usePendingCountMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useTranslationPendingCount: () => usePendingCountMock(),
}))

// Import the real TranslationLoadingOverlay — source exists in Plan 04
import { TranslationLoadingOverlay } from '@/components/i18n/translation-loading-overlay'

beforeEach(() => {
  usePendingCountMock.mockReset()
})

describe('TranslationLoadingOverlay — I18N-07', () => {
  it('renders spinner and "Translating..." text when pendingCount > 0', () => {
    usePendingCountMock.mockReturnValue(1)
    render(<TranslationLoadingOverlay />)
    expect(screen.getByText('Translating...')).toBeTruthy()
  })

  it('renders nothing when pendingCount is 0', () => {
    usePendingCountMock.mockReturnValue(0)
    const { container } = render(<TranslationLoadingOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it('has role="status" and aria-live="polite" when visible', () => {
    usePendingCountMock.mockReturnValue(2)
    render(<TranslationLoadingOverlay />)
    const statusEl = screen.getByRole('status')
    expect(statusEl).toBeTruthy()
    expect(statusEl.getAttribute('aria-live')).toBe('polite')
  })
})
