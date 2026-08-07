import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Phase 190 Plan 04 — the EXECUTABLE form of Phase 187's second deferred
 * exclusion, "no share-token path".
 *
 * That exclusion is closed by CONSTRAINT, not by widening the proxy. A persisted
 * relative URL carries no credential, so it is only safe for objects whose
 * eventual viewer can resolve it with whatever session they have — which for an
 * anonymous share-page visitor is no session at all. This file asserts that
 * property directly instead of trusting a docblock:
 *
 *   1. Every bucket in PERSISTABLE_PROXY_BUCKETS is either publicly readable
 *      through the proxy, or is documented HERE as rendered only on
 *      authenticated surfaces — with file paths that must exist on disk.
 *   2. An anonymous GET against the real route resolves both public-bucket key
 *      shapes (the anonymous share page and the anonymous landing page / email
 *      client), and is refused with 404 — never 403 — on the real, timestamped
 *      private price-book key shape.
 *   3. Share-page tenant job-site photos are still absolute, server-side signed
 *      URLs and are NEVER a persisted /storage/ proxy path.
 *
 * Route mocking mirrors tests/unit/api/storage-proxy-route.test.ts (Phase 187
 * Plan 03), with ONE deliberate difference: `canReadPrivateKey` is NOT mocked
 * here. The whole point of this suite is the anonymous/non-member/member
 * distinction, so the real gate runs against mocked `getAuthClaims` +
 * `createClient`.
 */

// ── I/O boundaries only. proxy-policy.ts and proxy-auth.ts are the contract. ──
vi.mock('@/lib/storage/asset-source', () => ({
  fetchStoredAsset: vi.fn(),
}))
vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Share-query boundaries.
const { serviceClientMock, getSignedUrlMock } = vi.hoisted(() => ({
  serviceClientMock: { from: vi.fn() },
  getSignedUrlMock: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => serviceClientMock,
}))
vi.mock('@/lib/storage/server', () => ({
  serverStorage: () => ({ getSignedUrl: getSignedUrlMock }),
}))

import React from 'react'
import { render } from '@testing-library/react'
import { GET } from '@/app/storage/[bucket]/[...key]/route'
import { fetchStoredAsset } from '@/lib/storage/asset-source'
import { getAuthClaims } from '@/lib/queries/auth'
import { createClient } from '@/lib/supabase/server'
import { PERSISTABLE_PROXY_BUCKETS, isStorageProxyPath } from '@/lib/storage/asset-url'
import { isPubliclyReadableBucket, type ProxyBucket } from '@/lib/storage/proxy-policy'
import { getEstimateByShareToken } from '@/lib/queries/share'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentCompany,
} from '@/components/workspace/estimate/estimate-document'
import { EstimateDocumentModern } from '@/components/share/estimate-document-modern'
import {
  buildFixtureEstimate,
  toFixtureDocumentData,
  FIXTURE_COMPANY,
} from '../estimate/fixtures/document-fixtures'

// ── Real production key shapes. Do NOT simplify these. ───────────────────────
const COMPANY_UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const ITEM_UUID = 'b7c8d9e0-f1a2-4b34-c567-890123456789'
/** lib/actions/settings.ts hard-codes `${company.id}/logo.webp` — NOT buildStorageKey. */
const LOGO_KEY = [COMPANY_UUID, 'logo.webp']
/** app/admin/branding/actions.ts — a flat, timestamped platform-brand key. */
const PLATFORM_BRAND_KEY = ['logo-1777861695749.webp']
/** buildStorageKey emits `${companyId}/${type}/${Date.now()}-${file}` — the
 *  millisecond segment is load-bearing; a literal without it is not what
 *  lib/actions/price-book.ts writes. */
const PRICE_BOOK_KEY = [COMPANY_UUID, 'price-book', `1784854705622-${ITEM_UUID}.webp`]

/**
 * The point of this whole file: the executable justification for every
 * persistable bucket that is NOT publicly readable.
 *
 * Adding a bucket to PERSISTABLE_PROXY_BUCKETS without either making it
 * publicly readable or adding a row here (with real, existing file paths)
 * fails this suite.
 */
