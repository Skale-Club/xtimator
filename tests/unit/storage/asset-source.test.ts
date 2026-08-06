/**
 * Phase 187 Plan 01 — PROXY-01 / PROXY-02: unit coverage for
 * s3ConfigFromEnv/isR2Configured (lib/storage/s3-config.ts) and
 * fetchStoredAsset (lib/storage/asset-source.ts).
 *
 * No real credential ever appears here — S3_* env vars are stubbed with
 * obviously fake placeholder values via vi.stubEnv and cleared in
 * afterEach via vi.unstubAllEnvs().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const FAKE_ENV = {
  S3_ENDPOINT: 'https://fake-account.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'fake-access-key-id',
  S3_SECRET_ACCESS_KEY: 'fake-secret-access-key',
}

const getSignedUrlMock = vi.fn(
  async (bucket: string, key: string) => `https://example-r2.invalid/${bucket}/${key}`,
)
const createS3StorageProviderMock = vi.fn(() => ({
  getSignedUrl: getSignedUrlMock,
}))

vi.mock('@/lib/storage/s3-provider', () => ({
  createS3StorageProvider: (...args: unknown[]) =>
    createS3StorageProviderMock(...(args as [])),
}))

const requireServiceClientMock = vi.fn(() => ({ __fakeSupabaseClient: true }))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) => requireServiceClientMock(...(args as [])),
}))

const downloadMock = vi.fn()
const createStorageMock = vi.fn(() => ({ download: downloadMock }))
vi.mock('@/lib/storage/index', () => ({
  createStorage: (...args: unknown[]) => createStorageMock(...(args as [])),
}))

function fakeResponse(init: {
  ok: boolean
  headers?: Record<string, string>
  body?: ReadableStream<Uint8Array> | null
}): Response {
  const headers = new Headers(init.headers ?? {})
  const body = init.body === undefined ? new ReadableStream() : init.body
  return {
    ok: init.ok,
    headers,
    body,
  } as unknown as Response
}

describe('s3ConfigFromEnv / isR2Configured', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a complete S3ProviderConfig when all four required vars are set', async () => {
    vi.stubEnv('S3_ENDPOINT', FAKE_ENV.S3_ENDPOINT)
    vi.stubEnv('S3_REGION', FAKE_ENV.S3_REGION)
    vi.stubEnv('S3_ACCESS_KEY_ID', FAKE_ENV.S3_ACCESS_KEY_ID)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', FAKE_ENV.S3_SECRET_ACCESS_KEY)
    vi.stubEnv('S3_FORCE_PATH_STYLE', undefined)
    vi.stubEnv('S3_PUBLIC_URL_BASE', undefined)

    const { s3ConfigFromEnv, isR2Configured } = await import('@/lib/storage/s3-config')

    expect(s3ConfigFromEnv()).toEqual({
      endpoint: FAKE_ENV.S3_ENDPOINT,
      region: FAKE_ENV.S3_REGION,
      accessKeyId: FAKE_ENV.S3_ACCESS_KEY_ID,
      secretAccessKey: FAKE_ENV.S3_SECRET_ACCESS_KEY,
      forcePathStyle: true,
      publicUrlBase: undefined,
    })
    expect(isR2Configured()).toBe(true)
  })

  it('forcePathStyle is false only when S3_FORCE_PATH_STYLE === "false"', async () => {
    vi.stubEnv('S3_ENDPOINT', FAKE_ENV.S3_ENDPOINT)
    vi.stubEnv('S3_REGION', FAKE_ENV.S3_REGION)
    vi.stubEnv('S3_ACCESS_KEY_ID', FAKE_ENV.S3_ACCESS_KEY_ID)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', FAKE_ENV.S3_SECRET_ACCESS_KEY)
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false')

    const { s3ConfigFromEnv } = await import('@/lib/storage/s3-config')

    expect(s3ConfigFromEnv()?.forcePathStyle).toBe(false)
  })

  it.each(['S3_ENDPOINT', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])(
    'returns null when %s is missing',
    async (missingKey) => {
      const entries = { ...FAKE_ENV, [missingKey]: undefined }
      for (const [k, v] of Object.entries(entries)) {
        vi.stubEnv(k, v)
      }

      const { s3ConfigFromEnv, isR2Configured } = await import('@/lib/storage/s3-config')

      expect(s3ConfigFromEnv()).toBeNull()
      expect(isR2Configured()).toBe(false)
    },
  )

  it('returns null when a required var is set to an empty string', async () => {
    vi.stubEnv('S3_ENDPOINT', '')
    vi.stubEnv('S3_REGION', FAKE_ENV.S3_REGION)
    vi.stubEnv('S3_ACCESS_KEY_ID', FAKE_ENV.S3_ACCESS_KEY_ID)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', FAKE_ENV.S3_SECRET_ACCESS_KEY)

    const { s3ConfigFromEnv } = await import('@/lib/storage/s3-config')

    expect(s3ConfigFromEnv()).toBeNull()
  })
})

describe('fetchStoredAsset', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    getSignedUrlMock.mockClear()
    createS3StorageProviderMock.mockClear()
    requireServiceClientMock.mockClear()
    createStorageMock.mockClear()
    downloadMock.mockReset()
    vi.stubGlobal('fetch', vi.fn())
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    warnSpy.mockRestore()
  })

  function stubR2Env() {
    vi.stubEnv('S3_ENDPOINT', FAKE_ENV.S3_ENDPOINT)
    vi.stubEnv('S3_REGION', FAKE_ENV.S3_REGION)
    vi.stubEnv('S3_ACCESS_KEY_ID', FAKE_ENV.S3_ACCESS_KEY_ID)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', FAKE_ENV.S3_SECRET_ACCESS_KEY)
  }

  function stubNoR2Env() {
    vi.stubEnv('S3_ENDPOINT', undefined)
    vi.stubEnv('S3_REGION', undefined)
    vi.stubEnv('S3_ACCESS_KEY_ID', undefined)
    vi.stubEnv('S3_SECRET_ACCESS_KEY', undefined)
  }

  it('R2 env vars absent -> resolves from Supabase, source "supabase", no fallback warning', async () => {
    stubNoR2Env()
    const blob = new Blob(['hello'], { type: 'image/webp' })
    downloadMock.mockResolvedValueOnce(blob)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('logos', 'co-uuid/logo.webp')

    expect(result).not.toBeNull()
    expect(result?.source).toBe('supabase')
    expect(warnSpy).not.toHaveBeenCalled()
    expect(createS3StorageProviderMock).not.toHaveBeenCalled()
  })

  it('R2 configured and object present -> source "r2", contentType from R2 header, requireServiceClient never called', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({
        ok: true,
        headers: { 'content-type': 'image/webp', 'content-length': '123' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('platform-brand', 'hero-images/123-a.webp')

    expect(result).not.toBeNull()
    expect(result?.source).toBe('r2')
    expect(result?.contentType).toBe('image/webp')
    expect(requireServiceClientMock).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('extensionless key -> contentType comes from the R2 content-type header, not the path', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({ ok: true, headers: { 'content-type': 'image/webp' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('platform-brand', 'platform/1784854705622-kvwo24')

    expect(result?.contentType).toBe('image/webp')
  })

  it('W2: content-length is undefined when content-encoding is present', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({
        ok: true,
        headers: {
          'content-type': 'image/webp',
          'content-length': '812',
          'content-encoding': 'gzip',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('photos', 'co/photos/1-a.jpg')

    expect(result?.contentLength).toBeUndefined()
  })

  it('W2: content-length is parsed when content-encoding is absent', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({
        ok: true,
        headers: { 'content-type': 'image/webp', 'content-length': '812' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('photos', 'co/photos/1-a.jpg')

    expect(result?.contentLength).toBe(812)
  })

  it('R2 404 -> falls through to Supabase, source "supabase", exactly one fallback warning with bucket+key', async () => {
    stubR2Env()
    const cancelMock = vi.fn()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({
        ok: false,
        body: { cancel: cancelMock } as unknown as ReadableStream<Uint8Array>,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const blob = new Blob(['hello'], { type: 'image/webp' })
    downloadMock.mockResolvedValueOnce(blob)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('photos', 'co/photos/missing.jpg')

    expect(result?.source).toBe('supabase')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [label, payload] = warnSpy.mock.calls[0]
    expect(label).toBe('[asset-proxy] fallback')
    expect(payload).toContain('"bucket":"photos"')
    expect(payload).toContain('"key":"co/photos/missing.jpg"')
    expect(payload).toContain('"reason":"r2-miss"')
  })

  it('R2 fetch throws (network error) -> falls through to Supabase, warning reason "r2-error"', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const blob = new Blob(['hello'], { type: 'audio/webm' })
    downloadMock.mockResolvedValueOnce(blob)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('audio', 'co/audio/r.webm')

    expect(result?.source).toBe('supabase')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, payload] = warnSpy.mock.calls[0]
    expect(payload).toContain('"reason":"r2-error"')
  })

  it('R2 hit -> no fallback warning at all', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({ ok: true, headers: { 'content-type': 'application/pdf' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    await fetchStoredAsset('pdfs', 'co/pdfs/1-est.pdf')

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('both backends miss -> resolves null (no throw), fallback still recorded once', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({
        ok: false,
        body: { cancel: vi.fn() } as unknown as ReadableStream<Uint8Array>,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    downloadMock.mockRejectedValueOnce(new Error('not found'))

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('photos', 'co/photos/gone.jpg')

    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('Supabase blob with empty type -> contentType defaults to application/octet-stream', async () => {
    stubNoR2Env()
    const blob = new Blob(['hello'])
    downloadMock.mockResolvedValueOnce(blob)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('pdfs', 'co/pdfs/1-est.pdf')

    expect(result?.contentType).toBe('application/octet-stream')
  })

  it('the resolved object never exposes a signed backend URL or credential', async () => {
    stubR2Env()
    const fetchMock = vi.fn().mockResolvedValueOnce(
      fakeResponse({ ok: true, headers: { 'content-type': 'image/webp' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { fetchStoredAsset } = await import('@/lib/storage/asset-source')

    const result = await fetchStoredAsset('logos', 'co-uuid/logo.webp')

    const serialized = JSON.stringify({
      contentType: result?.contentType,
      contentLength: result?.contentLength,
      source: result?.source,
    })
    expect(serialized).not.toContain('X-Amz-Signature')
    expect(serialized).not.toContain('X-Amz-Credential')
    expect(serialized).not.toContain('token=')
  })
})
