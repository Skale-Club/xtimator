import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Phase 78 plan 01 — SeoEditor wiring of OgImageUploader.
 */

// Mocks ----------------------------------------------------------------------
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

vi.mock('@/app/admin/seo/actions', () => ({
  saveSeo: vi.fn(async () => ({ ok: true })),
}))

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock')
})

import { SeoEditor } from '@/app/admin/seo/seo-editor'

const MANAGED_URL =
  'https://example.supabase.co/storage/v1/object/public/platform-brand/og-images/og.png'

describe('SeoEditor', () => {
  it('renders OgImageUploader (no bare URL input) for the OG image field', () => {
    render(
      <SeoEditor
        initial={{
          siteTitle: '',
          metaDescription: '',
          ogImageUrl: '',
          canonicalBaseUrl: '',
        }}
      />
    )
    // OgImageUploader dropzone button is present
    expect(screen.getByRole('button', { name: /Upload OG image/i })).toBeTruthy()
    // No URL input for OG image — the old placeholder is gone
    expect(screen.queryByPlaceholderText(/og-image\.png/i)).toBeNull()
  })

  it('initial ogImageUrl renders inside the uploader preview', () => {
    render(
      <SeoEditor
        initial={{
          siteTitle: '',
          metaDescription: '',
          ogImageUrl: MANAGED_URL,
          canonicalBaseUrl: '',
        }}
      />
    )
    const img = screen.getByAltText(/OG image preview/i) as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe(MANAGED_URL)
  })
})
