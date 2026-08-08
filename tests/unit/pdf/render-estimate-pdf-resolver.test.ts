// @vitest-environment node
//
// Phase 188 Plan 03 (PROV-01): renderEstimatePdf() now resolves photo
// signed URLs via serverStorage() -> assertServer(), which throws whenever
// `typeof window !== 'undefined'`. The suite's global environment is jsdom
// (vitest.config.ts), where `window` always exists, so this spuriously trips
// here unless this file opts into the `node` environment (same fix as
// tests/unit/storage/server-provider.test.ts from Plan 01 and
// tests/unit/whatsapp/pdf-delivery.test.ts from this plan). This test
// intentionally does NOT mock @/lib/storage/server — it mocks the Supabase
// client's storage.from() so the real serverStorage(client) delegation path
// (Supabase mode) is exercised end-to-end.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, createElement: vi.fn().mockReturnValue('mock-element') }
})
vi.mock('@/components/pdf/estimate-pdf', () => ({ default: vi.fn(() => null) }))
vi.mock('@/components/pdf/estimate-pdf-modern', () => ({ default: vi.fn(() => null) }))
vi.mock('@/lib/queries/estimate', () => ({ getEstimateWithContext: vi.fn() }))
vi.mock('@/lib/queries/estimate-signature', () => ({ loadLatestSignedSnapshot: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
  }),
}))

import { createElement } from 'react'
import sharp from 'sharp'
import { resolveEstimatePdfContext, renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'
import { willPdfRenderPhoto } from '@/lib/pdf/pdf-image-support'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { loadLatestSignedSnapshot } from '@/lib/queries/estimate-signature'
import { renderToBuffer } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockLoadSnapshot = vi.mocked(loadLatestSignedSnapshot)
const mockCreateElement = vi.mocked(createElement)
const mockRenderToBuffer = vi.mocked(renderToBuffer)

/**
 * PDF-PHOTO-01: photos are no longer handed to react-pdf as signed URLs — it
 * cannot decode the WebP they point at — so this stub now serves BYTES through
 * the same `storage.from(bucket).download(path)` call the real Supabase provider
 * makes. `createSignedUrl` is kept (harmlessly) so any future caller that still
 * wants one keeps working.
 */
function makeSupabase(photoBytes?: Buffer) {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed/photo.jpg' },
          error: null,
        }),
        download: vi.fn().mockResolvedValue({
          data: photoBytes ? new Blob([new Uint8Array(photoBytes)]) : null,
          error: photoBytes ? null : { message: 'not found' },
        }),
      }),
    },
  } as never
}

const BASE_ESTIMATE = {
  id: 'est-1',
  company_id: 'co-1',
  created_by_user_id: null,
  language: 'en' as const,
  updated_at: '2026-01-01T00:00:00Z',
  summary: 'live summary',
  total: 1000,
  attachedPhotos: [] as { id: string; storage_path: string; caption: string | null }[],
  // Phase 184 Plan 05 (PGBRK-01/03/04) — renderEstimatePdf() now calls the
  // REAL (unmocked) blocksFromModel()/computePageBreaks() internally, which
  // reads `sections`/`presentation_settings` off this fixture.
  // blocksFromModel's own `input.sections ?? []` defensive default already
  // handles a missing `sections`, but adding it explicitly here keeps this
  // mock self-documenting.
  sections: [] as unknown[],
  presentation_settings: null,
}

