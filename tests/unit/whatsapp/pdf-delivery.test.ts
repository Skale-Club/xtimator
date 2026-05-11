import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the heavy deps that pdf-delivery.ts will use
vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
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

// Import after mocks
import { generateAndUploadEstimatePDF, buildPdfFilename } from '@/lib/whatsapp/pdf-delivery'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { renderToBuffer } from '@react-pdf/renderer'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockRenderToBuffer = vi.mocked(renderToBuffer)

const ESTIMATE_ID = 'estimate-1'
const COMPANY_ID = 'company-1'

const MOCK_ESTIMATE_CONTEXT = {
  estimate: { id: ESTIMATE_ID, sections: [] } as never,
  project: { name: 'Kitchen Reno', project_type: 'renovation', client: null } as never,
  company: { id: COMPANY_ID, name: 'Acme Builders' } as never,
}

function makeSupabase(overrides: { uploadError?: object; signedUrl?: string | null } = {}) {
  const uploadMock = vi.fn().mockResolvedValue({ error: overrides.uploadError ?? null })
  // Use 'signedUrl' in overrides to distinguish explicit null from missing key
  const resolvedSignedUrl = 'signedUrl' in overrides
    ? overrides.signedUrl
    : 'https://supabase.co/storage/v1/sign/pdfs/path.pdf?token=abc'
  const createSignedUrlMock = vi.fn().mockResolvedValue({
    data: resolvedSignedUrl !== null ? { signedUrl: resolvedSignedUrl } : null,
    error: null,
  })
  const storage = {
    from: vi.fn().mockReturnValue({
      upload: uploadMock,
      createSignedUrl: createSignedUrlMock,
    }),
  }
  return { storage } as never
}

describe('generateAndUploadEstimatePDF', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRenderToBuffer.mockResolvedValue(Buffer.from('mock-pdf'))
  })

  it('returns signedUrl and filename on success (WAPDF-02)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase()

    const result = await generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase, 'Johnson')

    expect(result.signedUrl).toMatch(/https:\/\//)
    expect(result.filename).toMatch(/^Estimate-Johnson-\d{4}-\d{2}-\d{2}\.pdf$/)
  })

  it('throws when storage upload fails — caller can catch and fall back (WAPDF-04)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase({ uploadError: { message: 'Bucket full' } })

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase, null)
    ).rejects.toThrow('PDF upload failed')
  })

  it('throws when signedUrl creation fails (WAPDF-04)', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase({ signedUrl: null })

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase, null)
    ).rejects.toThrow('signed URL')
  })

  it('throws when estimate not found', async () => {
    mockGetEstimate.mockResolvedValue(null)
    const supabase = makeSupabase()

    await expect(
      generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase, null)
    ).rejects.toThrow()
  })

  it('uploads to pdfs bucket with path prefixed by companyId/whatsapp-pdf/', async () => {
    mockGetEstimate.mockResolvedValue(MOCK_ESTIMATE_CONTEXT)
    const supabase = makeSupabase()

    await generateAndUploadEstimatePDF(ESTIMATE_ID, COMPANY_ID, supabase, null)

    const fromCall = supabase.storage.from.mock.calls[0][0]
    expect(fromCall).toBe('pdfs')
    const uploadCall = supabase.storage.from().upload.mock.calls[0][0] as string
    expect(uploadCall).toMatch(new RegExp(`^${COMPANY_ID}/whatsapp-pdf/${ESTIMATE_ID}-\\d+\\.pdf$`))
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
