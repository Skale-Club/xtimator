import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 187 Plan 03 — PROXY-01..04: contract coverage for
 * GET /storage/{bucket}/{key} (app/storage/[bucket]/[...key]/route.ts).
 *
 * `lib/storage/proxy-policy.ts` is intentionally NOT mocked — the real
 * allowlist / key-normalization / cache-policy logic is part of the
 * contract under test. Only the I/O boundaries (`asset-source.ts`,
 * `proxy-auth.ts`) are mocked.
 *
 * NOTE: this suite calling GET() directly proves the route's LOGIC, not
 * what actually reaches the wire through Next's response pipeline. The
 * plan's B3 real-HTTP curl check (recorded in the SUMMARY) is the
 * authoritative evidence for the Cache-Control header values.
 */

vi.mock('@/lib/storage/asset-source', () => ({
  fetchStoredAsset: vi.fn(),
}))

vi.mock('@/lib/storage/proxy-auth', () => ({
  canReadPrivateKey: vi.fn(),
}))

import { GET } from '@/app/storage/[bucket]/[...key]/route'
import { fetchStoredAsset } from '@/lib/storage/asset-source'
import { canReadPrivateKey } from '@/lib/storage/proxy-auth'

function makeParams(bucket: string, key: string[]) {
  return { params: Promise.resolve({ bucket, key }) }
}

function makeAsset(overrides: Partial<{
  contentType: string
  source: 'r2' | 'supabase'
  contentLength: number
  body: Blob
}> = {}) {
  return {
    body: overrides.body ?? new Blob(['hello world'], { type: overrides.contentType ?? 'image/webp' }),
    contentType: overrides.contentType ?? 'image/webp',
    contentLength: overrides.contentLength,
    source: overrides.source ?? 'supabase',
  }
}

const LEAK_PATTERN = /X-Amz-Signature|X-Amz-Credential|x-amz-|supabase\.co|r2\.cloudflarestorage\.com|Bearer /i

async function assertNoLeak(res: Response) {
  for (const [k, v] of res.headers.entries()) {
    expect(`${k}: ${v}`).not.toMatch(LEAK_PATTERN)
  }
  const body = await res.clone().text()
  expect(body).not.toMatch(LEAK_PATTERN)
}

