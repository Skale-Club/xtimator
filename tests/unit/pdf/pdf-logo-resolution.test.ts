// @vitest-environment node
//
// Phase 190 Plan 03 (URL-03) — the PDF renderer must resolve company.logo_url
// BEFORE it measures the header, and the SAME company object must reach
// computeEstimatePageConstraints, blocksFromModel and createElement.
//
// Why that three-way identity is the core assertion (B4):
// measure-header-height.ts:111 charges 64-72pt of header height purely on
// company.logo_url being TRUTHY. If measurement saw a logo and rendering did
// not (or vice versa), every page break in the document would shift silently.
//
// What this file deliberately does NOT assert: that a logo is VISIBLE in the
// output. All four `logos` writers store WebP and @react-pdf/image decodes only
// jpg/jpeg/png, so no company logo has ever rendered in a PDF — a pre-existing
// product bug recorded as follow-up PDF-LOGO-01, neither caused nor fixed here.
//
// `node` environment: renderEstimatePdf resolves photo signed URLs through
// serverStorage() -> assertServer(), which throws whenever `window` exists
// (same reason as render-estimate-pdf-resolver.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
vi.mock('@/lib/storage/asset-inline', () => ({ resolveAssetForRenderer: vi.fn() }))
vi.mock('@/lib/estimate/pagination/page-constraints', () => ({
  computeEstimatePageConstraints: vi.fn().mockReturnValue({
    contentHeightPt: 600,
    continuationTableHeaderHeightPt: 22,
    safetyMarginPt: 100,
  }),
}))
vi.mock('@/lib/estimate/pagination/blocks-from-model', () => ({
  blocksFromModel: vi.fn().mockReturnValue([]),
}))

import { createElement } from 'react'
import { resolveEstimatePdfContext, renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { loadLatestSignedSnapshot } from '@/lib/queries/estimate-signature'
import { resolveAssetForRenderer } from '@/lib/storage/asset-inline'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'

const mockGetEstimate = vi.mocked(getEstimateWithContext)
const mockLoadSnapshot = vi.mocked(loadLatestSignedSnapshot)
const mockCreateElement = vi.mocked(createElement)
const mockResolveAsset = vi.mocked(resolveAssetForRenderer)
const mockConstraints = vi.mocked(computeEstimatePageConstraints)
const mockBlocks = vi.mocked(blocksFromModel)

const RELATIVE_LOGO = '/storage/logos/11111111-2222-3333-4444-555555555555/logo.webp'
const LEGACY_ABSOLUTE =
  'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/co-1/logo.webp'
const DATA_URI = 'data:image/webp;base64,AAAA'

const BASE_ESTIMATE = {
  id: 'est-1',
  company_id: 'co-1',
  created_by_user_id: null,
  language: 'en' as const,
  updated_at: '2026-01-01T00:00:00Z',
  summary: 'live summary',
  total: 1000,
  attachedPhotos: [] as { id: string; storage_path: string; caption: string | null }[],
  sections: [] as unknown[],
  presentation_settings: null,
}

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

function contextWithLogo(logoUrl: string | null, estimateOverrides: object = {}) {
  return {
    estimate: { ...BASE_ESTIMATE, ...estimateOverrides },
    project: { name: 'Kitchen Reno', project_type: null, client: null },
    company: {
      id: 'co-1',
      owner_name: 'Owner Name',
      estimate_template_style: 'classic',
      logo_url: logoUrl,
    },
  }
}

/** The company object each of the three downstream consumers actually received. */
function companiesSeenDownstream() {
  return {
    constraints: mockConstraints.mock.calls[0][0] as { logo_url: string | null },
    blocks: (mockBlocks.mock.calls[0][0] as { company: { logo_url: string | null } }).company,
    element: (mockCreateElement.mock.calls[0][1] as { company: { logo_url: string | null } })
      .company,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadSnapshot.mockResolvedValue(null)
  mockConstraints.mockReturnValue({
    contentHeightPt: 600,
    continuationTableHeaderHeightPt: 22,
    safetyMarginPt: 100,
  })
  mockBlocks.mockReturnValue([])
})

describe('renderEstimatePdf — company logo resolution (URL-03)', () => {
  it('resolves a same-origin logo path to a data URI at all three downstream call sites', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(DATA_URI)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockResolveAsset).toHaveBeenCalledWith(RELATIVE_LOGO)
    const seen = companiesSeenDownstream()
    expect(seen.constraints.logo_url).toBe(DATA_URI)
    expect(seen.blocks.logo_url).toBe(DATA_URI)
    expect(seen.element.logo_url).toBe(DATA_URI)
  })

  it('THE CORE GUARANTEE: the SAME company object reaches constraints, blocks and createElement (resolved case)', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(DATA_URI)

    await renderEstimatePdf('est-1', makeSupabase())

    const seen = companiesSeenDownstream()
    expect(seen.blocks).toBe(seen.constraints)
    expect(seen.element).toBe(seen.constraints)
  })

  it('THE CORE GUARANTEE: the SAME company object reaches all three when resolution FAILS', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    const seen = companiesSeenDownstream()
    expect(seen.blocks).toBe(seen.constraints)
    expect(seen.element).toBe(seen.constraints)
    expect(seen.constraints.logo_url).toBeNull()
    expect(seen.blocks.logo_url).toBeNull()
    expect(seen.element.logo_url).toBeNull()
  })

  it('never lets the raw same-origin path reach react-pdf (it cannot fetch a relative URL)', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    const seen = companiesSeenDownstream()
    expect(seen.element.logo_url).not.toBe(RELATIVE_LOGO)
  })

  it('passes an existing absolute *.supabase.co logo through unchanged (no regression for existing rows)', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(LEGACY_ABSOLUTE) as never)
    mockResolveAsset.mockResolvedValue(LEGACY_ABSOLUTE)

    await renderEstimatePdf('est-1', makeSupabase())

    const seen = companiesSeenDownstream()
    expect(seen.element).toEqual({
      id: 'co-1',
      owner_name: 'Owner Name',
      estimate_template_style: 'classic',
      logo_url: LEGACY_ABSOLUTE,
    })
  })

  it('calls the resolver exactly once even when logo_url is null — no conditional short-circuit to drift', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(null) as never)
    mockResolveAsset.mockResolvedValue(null)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockResolveAsset).toHaveBeenCalledTimes(1)
    expect(mockResolveAsset).toHaveBeenCalledWith(null)
    expect(companiesSeenDownstream().element.logo_url).toBeNull()
  })

  it('still returns a PDF buffer when the logo fails to resolve (a broken image never costs the user the document)', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(null)

    const result = await renderEstimatePdf('est-1', makeSupabase())

    expect(result?.buffer).toBeInstanceOf(Buffer)
  })

  it('resolves BEFORE header measurement — constraints never see the unresolved value', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)
    mockResolveAsset.mockResolvedValue(DATA_URI)

    await renderEstimatePdf('est-1', makeSupabase())

    expect(mockResolveAsset.mock.invocationCallOrder[0]).toBeLessThan(
      mockConstraints.mock.invocationCallOrder[0],
    )
  })
})