function baseContext(overrides: { templateStyle?: string } = {}) {
  return {
    estimate: BASE_ESTIMATE,
    project: { name: 'Kitchen Reno', project_type: null, client: null },
    company: { id: 'co-1', owner_name: 'Owner Name', estimate_template_style: overrides.templateStyle ?? 'classic' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRenderToBuffer.mockResolvedValue(Buffer.from('mock-pdf'))
})

describe('renderEstimatePdf (PDFPAR-04)', () => {
  it('selects EstimatePDFModern when company.estimate_template_style is "modern"', async () => {
    mockGetEstimate.mockResolvedValue(baseContext({ templateStyle: 'modern' }) as never)
    mockLoadSnapshot.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockCreateElement.mock.calls[0][0]).toBe(EstimatePDFModern)
    expect(mockCreateElement.mock.calls[0][0]).not.toBe(EstimatePDF)
  })

  it('defaults to EstimatePDF (classic) when estimate_template_style is unset/invalid', async () => {
    mockGetEstimate.mockResolvedValue(baseContext({ templateStyle: 'nonsense' }) as never)
    mockLoadSnapshot.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockCreateElement.mock.calls[0][0]).toBe(EstimatePDF)
  })

  it('honors the signed snapshot (TRUST-01) — frozen content overrides the live row', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    mockLoadSnapshot.mockResolvedValue({
      id: 'sig-1',
      signer_name: 'Jane Signer',
      signature_data: 'data:image/png;base64,AA==',
      signed_at: '2026-02-01T00:00:00Z',
      signed_total: 1000,
      signed_content: {
        version: 1, summary: 'FROZEN summary', notes: null, timeline: null,
        payment_terms: null, warranty_terms: null, estimate_date: null, estimate_number: null,
        subtotal: 1000, tax_rate: 0, tax_amount: 0, discount_type: null, discount_value: null,
        discount_amount: null, deposit_type: null, deposit_value: null, balance_due: null,
        total: 1000, currency_code: 'USD', presentation_settings: null, sections: [],
      },
    })

    await renderEstimatePdf('est-1', makeSupabase())

    const passedProps = mockCreateElement.mock.calls[0][1] as { estimate: { summary: string } }
    expect(passedProps.estimate.summary).toBe('FROZEN summary')
  })

  it('pre-resolves attached photos to DRAWABLE data URIs before createElement is called', async () => {
    // PDF-PHOTO-01: this used to assert a signed URL. A signed URL to the stored
    // `.webp` is exactly what react-pdf could not decode — the grid rendered
    // blank. The contract now is "whatever reaches the element tree is drawable".
    const stored = await sharp({
      create: { width: 900, height: 700, channels: 3, background: { r: 10, g: 90, b: 200 } },
    })
      .webp()
      .toBuffer()

    mockGetEstimate.mockResolvedValue({
      ...baseContext(),
      estimate: { ...BASE_ESTIMATE, attachedPhotos: [{ id: 'p1', storage_path: 'co-1/p1.webp', caption: 'Before' }] },
    } as never)
    mockLoadSnapshot.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase(stored))

    const passedProps = mockCreateElement.mock.calls[0][1] as {
      attachedPhotos: { url: string; caption: string | null }[]
    }
    expect(passedProps.attachedPhotos).toHaveLength(1)
    expect(passedProps.attachedPhotos[0].caption).toBe('Before')
    expect(passedProps.attachedPhotos[0].url).toMatch(/^data:image\/jpeg;base64,/)
    expect(willPdfRenderPhoto(passedProps.attachedPhotos[0])).toBe(true)
  })

  it('drops a photo it cannot read rather than failing the document', async () => {
    mockGetEstimate.mockResolvedValue({
      ...baseContext(),
      estimate: { ...BASE_ESTIMATE, attachedPhotos: [{ id: 'p1', storage_path: 'co-1/gone.webp', caption: 'Before' }] },
    } as never)
    mockLoadSnapshot.mockResolvedValue(null)

    // makeSupabase() with no bytes => download() errors => provider throws.
    const result = await renderEstimatePdf('est-1', makeSupabase())

    expect(result?.buffer).toBeInstanceOf(Buffer)
    const passedProps = mockCreateElement.mock.calls[0][1] as {
      attachedPhotos: { url: string; caption: string | null }[]
    }
    expect(passedProps.attachedPhotos).toEqual([])
  })

  it('resolveEstimatePdfContext alone never calls renderToBuffer (cheap path)', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    mockLoadSnapshot.mockResolvedValue(null)

    await resolveEstimatePdfContext('est-1', makeSupabase())

    expect(mockRenderToBuffer).not.toHaveBeenCalled()
  })

  it('renderEstimatePdf accepts a pre-resolved context and skips re-fetching', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    mockLoadSnapshot.mockResolvedValue(null)
    const context = await resolveEstimatePdfContext('est-1', makeSupabase())
    mockGetEstimate.mockClear()

    await renderEstimatePdf('est-1', makeSupabase(), { context: context! })

    expect(mockGetEstimate).not.toHaveBeenCalled()
  })

  it('returns null when the estimate is not found', async () => {
    mockGetEstimate.mockResolvedValue(null)
    const result = await renderEstimatePdf('missing', makeSupabase())
    expect(result).toBeNull()
  })

  it('resolveEstimatePdfContext returns signature: null when the snapshot has no signer_name (PDFPAR-02)', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    mockLoadSnapshot.mockResolvedValue({
      id: 'sig-1',
      signer_name: null,
      signature_data: null,
      signed_at: '2026-02-01T00:00:00Z',
      signed_total: 1000,
      signed_content: null,
    } as never)

    const context = await resolveEstimatePdfContext('est-1', makeSupabase())

    expect(context?.signature).toBeNull()
  })

  it('resolveEstimatePdfContext returns a populated DocumentSignature when the snapshot has signer_name/signature_data (PDFPAR-02)', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    mockLoadSnapshot.mockResolvedValue({
      id: 'sig-1',
      signer_name: 'Jane Client',
      signature_data: 'data:image/png;base64,AAA',
      signed_at: '2026-02-01T00:00:00Z',
      signed_total: 1000,
      signed_content: null,
    } as never)

    const context = await resolveEstimatePdfContext('est-1', makeSupabase())

    expect(context?.signature).toEqual({
      signerName: 'Jane Client',
      signedAt: '2026-02-01T00:00:00Z',
      signatureDataUrl: 'data:image/png;base64,AAA',
    })
  })
})
