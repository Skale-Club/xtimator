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
vi.mock('@/lib/queries/share', () => ({ loadLatestSignedSnapshot: vi.fn() }))
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
import { resolveEstimatePdfContext, renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { loadLatestSignedSnapshot } from '@/lib/queries/share'
import { renderToBuffer } from '@react-pdf/renderer'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockLoadSnapshot = vi.mocked(loadLatestSignedSnapshot)
const mockCreateElement = vi.mocked(createElement)
const mockRenderToBuffer = vi.mocked(renderToBuffer)

function makeSupabase() {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed/photo.jpg' },
          error: null,
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

  it('pre-resolves attached photo signed URLs before createElement is called', async () => {
    mockGetEstimate.mockResolvedValue({
      ...baseContext(),
      estimate: { ...BASE_ESTIMATE, attachedPhotos: [{ id: 'p1', storage_path: 'co-1/p1.jpg', caption: 'Before' }] },
    } as never)
    mockLoadSnapshot.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    const passedProps = mockCreateElement.mock.calls[0][1] as {
      attachedPhotos: { url: string; caption: string | null }[]
    }
    expect(passedProps.attachedPhotos).toEqual([{ url: 'https://signed/photo.jpg', caption: 'Before' }])
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
})
