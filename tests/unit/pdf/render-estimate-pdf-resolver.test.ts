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
const captureMessage = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, createElement: vi.fn().mockReturnValue('mock-element') }
})
vi.mock('@/components/pdf/estimate-pdf', () => ({ default: vi.fn(() => null) }))
vi.mock('@/components/pdf/estimate-pdf-modern', () => ({ default: vi.fn(() => null) }))
vi.mock('@/lib/queries/estimate', () => ({ getEstimateWithContext: vi.fn() }))
vi.mock('@/lib/queries/estimate-signature', () => ({ loadSignatureEvidence: vi.fn() }))
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
import { loadSignatureEvidence } from '@/lib/queries/estimate-signature'
import { buildSigningIdentity } from '@/lib/estimate/signing-identity'
import { renderToBuffer } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockLoadEvidence = vi.mocked(loadSignatureEvidence)
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
    signatureRow: null,
  }
}

const SIGNATURE = { signerName: 'Jane Client', signedAt: '2026-02-01T00:00:00Z', signatureDataUrl: 'data:image/png;base64,AAA' }

const EVIDENCE = {
  ...SIGNATURE, integrity: 'unavailable', sha256: null, consentStatement: null,
  signerEmail: null, ipAddress: null, device: null, userAgent: null, signedTotal: 1000, currencyCode: 'USD',
} as const

function signedContext(templateStyle = 'classic') {
  const base = baseContext({ templateStyle })
  const identity = buildSigningIdentity({ name: 'Frozen Company' }, { name: 'Frozen Project' }, 'Frozen Preparer', 'pt')
  return {
    ...base,
    estimate: { ...BASE_ESTIMATE, summary: 'FROZEN summary', language: 'pt', signature: SIGNATURE, signedIdentity: identity },
    project: { ...base.project, ...identity.project },
    company: { ...base.company, ...identity.company },
    signatureRow: { id: 'sig-1', signed_at: SIGNATURE.signedAt, signed_content: { summary: 'FROZEN summary' } },
  }
}

// One fake page object: matches the single page the (section-less) fixtures plan, so the
// runtime page-count guard (lib/pdf/render-with-page-guard.ts) sees no drift in the tests
// that are not about it.
const ONE_PAGE_PDF = Buffer.from('<< /Type /Page /Parent 1 0 R >>')

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadEvidence.mockReset()
  mockRenderToBuffer.mockResolvedValue(ONE_PAGE_PDF)
})

describe('renderEstimatePdf (PDFPAR-04)', () => {
  it('selects EstimatePDFModern when company.estimate_template_style is "modern"', async () => {
    mockGetEstimate.mockResolvedValue(baseContext({ templateStyle: 'modern' }) as never)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockCreateElement.mock.calls[0][0]).toBe(EstimatePDFModern)
    expect(mockCreateElement.mock.calls[0][0]).not.toBe(EstimatePDF)
  })

  it('defaults to EstimatePDF (classic) when estimate_template_style is unset/invalid', async () => {
    mockGetEstimate.mockResolvedValue(baseContext({ templateStyle: 'nonsense' }) as never)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockCreateElement.mock.calls[0][0]).toBe(EstimatePDF)
  })

  it.each(['classic', 'modern'])('passes the frozen document and its certificate to the %s PDF', async (template) => {
    mockRenderToBuffer.mockResolvedValue(Buffer.from('<< /Type /Page >>\n<< /Type /Page >>'))
    mockGetEstimate.mockResolvedValue(signedContext(template) as never)
    mockLoadEvidence.mockResolvedValue(EVIDENCE)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockCreateElement.mock.calls[0][1]).toMatchObject({
      estimate: { summary: 'FROZEN summary' },
      company: { name: 'Frozen Company' }, projectName: 'Frozen Project',
      preparedBy: 'Frozen Preparer', signature: SIGNATURE, signatureEvidence: EVIDENCE,
    })
    expect(mockLoadEvidence).toHaveBeenCalledWith(expect.anything(), 'est-1', 'sig-1')
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1)
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

    await resolveEstimatePdfContext('est-1', makeSupabase())

    expect(mockRenderToBuffer).not.toHaveBeenCalled()
  })

  it('renderEstimatePdf accepts a pre-resolved context and skips re-fetching', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
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

  it('propagates a certificate read failure instead of exporting incomplete evidence', async () => {
    mockGetEstimate.mockResolvedValue(signedContext() as never)
    mockLoadEvidence.mockRejectedValue(new Error('Evidence read failed'))
    await expect(renderEstimatePdf('est-1', makeSupabase())).rejects.toThrow('Evidence read failed')
    expect(mockRenderToBuffer).not.toHaveBeenCalled()
  })

  it.each([null, { ...EVIDENCE, integrity: 'mismatch' as const }])('rejects missing or mismatched certificate evidence', async (evidence) => {
    mockGetEstimate.mockResolvedValue(signedContext() as never)
    mockLoadEvidence.mockResolvedValue(evidence)
    await expect(resolveEstimatePdfContext('est-1', makeSupabase())).rejects.toThrow('Could not verify the estimate signature evidence')
  })
})

describe('renderEstimatePdf — runtime page-count guard', () => {
  it('a render whose real page count differs from the plan is retried with +48pt then +96pt margins, each drift reported to Sentry without PII, and the last render is returned', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    const drifted = Buffer.from('<< /Type /Page >> << /Type /Page >> << /Type /Page >>') // 3 real pages vs 1 planned
    mockRenderToBuffer.mockResolvedValue(drifted)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await renderEstimatePdf('est-1', makeSupabase())

    expect(mockRenderToBuffer).toHaveBeenCalledTimes(3)
    expect(result?.buffer.equals(drifted)).toBe(true)
    expect(captureMessage).toHaveBeenCalledTimes(3)
    const calls = captureMessage.mock.calls.map((c) => c[1])
    expect(calls.map((c) => c.tags.attempt)).toEqual(['1', '2', '3'])
    expect(calls.map((c) => c.extra.extraSafetyMarginPt)).toEqual([0, 48, 96])
    for (const c of calls) {
      expect(c.level).toBe('warning')
      expect(c.tags).toMatchObject({ estimate_id: 'est-1', template_id: 'classic', language: 'en' })
      expect(c.extra).toMatchObject({ plannedPages: 1, realPages: 3 })
      // ids / counts only: nothing from the estimate content (project name, owner, totals) leaks
      expect(JSON.stringify(c)).not.toMatch(/Kitchen Reno|Owner Name|1000/)
    }
    warn.mockRestore()
  })

  it('a render that matches its plan is rendered once and reports nothing', async () => {
    mockGetEstimate.mockResolvedValue(baseContext() as never)
    await renderEstimatePdf('est-1', makeSupabase())
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1)
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
