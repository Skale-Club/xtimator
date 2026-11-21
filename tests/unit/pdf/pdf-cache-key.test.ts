import { afterEach, describe, expect, it } from 'vitest'
import { hashCompanyForPdf, hashPhotosForPdf, pdfRenderKeySuffix } from '@/lib/pdf/pdf-cache-key'

const company = { name: 'Acme', logo_url: '/storage/logos/a.webp', brand_primary_color: '#112233', estimate_terms_text: 'T' }
const photos = [
  { id: 'p1', sort_order: 0, caption: null, position: null },
  { id: 'p2', sort_order: 1, caption: 'Roof', position: null },
]

describe('pdf cache key', () => {
  const original = process.env.GIT_SHA
  afterEach(() => {
    if (original === undefined) delete process.env.GIT_SHA
    else process.env.GIT_SHA = original
  })

  it('is stable for identical inputs', () => {
    expect(pdfRenderKeySuffix(company, photos)).toBe(pdfRenderKeySuffix({ ...company }, [...photos]))
  })

  it('changes when branding changes', () => {
    expect(hashCompanyForPdf({ ...company, brand_primary_color: '#ffffff' })).not.toBe(hashCompanyForPdf(company))
    expect(hashCompanyForPdf({ ...company, logo_url: '/storage/logos/b.webp' })).not.toBe(hashCompanyForPdf(company))
    expect(hashCompanyForPdf({ ...company, estimate_terms_text: 'T2' })).not.toBe(hashCompanyForPdf(company))
  })

  it('changes when photos are attached, detached or reordered', () => {
    expect(hashPhotosForPdf(photos.slice(0, 1))).not.toBe(hashPhotosForPdf(photos))
    expect(hashPhotosForPdf([photos[1], photos[0]])).not.toBe(hashPhotosForPdf(photos))
    expect(hashPhotosForPdf([])).toBe(hashPhotosForPdf(null))
  })

  it('changes with the build id', () => {
    process.env.GIT_SHA = 'aaaaaaa'
    const a = pdfRenderKeySuffix(company, photos)
    process.env.GIT_SHA = 'bbbbbbb'
    expect(pdfRenderKeySuffix(company, photos)).not.toBe(a)
  })
})