describe('GET /storage/{bucket}/{key}', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('1. logos + valid key + no auth -> 200, revalidating cache, inline, nosniff', async () => {
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ contentType: 'image/webp', source: 'supabase' }))

    const res = await GET(new Request('http://localhost/storage/logos/a/b.webp'), makeParams('logos', ['a', 'b.webp']))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, stale-while-revalidate=86400')
    expect(res.headers.get('cache-control')).not.toMatch(/immutable/)
    expect(res.headers.get('content-disposition')).toBe('inline')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(canReadPrivateKey).not.toHaveBeenCalled()
  })

  it('2. platform-brand + extensionless key -> 200, content-type from asset (never inferred), immutable', async () => {
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ contentType: 'image/webp', source: 'r2' }))

    const res = await GET(
      new Request('http://localhost/storage/platform-brand/platform/1784854705622-kvwo24'),
      makeParams('platform-brand', ['platform', '1784854705622-kvwo24'])
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(fetchStoredAsset).toHaveBeenCalledWith('platform-brand', 'platform/1784854705622-kvwo24')
  })

  it('3. pdfs + member caller -> 200, application/pdf, inline', async () => {
    vi.mocked(canReadPrivateKey).mockResolvedValue(true)
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ contentType: 'application/pdf', source: 'supabase' }))

    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const res = await GET(
      new Request(`http://localhost/storage/pdfs/${uuid}/whatsapp-pdf/x.pdf`),
      makeParams('pdfs', [uuid, 'whatsapp-pdf', 'x.pdf'])
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe('inline')
  })

  it('4. photos + member caller -> 200, private no-store, no public/immutable, Vary: Cookie', async () => {
    vi.mocked(canReadPrivateKey).mockResolvedValue(true)
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ contentType: 'image/webp', source: 'supabase' }))

    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const res = await GET(
      new Request(`http://localhost/storage/photos/${uuid}/projA/photo.webp`),
      makeParams('photos', [uuid, 'projA', 'photo.webp'])
    )

    expect(res.status).toBe(200)
    const cc = res.headers.get('cache-control') ?? ''
    expect(cc).toBe('private, no-store')
    expect(cc).not.toMatch(/public/)
    expect(cc).not.toMatch(/immutable/)
    expect(res.headers.get('vary')).toMatch(/Cookie/)
  })

  it('5. photos + non-member caller -> 404, short body, fetchStoredAsset not called', async () => {
    vi.mocked(canReadPrivateKey).mockResolvedValue(false)

    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const res = await GET(
      new Request(`http://localhost/storage/photos/${uuid}/projA/photo.webp`),
      makeParams('photos', [uuid, 'projA', 'photo.webp'])
    )

    expect(res.status).toBe(404)
    const body = await res.text()
    expect(body).toBe('Not found')
    expect(fetchStoredAsset).not.toHaveBeenCalled()
  })

  it('6. photos + unauthenticated -> 404, fetchStoredAsset not called', async () => {
    vi.mocked(canReadPrivateKey).mockResolvedValue(false)

    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const res = await GET(
      new Request(`http://localhost/storage/photos/${uuid}/projA/photo.webp`),
      makeParams('photos', [uuid, 'projA', 'photo.webp'])
    )

    expect(res.status).toBe(404)
    expect(fetchStoredAsset).not.toHaveBeenCalled()
  })

  it('7. traversal key -> 400, fetchStoredAsset not called', async () => {
    const res = await GET(
      new Request('http://localhost/storage/photos/..%2F..%2Fetc%2Fpasswd'),
      makeParams('photos', ['..', '..', 'etc', 'passwd'])
    )

    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).toBe('Bad request')
    expect(fetchStoredAsset).not.toHaveBeenCalled()
  })

  it('8. unknown bucket -> 404, fetchStoredAsset not called, canReadPrivateKey not called', async () => {
    const res = await GET(
      new Request('http://localhost/storage/estimates/x'),
      makeParams('estimates', ['x'])
    )

    expect(res.status).toBe(404)
    expect(fetchStoredAsset).not.toHaveBeenCalled()
    expect(canReadPrivateKey).not.toHaveBeenCalled()
  })

  it('9. valid public key absent from both backends -> 404', async () => {
    vi.mocked(fetchStoredAsset).mockResolvedValue(null)

    const res = await GET(
      new Request('http://localhost/storage/logos/a/missing.webp'),
      makeParams('logos', ['a', 'missing.webp'])
    )

    expect(res.status).toBe(404)
  })

  it('10. x-asset-source reflects r2 vs supabase', async () => {
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ source: 'r2' }))
    const resR2 = await GET(
      new Request('http://localhost/storage/logos/a/b.webp'),
      makeParams('logos', ['a', 'b.webp'])
    )
    expect(resR2.headers.get('x-asset-source')).toBe('r2')

    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset({ source: 'supabase' }))
    const resSupabase = await GET(
      new Request('http://localhost/storage/logos/a/b.webp'),
      makeParams('logos', ['a', 'b.webp'])
    )
    expect(resSupabase.headers.get('x-asset-source')).toBe('supabase')
    // Note: this header is a convenience only for manual curling — it can be
    // edge-cached stale on public buckets. The authoritative FUT-R2-01
    // signal is the server-side `[asset-proxy] fallback` log line emitted by
    // asset-source.ts (W3), never this header.
  })

  it('11. no-leak sweep on a 200 response', async () => {
    vi.mocked(fetchStoredAsset).mockResolvedValue(makeAsset())
    const res = await GET(
      new Request('http://localhost/storage/logos/a/b.webp'),
      makeParams('logos', ['a', 'b.webp'])
    )
    await assertNoLeak(res)
  })

  it('11b. no-leak sweep on each refusal', async () => {
    // 400 traversal
    const badReq = await GET(new Request('http://localhost/x'), makeParams('photos', ['..']))
    await assertNoLeak(badReq)

    // 404 unknown bucket
    const unknownBucket = await GET(new Request('http://localhost/x'), makeParams('estimates', ['x']))
    await assertNoLeak(unknownBucket)

    // 404 unauthenticated private
    vi.mocked(canReadPrivateKey).mockResolvedValue(false)
    const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
    const unauth = await GET(
      new Request('http://localhost/x'),
      makeParams('photos', [uuid, 'projA', 'photo.webp'])
    )
    await assertNoLeak(unauth)
  })

  it('12. error bodies are short constants that never echo the requested bucket/key', async () => {
    const res = await GET(
      new Request('http://localhost/storage/estimates/super-secret-key-name'),
      makeParams('estimates', ['super-secret-key-name'])
    )
    const body = await res.text()
    expect(body).toBe('Not found')
    expect(body).not.toMatch(/estimates/)
    expect(body).not.toMatch(/super-secret-key-name/)

    const bad = await GET(
      new Request('http://localhost/x'),
      makeParams('photos', ['..'])
    )
    const badBody = await bad.text()
    expect(badBody).toBe('Bad request')
  })
})
