import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 78 plan 02 — saveSeo server action: OG image upload + remove flow.
 *
 * Covers:
 *  1. No file + no remove flag → og_image_url left as the provided URL, no storage call.
 *  2. Valid PNG file → storage.upload() + getPublicUrl() called, resulting URL persisted.
 *  3. >2MB file → rejected, no upload, no DB write.
 *  4. Unsupported type (svg) → rejected, no upload, no DB write.
 *  5. ogImageRemoved=true with managed URL → storage.delete() called + og_image_url=null;
 *     delete throws → still ok:true + DB write happens (best-effort).
 *  6. ogImageRemoved=true with external URL → no storage.delete call + og_image_url=null.
 *  7. Filename sanitization → `My Cover (final)!.PNG` → `og-images/{ts}-my-cover-final.png`.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const upsertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))
const selectSingleMock = vi.fn(
  async (): Promise<{
    data: { og_image_url: string | null } | null
    error: { message: string } | null
  }> => ({
    data: { og_image_url: null },
    error: null,
  })
)

// Chainable Supabase stub: svc.from(t).upsert(p) / svc.from(t).select(...).eq(...).maybeSingle()
const fromMock = vi.fn((_table: string) => ({
  upsert: (payload: unknown) => {
    // Record the payload for assertions
    lastUpsertPayload = payload
    return upsertMock()
  },
  select: () => ({
    eq: () => ({
      maybeSingle: () => selectSingleMock(),
    }),
  }),
}))

let lastUpsertPayload: unknown = null

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

const uploadMock = vi.fn(
  async (
    _bucket: string,
    path: string,
    _body: unknown,
    _opts?: { contentType?: string; upsert?: boolean }
  ) => ({ path })
)
const getPublicUrlMock = vi.fn(
  (_b: string, path: string) =>
    `https://example.supabase.co/storage/v1/object/public/platform-brand/${path}`
)
const deleteMock = vi.fn(async (_bucket: string, _path: string): Promise<void> => undefined)

vi.mock('@/lib/storage/server', () => ({
  serverStorage: () => ({
    upload: (
      b: string,
      p: string,
      body: unknown,
      opts?: { contentType?: string; upsert?: boolean }
    ) => uploadMock(b, p, body, opts),
    getPublicUrl: (b: string, p: string) => getPublicUrlMock(b, p),
    delete: (b: string, p: string) => deleteMock(b, p),
  }),
}))

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---- import under test (after mocks) ---------------------------------------
import { saveSeo } from '@/app/admin/seo/actions'

function makeFile(opts: { type?: string; size?: number; name?: string } = {}): File {
  const { type = 'image/png', size = 1024, name = 'og.png' } = opts
  return new File([new Uint8Array(size)], name, { type })
}

function makeFormData(fields: Record<string, string | File>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof File) fd.append(k, v)
    else fd.set(k, v)
  }
  return fd
}

beforeEach(() => {
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  selectSingleMock.mockClear()
  selectSingleMock.mockResolvedValue({
    data: { og_image_url: null as string | null },
    error: null,
  })
  fromMock.mockClear()
  uploadMock.mockClear()
  uploadMock.mockImplementation(async (_b, path) => ({ path }))
  getPublicUrlMock.mockClear()
  deleteMock.mockClear()
  deleteMock.mockResolvedValue(undefined)
  lastUpsertPayload = null
})