const AUTHENTICATED_ONLY_PERSISTED = {
  photos: {
    why: 'company_price_book.image_url only. Rendered exclusively on authenticated app surfaces.',
    renderedOn: [
      'components/price-book/price-book-list.tsx',
      'components/price-book/price-book-item-dialog.tsx',
      'components/trash/trash-list.tsx',
    ],
  },
} as const

function makeParams(bucket: string, key: string[]) {
  return { params: Promise.resolve({ bucket, key }) }
}

function makeAsset(contentType = 'image/webp') {
  return {
    body: new Blob(['bytes'], { type: contentType }),
    contentType,
    contentLength: undefined,
    source: 'supabase' as const,
  }
}

/** Installs the membership lookup canReadPrivateKey performs under RLS. */
function installMembership(rows: string[]) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: (_c1: string, _v1: string) => ({
          eq: (_c2: string, companyId: string) => ({
            maybeSingle: async () => ({
              data: rows.includes(companyId) ? { company_id: companyId } : null,
            }),
          }),
        }),
      }),
    }),
  } as never)
}

describe('W2 — the company logo does not route a same-origin path through /_next/image', () => {
  const data = toFixtureDocumentData(buildFixtureEstimate()) as unknown as EstimateDocumentData

  function renderModern(logoUrl: string | null) {
    return render(
      React.createElement(EstimateDocumentModern, {
        data,
        company: { ...FIXTURE_COMPANY, logo_url: logoUrl } as DocumentCompany,
        client: null,
        projectName: 'Test Project',
        projectType: null,
        estimateVersion: 1,
        estimateCreatedAt: '2026-01-01T00:00:00Z',
      }),
    )
  }

  function renderClassic(logoUrl: string | null) {
    return render(
      React.createElement(EstimateDocument, {
        mode: 'view',
        data,
        company: { ...FIXTURE_COMPANY, logo_url: logoUrl } as DocumentCompany,
        client: null,
        projectName: 'Test Project',
        projectType: null,
        estimateVersion: 1,
        estimateCreatedAt: '2026-01-01T00:00:00Z',
      } as never),
    )
  }

  const RELATIVE_LOGO = `/storage/logos/${COMPANY_UUID}/logo.webp`
  const ABSOLUTE_LOGO =
    'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/x/logo.webp'

  function logoImg(container: HTMLElement): HTMLImageElement {
    const img = container.querySelector(`img[alt="${FIXTURE_COMPANY.name}"]`)
    expect(img, 'the company logo <img> should be rendered').not.toBeNull()
    return img as HTMLImageElement
  }

  it('share page (anonymous surface): a relative /storage/ logo renders as the raw path', () => {
    const { container } = renderModern(RELATIVE_LOGO)
    const src = logoImg(container).getAttribute('src')

    expect(src).toBe(RELATIVE_LOGO)
    expect(src).not.toMatch(/^\/_next\/image/)
  })

  it('workspace editor: a relative /storage/ logo renders as the raw path', () => {
    const { container } = renderClassic(RELATIVE_LOGO)
    const src = logoImg(container).getAttribute('src')

    expect(src).toBe(RELATIVE_LOGO)
    expect(src).not.toMatch(/^\/_next\/image/)
  })

  it('an existing absolute *.supabase.co logo still renders on both surfaces (no regression)', () => {
    const modern = renderModern(ABSOLUTE_LOGO)
    expect(logoImg(modern.container).getAttribute('src')).toBe(ABSOLUTE_LOGO)
    modern.unmount()

    const classic = renderClassic(ABSOLUTE_LOGO)
    expect(logoImg(classic.container).getAttribute('src')).toBe(ABSOLUTE_LOGO)
  })

  it('no logo at all renders no <img> (unchanged)', () => {
    const { container } = renderModern(null)
    expect(container.querySelector(`img[alt="${FIXTURE_COMPANY.name}"]`)).toBeNull()
  })
})

