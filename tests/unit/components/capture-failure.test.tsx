import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * REC-02 (render half): CaptureFailure renders a human-readable reason plus
 * i18n-wrapped Retry / Edit-manually buttons — never a raw status code, never
 * hardcoded English.
 *
 * The button labels MUST flow through useTranslation().t(). We mock t() to
 * return a recognizable sentinel `__t(<key>)__` and assert the sentinel renders,
 * proving the labels are not hardcoded.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({
    t: (key: string) => `__t(${key})__`,
    language: 'en',
  }),
}))

import { CaptureFailure } from '@/components/capture/capture-failure'

describe('REC-02: CaptureFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the passed friendly reason text verbatim', () => {
    render(
      <CaptureFailure
        errorMessage="The processing service is temporarily unavailable."
        retriesUsed={0}
        onRetry={() => {}}
        onEditManually={() => {}}
      />
    )
    expect(
      screen.getByText('The processing service is temporarily unavailable.')
    ).toBeTruthy()
  })

  it('renders the Retry button (testid capture-retry) when onRetry provided and retriesUsed < 2', () => {
    render(
      <CaptureFailure
        errorMessage="Something went wrong."
        retriesUsed={0}
        onRetry={() => {}}
        onEditManually={() => {}}
      />
    )
    expect(screen.getByTestId('capture-retry')).toBeTruthy()
  })

  it('does NOT render the Retry button once retriesUsed reaches 2', () => {
    render(
      <CaptureFailure
        errorMessage="Something went wrong."
        retriesUsed={2}
        onRetry={() => {}}
        onEditManually={() => {}}
      />
    )
    expect(screen.queryByTestId('capture-retry')).toBeNull()
  })

  it('renders the Edit-manually button (testid capture-edit-manually)', () => {
    render(
      <CaptureFailure
        errorMessage="Something went wrong."
        retriesUsed={0}
        onRetry={() => {}}
        onEditManually={() => {}}
      />
    )
    expect(screen.getByTestId('capture-edit-manually')).toBeTruthy()
  })

  it('produces the button labels via useTranslation t() (sentinel proves no hardcoded labels)', () => {
    render(
      <CaptureFailure
        errorMessage="Something went wrong."
        retriesUsed={0}
        onRetry={() => {}}
        onEditManually={() => {}}
      />
    )
    expect(screen.getByTestId('capture-retry').textContent).toContain('__t(Retry)__')
    expect(
      screen.getByTestId('capture-edit-manually').textContent
    ).toContain('__t(Edit manually)__')
  })
})
