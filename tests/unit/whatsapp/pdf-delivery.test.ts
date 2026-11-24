// @vitest-environment node
//
// Phase 188 Plan 03 (PROV-01): generateAndUploadEstimatePDF now resolves
// storage via serverStorage() -> assertServer(), which throws whenever
// `typeof window !== 'undefined'`. The suite's global environment is jsdom
// (vitest.config.ts), where `window` always exists, so this spuriously trips
// in every test here unless this file opts into the `node` environment (same
// fix as tests/unit/storage/server-provider.test.ts from Plan 01). This test
// intentionally does NOT mock @/lib/storage/server — it mocks the Supabase
// client's storage.from() so the real serverStorage(client) delegation path
// (Supabase mode) is exercised end-to-end.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the heavy deps that pdf-delivery.ts will use
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('<< /Type /Page /Parent 1 0 R >>')),
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, createElement: vi.fn().mockReturnValue('mock-element') }
})

vi.mock('@/lib/queries/estimate', () => ({
  getEstimateWithContext: vi.fn(),
}))

vi.mock('@/components/pdf/estimate-pdf', () => ({
  default: vi.fn(),
}))

// PDFPAR-04: pdf-delivery.ts now goes through the shared renderEstimatePdf()
// resolver (lib/pdf/render-estimate-pdf.ts), which transitively imports these
// modules — mirrors tests/unit/pdf/render-estimate-pdf-resolver.test.ts's
// mocking shape from Plan 182-03.
vi.mock('@/lib/queries/estimate-signature', () => ({
  loadLatestSignedSnapshot: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
  }),
}))
vi.mock('@/components/pdf/estimate-pdf-modern', () => ({ default: vi.fn(() => null) }))

// Import after mocks
import { generateAndUploadEstimatePDF, buildPdfFilename } from '@/lib/whatsapp/pdf-delivery'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockRenderToBuffer = vi.mocked(renderToBuffer)

const ESTIMATE_ID = 'estimate-1'
const COMPANY_ID = 'company-1'

const MOCK_ESTIMATE_CONTEXT = {
  estimate: {
    id: ESTIMATE_ID, project_id: 'project-1', company_id: COMPANY_ID, version: 1, estimate_seq: 1,
    estimate_number: null, estimate_date: null, is_current: true, share_token: 'share-test', public_slug_token: null,
    status: 'draft', language: 'en', currency_code: 'USD', summary: null, notes: null, timeline: null,
    payment_terms: null, warranty_terms: null, subtotal: 0, discount_type: null, discount_value: 0,
    discount_amount: 0, tax_rate: 0, tax_amount: 0, total: 0, deposit_type: 'none', deposit_value: null,
    balance_due: null, sent_at: null, viewed_at: null, responded_at: null, view_count: 0, last_viewed_at: null,
    share_password_hash: null, share_password_set_at: null, client_response: null, created_by_user_id: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    presentation_settings: null, sections: [], attachedPhotos: [],
  },
  project: { name: 'Kitchen Reno', project_type: 'renovation', client: null },
  company: {
    name: 'Acme Builders', owner_name: null, phone: null, email: null, website: null, address: null,
    city: null, state: null, zip: null, logo_url: null, brand_primary_color: null,
    estimate_terms_enabled: false, estimate_terms_text: null, estimate_template_style: 'classic',
  },
  signatureRow: null,
} satisfies NonNullable<Awaited<ReturnType<typeof getEstimateWithContext>>>

type MockSupabase = {
  storage: {
    from: ReturnType<typeof vi.fn> & {
      (): { upload: ReturnType<typeof vi.fn>; createSignedUrl: ReturnType<typeof vi.fn> }
    }
  }
}