describe('INVARIANT — every persistable bucket has a resolvable anonymous story', () => {
  it('each PERSISTABLE_PROXY_BUCKETS entry is publicly readable OR documented as authenticated-only', () => {
    const undocumented: string[] = []

    for (const bucket of PERSISTABLE_PROXY_BUCKETS) {
      if (isPubliclyReadableBucket(bucket as ProxyBucket)) continue
      const entry = (AUTHENTICATED_ONLY_PERSISTED as Record<string, { renderedOn: readonly string[] }>)[
        bucket
      ]
      if (!entry || entry.renderedOn.length === 0) undocumented.push(bucket)
    }

    expect(
      undocumented,
      'A bucket may only be PERSISTED as a bare same-origin path if an anonymous ' +
        'viewer can resolve it (publicly readable), or if it is never rendered ' +
        'anonymously — in which case add it to AUTHENTICATED_ONLY_PERSISTED with the ' +
        'exact surfaces that render it.',
    ).toEqual([])
  })

  it('every documented authenticated-only surface file EXISTS on disk', () => {
    const missing: string[] = []
    for (const [bucket, entry] of Object.entries(AUTHENTICATED_ONLY_PERSISTED)) {
      for (const path of entry.renderedOn) {
        if (!existsSync(resolve(process.cwd(), path))) missing.push(`${bucket}: ${path}`)
      }
    }
    expect(missing, 'a stale justification is a failure, not a comment').toEqual([])
  })

  it('AUTHENTICATED_ONLY_PERSISTED never lists a publicly readable bucket (it would be dead prose)', () => {
    for (const bucket of Object.keys(AUTHENTICATED_ONLY_PERSISTED)) {
      expect(isPubliclyReadableBucket(bucket as ProxyBucket)).toBe(false)
    }
  })
})