describe('saveSeo — OG image upload + remove', () => {
  it('1. no file + no remove flag → keeps provided URL, no storage call', async () => {
    const fd = makeFormData({
      siteTitle: 'Xtimator',
      metaDescription: 'Estimates fast',
      ogImageUrl: 'https://cdn.example.com/og.png',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'false',
    })
    const res = await saveSeo(fd)
    expect(res).toEqual({ ok: true })
    expect(uploadMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
    expect((lastUpsertPayload as { og_image_url: string }).og_image_url).toBe(
      'https://cdn.example.com/og.png'
    )
  })

  it('2. valid PNG file → upload + getPublicUrl + persists returned URL', async () => {
    const file = makeFile({ type: 'image/png', size: 1024 * 1024, name: 'cover.png' })
    const fd = makeFormData({
      siteTitle: 'Xtimator',
      metaDescription: 'Estimates',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'false',
      ogImageFile: file,
    })
    const res = await saveSeo(fd)
    expect(res).toEqual({ ok: true })
    expect(uploadMock).toHaveBeenCalledTimes(1)
    const [bucket, path, , opts] = uploadMock.mock.calls[0]
    expect(bucket).toBe('platform-brand')
    expect(path).toMatch(/^og-images\/\d+-cover\.png$/)
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: true })
    // Phase 190 (URL-01): saveSeo no longer mints a storage-backend URL. The
    // persisted value is the same-origin proxy path, so getPublicUrl must never
    // be reached — that inverted assertion is what fails if the line is reverted.
    expect(getPublicUrlMock).not.toHaveBeenCalled()
    const persistedOgUrl = (lastUpsertPayload as { og_image_url: string }).og_image_url
    expect(persistedOgUrl).toMatch(
      /^\/storage\/platform-brand\/og-images\/\d+-cover\.png$/
    )
    expect(persistedOgUrl).not.toContain('://')
    expect(persistedOgUrl).not.toContain('supabase.co')
  })

  it('3. 3MB file → rejected with size message, no upload', async () => {
    const file = makeFile({ type: 'image/png', size: 3 * 1024 * 1024 })
    const fd = makeFormData({
      siteTitle: 'X',
      metaDescription: 'd',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'false',
      ogImageFile: file,
    })
    const res = await saveSeo(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/under 2 ?MB/i)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('4. svg file → rejected with format message, no upload', async () => {
    const file = makeFile({ type: 'image/svg+xml', name: 'og.svg' })
    const fd = makeFormData({
      siteTitle: 'X',
      metaDescription: 'd',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'false',
      ogImageFile: file,
    })
    const res = await saveSeo(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/PNG or JPG/i)
    expect(uploadMock).not.toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('5. remove=true + managed URL → delete called + null persisted; delete-throw still ok', async () => {
    selectSingleMock.mockResolvedValueOnce({
      data: {
        og_image_url:
          'https://example.supabase.co/storage/v1/object/public/platform-brand/og-images/123-x.png',
      },
      error: null,
    })
    deleteMock.mockRejectedValueOnce(new Error('boom'))

    const fd = makeFormData({
      siteTitle: 'X',
      metaDescription: 'd',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'true',
    })
    const res = await saveSeo(fd)
    expect(res).toEqual({ ok: true })
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock.mock.calls[0][0]).toBe('platform-brand')
    expect(deleteMock.mock.calls[0][1]).toBe('og-images/123-x.png')
    expect((lastUpsertPayload as { og_image_url: unknown }).og_image_url).toBeNull()
  })

  it('6. remove=true + external URL → no delete call, null persisted', async () => {
    selectSingleMock.mockResolvedValueOnce({
      data: { og_image_url: 'https://cdn.example.com/og.png' },
      error: null,
    })
    const fd = makeFormData({
      siteTitle: 'X',
      metaDescription: 'd',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'true',
    })
    const res = await saveSeo(fd)
    expect(res).toEqual({ ok: true })
    expect(deleteMock).not.toHaveBeenCalled()
    expect((lastUpsertPayload as { og_image_url: unknown }).og_image_url).toBeNull()
  })

  it('7. filename "My Cover (final)!.PNG" → sanitized key og-images/{ts}-my-cover-final.png', async () => {
    const file = makeFile({
      type: 'image/png',
      size: 2048,
      name: 'My Cover (final)!.PNG',
    })
    const fd = makeFormData({
      siteTitle: 'X',
      metaDescription: 'd',
      ogImageUrl: '',
      canonicalBaseUrl: 'https://x.com',
      ogImageRemoved: 'false',
      ogImageFile: file,
    })
    const res = await saveSeo(fd)
    expect(res).toEqual({ ok: true })
    const [, path] = uploadMock.mock.calls[0]
    expect(path).toMatch(/^og-images\/\d+-my-cover-final\.png$/)
  })
})