function makeSupabase(overrides: { uploadError?: object; signedUrl?: string | null } = {}): MockSupabase {
  const uploadMock = vi.fn().mockResolvedValue({
    data: overrides.uploadError ? null : { path: 'mock-path' },
    error: overrides.uploadError ?? null,
  })
  // Use 'signedUrl' in overrides to distinguish explicit null from missing key
  const resolvedSignedUrl = 'signedUrl' in overrides
    ? overrides.signedUrl
    : 'https://supabase.co/storage/v1/sign/pdfs/path.pdf?token=abc'
  const createSignedUrlMock = vi.fn().mockResolvedValue({
    data: resolvedSignedUrl !== null ? { signedUrl: resolvedSignedUrl } : null,
    error: resolvedSignedUrl !== null ? null : { message: 'no signed URL' },
  })
  const storage = {
    from: vi.fn().mockReturnValue({
      upload: uploadMock,
      createSignedUrl: createSignedUrlMock,
    }),
  }
  return { storage } as unknown as MockSupabase
}

describe('generateAndUploadEstimatePDF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRenderToBuffer.mockResolvedValue(Buffer.from('<< /Type /Page /Parent 1 0 R >>'))
  })

  it('returns signedUrl and filename on success (WAPDF-02)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase()

    const result = await generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, 'Johnson')

    expect(result.signedUrl).toMatch(/https:\/\//)
    expect(result.filename).toMatch(/^Estimate-Johnson-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it('throws when storage upload fails — caller can catch and fall back (WAPDF-04)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase({ uploadError: { message: 'Bucket full' } })

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, null)
    ).rejects.toThrow('PDF upload failed')
  })

  it('throws when signedUrl creation fails (WAPDF-04)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase({ signedUrl: null })

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, null)
    ).rejects.toThrow('signed URL')
  })

  it('throws when estimate not found', async () => {
    mockGetEstimate.mockResolvedValue(null)
    const supabase = makeSupabase()

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, null)
    ).rejects.toThrow()
  })

  it('uploads to pdfs bucket with path prefixed by companyId/whatsapp-pdf/', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase()

    await generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, null)

    const fromCall = supabase.storage.from.mock.calls[0][0]
    expect(fromCall).toBe('pdfs')
    const uploadCall = supabase.storage.from().upload.mock.calls[0][0] as string
    expect(uploadCall).toMatch(new RegExp(`^${COMPANY_ID}/whatsapp-pdf/${ESTIMATE_ID}-\\d+\\.pdf$`))
  })

  it('resolves via the shared renderEstimatePdf resolver — template selection is exercised (PDFPAR-04)', async () => {
    mockGetEstimate.mockResolvedValue({
      ...MOCK_ESTIMATE_CONTEXT,
      company: { ...MOCK_ESTIMATE_CONTEXT.company, estimate_template_style: 'modern' },
    })
    const supabase = makeSupabase()

    await generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase as unknown as SupabaseClient, 'Johnson')

    // If the resolver's template-registry lookup runs, createElement/renderToBuffer
    // are still called exactly once — this proves the resolver path executed
    // end-to-end rather than throwing before reaching the mocked render.
    expect(mockRenderToBuffer).toHaveBeenCalledTimes(1)
  })
})

describe('buildPdfFilename', () => {
  it('returns Estimate-ClientName-YYYY-MM-DD.pdf with sanitized name', () => {
    const date = new Date('2026-05-11T12:00:00Z')
    expect(buildPdfFilename('Maria Silva', date)).toBe('Estimate-Maria-Silva-2026-05-11.pdf')
  })

  it('strips special characters from client name', () => {
    const date = new Date('2026-05-11T12:00:00Z')
    expect(buildPdfFilename("O'Brien & Sons!", date)).toBe('Estimate-OBrien--Sons-2026-05-11.pdf')
  })

  it('returns Estimate-YYYY-MM-DD.pdf when clientName is null', () => {
    const date = new Date('2026-05-11T12:00:00Z')
    expect(buildPdfFilename(null, date)).toBe('Estimate-2026-05-11.pdf')
  })

  it('truncates client name to 30 characters', () => {
    const date = new Date('2026-05-11T12:00:00Z')
    const longName = 'A'.repeat(40)
    const result = buildPdfFilename(longName, date)
    const namePart = result.replace('Estimate-', '').replace('-2026-05-11.pdf', '')
    expect(namePart.length).toBeLessThanOrEqual(30)
  })
})