describe('ANONYMOUS reads through the real proxy route', () => {
  beforeEach(() => {
    vi.mocked(fetchStoredAsset).mockReset()
    vi.mocked(getAuthClaims).mockReset()
    vi.mocked(createClient).mockReset()
  })

  it('anonymous GET /storage/logos/{uuid}/logo.webp -> 200 (the share-page case)', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset())

    const res = await GET(
      new Request(`http://localhost/storage/logos/${LOGO_KEY.join('/')}`),
      makeParams('logos', [...LOGO_KEY]),
    )

    expect(res.status).toBe(200)
    expect(fetchStoredAsset).toHaveBeenCalledWith('logos', LOGO_KEY.join('/'))
    // No session was consulted at all — the public bucket skips the gate.
    expect(createClient).not.toHaveBeenCalled()
  })

  it('anonymous GET /storage/platform-brand/logo-1777861695749.webp -> 200 (landing page / mail client)', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset())

    const res = await GET(
      new Request(`http://localhost/storage/platform-brand/${PLATFORM_BRAND_KEY.join('/')}`),
      makeParams('platform-brand', [...PLATFORM_BRAND_KEY]),
    )

    expect(res.status).toBe(200)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('anonymous GET of the REAL timestamped private price-book key -> 404, never 403, no read', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue(null as never)

    const res = await GET(
      new Request(`http://localhost/storage/photos/${PRICE_BOOK_KEY.join('/')}`),
      makeParams('photos', [...PRICE_BOOK_KEY]),
    )

    expect(res.status).toBe(404)
    expect(res.status).not.toBe(403)
    expect(await res.text()).toBe('Not found')
    expect(fetchStoredAsset).not.toHaveBeenCalled()
  })

  it('AUTHENTICATED NON-MEMBER on the same price-book key -> 404, no read', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-outsider' } as never)
    installMembership([]) // belongs to no company

    const res = await GET(
      new Request(`http://localhost/storage/photos/${PRICE_BOOK_KEY.join('/')}`),
      makeParams('photos', [...PRICE_BOOK_KEY]),
    )

    expect(res.status).toBe(404)
    expect(fetchStoredAsset).not.toHaveBeenCalled()
  })

  it('AUTHENTICATED MEMBER on the same price-book key -> 200', async () => {
    vi.mocked(getAuthClaims).mockResolvedValue({ sub: 'user-member' } as never)
    installMembership([COMPANY_UUID])
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset())

    const res = await GET(
      new Request(`http://localhost/storage/photos/${PRICE_BOOK_KEY.join('/')}`),
      makeParams('photos', [...PRICE_BOOK_KEY]),
    )

    expect(res.status).toBe(200)
    expect(fetchStoredAsset).toHaveBeenCalledWith('photos', PRICE_BOOK_KEY.join('/'))
    // Tenant-private: never cached publicly.
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('SHARE PAGE resolution — tenant photos stay signed, the company logo stays relative', () => {
  const SIGNED_URL =
    'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/sign/photos/x.webp?token=PLACEHOLDER'
  const RELATIVE_COMPANY_LOGO = `/storage/logos/${COMPANY_UUID}/logo.webp`

  type AnyRow = Record<string, unknown>

  function installShareMock(companyLogoUrl: string | null, photos: AnyRow[]) {
    serviceClientMock.from.mockImplementation((table: string) => {
      if (table === 'estimates') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'e1',
                  project_id: 'p1',
                  company_id: COMPANY_UUID,
                  total: 100,
                  currency_code: 'USD',
                  summary: 'Job summary',
                  share_token: 'tok-SECRET',
                  share_expires_at: null,
                  payment_status: 'unpaid',
                },
              }),
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }
      }
      if (table === 'estimate_photos') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: photos.map((p, i) => ({ sort_order: i, photo: p })),
              }),
            }),
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  name: 'Kitchen Remodel',
                  project_type: null,
                  client: {
                    name: 'Client',
                    email: 'c@x.co',
                    phone: null,
                    address: null,
                    city: null,
                    state: null,
                    zip: null,
                  },
                },
              }),
            }),
          }),
        }
      }
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: COMPANY_UUID,
                  name: 'Co',
                  owner_name: 'Owner',
                  phone: null,
                  email: null,
                  website: null,
                  address: null,
                  city: null,
                  state: null,
                  zip: null,
                  logo_url: companyLogoUrl,
                  brand_primary_color: null,
                  stripe_account_id: null,
                  stripe_connect_status: null,
                  digital_signature_enabled: false,
                  estimate_terms_enabled: false,
                  estimate_terms_text: null,
                },
              }),
            }),
          }),
        }
      }
      if (table === 'estimate_signatures') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            }),
          }),
        }
      }
      // estimate_sections / estimate_items / anything else
      return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getSignedUrlMock.mockResolvedValue(SIGNED_URL)
  })

  it('attachedPhotos[].url is an ABSOLUTE signed URL and NEVER a /storage/ proxy path', async () => {
    installShareMock(RELATIVE_COMPANY_LOGO, [
      { id: 'ph1', storage_path: `${COMPANY_UUID}/proj/1784854705622-a.webp`, caption: null },
      { id: 'ph2', storage_path: `${COMPANY_UUID}/proj/1784854705623-b.webp`, caption: 'Deck' },
    ])

    const result = await getEstimateByShareToken('tok-SECRET')
    expect(result).not.toBeNull()

    const photos = result!.estimate.attachedPhotos as Array<{ url: string }>
    expect(photos).toHaveLength(2)
    for (const photo of photos) {
      expect(photo.url).toBe(SIGNED_URL)
      expect(isStorageProxyPath(photo.url)).toBe(false)
      expect(photo.url.startsWith('https://')).toBe(true)
    }
    // Server-side signing, 1h TTL — unchanged by Phase 190.
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      'photos',
      `${COMPANY_UUID}/proj/1784854705622-a.webp`,
      3600,
    )
  })

  it('a relative companies.logo_url passes through VERBATIM to the share payload', async () => {
    installShareMock(RELATIVE_COMPANY_LOGO, [])

    const result = await getEstimateByShareToken('tok-SECRET')
    const company = result!.estimate.company as { logo_url: string | null }

    expect(company.logo_url).toBe(RELATIVE_COMPANY_LOGO)
    expect(isStorageProxyPath(company.logo_url!)).toBe(true)
  })

  it('an existing absolute companies.logo_url also passes through verbatim', async () => {
    const absolute =
      'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/x/logo.webp'
    installShareMock(absolute, [])

    const result = await getEstimateByShareToken('tok-SECRET')
    const company = result!.estimate.company as { logo_url: string | null }
    expect(company.logo_url).toBe(absolute)
  })
})
