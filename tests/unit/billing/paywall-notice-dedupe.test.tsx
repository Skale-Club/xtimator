import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Notices review, stage 2: the paywall fact lives in the app-wide banner, so
 * the settings shell and the photos tab no longer repeat it in a box with a
 * second Subscribe button. Controls stay disabled (read-only behaviour intact).
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))
vi.mock('@/components/i18n/t', () => ({
  T: ({ children, text }: { children?: string; text?: string }) => <>{text ?? children}</>,
}))

let pathname = '/settings/company'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/settings/settings-nav', () => ({
  SettingsNav: () => <nav />,
  SettingsNavStrip: () => <nav />,
}))
vi.mock('@/components/pwa/twa-provider', () => ({ useIsTwa: () => false }))
vi.mock('@/components/workspace/photos/photo-drop-zone', () => ({
  PhotoDropZone: () => <div data-testid="photo-drop-zone" />,
}))
vi.mock('@/components/workspace/photos/photo-grid', () => ({ PhotoGrid: () => <div /> }))
vi.mock('@/components/workspace/photos/photo-lightbox', () => ({ PhotoLightbox: () => null }))
vi.mock('@/lib/actions/photo', () => ({ reorderPhotos: vi.fn() }))
vi.mock('@/lib/actions/estimate-photo', () => ({
  addPhotoToEstimate: vi.fn(),
  removePhotoFromEstimate: vi.fn(),
  getAttachedPhotoIdsAction: vi.fn(async () => []),
}))
vi.mock('@/components/workspace/estimate-version-context', () => ({
  useEstimateVersionSlot: () => ({ slot: null }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { BillingStateProvider } from '@/components/billing/billing-state-context'
import { SettingsLayoutClient } from '@/components/settings/settings-layout-client'
import { PhotosTab } from '@/components/workspace/photos/photos-tab'

describe('settings layout while paywalled', () => {
  it('renders no read-only notice or Subscribe button, and still disables the controls', () => {
    pathname = '/settings/company'
    const { container } = render(
      <BillingStateProvider state="paywalled">
        <SettingsLayoutClient>
          <button>Save</button>
        </SettingsLayoutClient>
      </BillingStateProvider>
    )
    expect(screen.queryByTestId('paywall-read-only-notice')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Subscribe' })).toBeNull()
    expect(container.querySelector('fieldset[disabled][data-paywall-read-only]')).toBeTruthy()
  })
})

describe('PhotosTab while paywalled', () => {
  it('replaces the drop zone with one muted line, no box and no Subscribe button', () => {
    render(
      <BillingStateProvider state="paywalled">
        <PhotosTab projectId="p1" companyId="c1" initialPhotos={[]} />
      </BillingStateProvider>
    )
    expect(screen.getByTestId('photos-read-only-note').textContent).toBe('Photos are read-only until you subscribe.')
    expect(screen.queryByTestId('paywall-read-only-notice')).toBeNull()
    expect(screen.queryByTestId('photo-drop-zone')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Subscribe' })).toBeNull()
  })

  it('shows the drop zone when active', () => {
    render(
      <BillingStateProvider state="active">
        <PhotosTab projectId="p1" companyId="c1" initialPhotos={[]} />
      </BillingStateProvider>
    )
    expect(screen.getByTestId('photo-drop-zone')).toBeTruthy()
    expect(screen.queryByTestId('photos-read-only-note')).toBeNull()
  })
})