describe('renderEstimatePdf — tenant photos are untouched', () => {
  it('keeps attached photos on short-lived signed URLs and never inlines them', async () => {
    mockGetEstimate.mockResolvedValue(
      contextWithLogo(RELATIVE_LOGO, {
        attachedPhotos: [{ id: 'p1', storage_path: 'co-1/p1.jpg', caption: 'Before' }],
      }) as never,
    )
    mockResolveAsset.mockResolvedValue(DATA_URI)

    await renderEstimatePdf('est-1', makeSupabase())

    const props = mockCreateElement.mock.calls[0][1] as {
      attachedPhotos: { url: string; caption: string | null }[]
    }
    expect(props.attachedPhotos).toEqual([{ url: 'https://signed/photo.jpg', caption: 'Before' }])
    // The resolver saw the logo and nothing else — no photo path was inlined.
    expect(mockResolveAsset).toHaveBeenCalledTimes(1)
    expect(mockResolveAsset).toHaveBeenCalledWith(RELATIVE_LOGO)
  })
})

describe('resolveEstimatePdfContext — the cheap ETag path is unchanged', () => {
  it('does not resolve any asset (an object read there would defeat the 304 short-circuit)', async () => {
    mockGetEstimate.mockResolvedValue(contextWithLogo(RELATIVE_LOGO) as never)

    const context = await resolveEstimatePdfContext('est-1', makeSupabase())

    expect(mockResolveAsset).not.toHaveBeenCalled()
    expect(context?.company.logo_url).toBe(RELATIVE_LOGO)
  })
})

describe('W3 — paginated-preview parity is documented at BOTH call sites', () => {
  const root = process.cwd()

  it('both computeEstimatePageConstraints callers carry the Phase 190 parity note', () => {
    const pdfSource = readFileSync(resolve(root, 'lib/pdf/render-estimate-pdf.ts'), 'utf8')
    const hookSource = readFileSync(
      resolve(root, 'components/workspace/estimate/use-paginated-preview.ts'),
      'utf8',
    )

    for (const src of [pdfSource, hookSource]) {
      expect(src).toMatch(/Parity note \(Phase 190\)/)
      expect(src).toMatch(/TRUTHINESS/)
    }
  })
})
