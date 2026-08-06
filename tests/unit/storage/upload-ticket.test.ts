// @vitest-environment node
/**
 * Phase 189 Plan 01 — UPLOAD-02/UPLOAD-03: coverage for
 * lib/storage/upload-ticket.ts. Zero real credentials, zero network calls —
 * presigning is pure crypto (no request is made), and Supabase mode is
 * exercised against a hand-rolled fake client.
 *
 * `@vitest-environment node`: lib/storage/upload-ticket.ts imports
 * lib/storage/server.ts (mocked below, but the import graph is still
 * resolved), whose serverStorageBackend() calls assertServer(), which
 * throws when `window` is defined. The global vitest config runs jsdom
 * (window always defined) — this override gives a real "no window"
 * baseline, matching tests/unit/storage/server-provider.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const FAKE_ENV = {
  S3_ENDPOINT: 'https://fake-account.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'fake-access-key-id',
  S3_SECRET_ACCESS_KEY: 'fake-secret-access-key-do-not-leak',
}

const serverStorageBackendMock = vi.fn<[], 'r2' | 'supabase'>()

vi.mock('@/lib/storage/server', () => ({
  serverStorageBackend: () => serverStorageBackendMock(),
}))

function stubS3Env(overrides: Partial<Record<string, string | undefined>> = {}) {
  vi.stubEnv('S3_ENDPOINT', overrides.S3_ENDPOINT ?? FAKE_ENV.S3_ENDPOINT)
  vi.stubEnv('S3_REGION', overrides.S3_REGION ?? FAKE_ENV.S3_REGION)
  vi.stubEnv('S3_ACCESS_KEY_ID', overrides.S3_ACCESS_KEY_ID ?? FAKE_ENV.S3_ACCESS_KEY_ID)
  vi.stubEnv(
    'S3_SECRET_ACCESS_KEY',
    overrides.S3_SECRET_ACCESS_KEY ?? FAKE_ENV.S3_SECRET_ACCESS_KEY,
  )
}

function stubEmptyS3Env() {
  vi.stubEnv('S3_ENDPOINT', undefined)
  vi.stubEnv('S3_REGION', undefined)
  vi.stubEnv('S3_ACCESS_KEY_ID', undefined)
  vi.stubEnv('S3_SECRET_ACCESS_KEY', undefined)
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-2222-2222-222222222222'
const PROJECT_ID = '33333333-3333-3333-3333-333333333333'
const OTHER_PROJECT_ID = '44444444-4444-4444-4444-444444444444'
const FIXED_ID = '55555555-5555-5555-5555-555555555555'

function fakeSupabaseClient(opts: {
  token?: string
  signedUrl?: string
  error?: { message: string; status?: number; statusCode?: string } | null
}) {
  const createSignedUploadUrl = vi.fn(async () => {
    if (opts.error) {
      return { data: null, error: opts.error }
    }
    return {
      data: { token: opts.token ?? 'fake-signed-token', signedUrl: opts.signedUrl ?? 'ignored' },
      error: null,
    }
  })
  const from = vi.fn(() => ({ createSignedUploadUrl }))
  return {
    client: { storage: { from } } as unknown as import('@supabase/supabase-js').SupabaseClient,
    createSignedUploadUrl,
    from,
  }
}

beforeEach(() => {
  serverStorageBackendMock.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('normalizeUploadContentType', () => {
  it.each([
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['AUDIO/WEBM', 'audio/webm'],
    [' audio/mp4 ', 'audio/mp4'],
    ['audio/ogg', 'audio/ogg'],
    ['audio/mpeg', 'audio/mpeg'],
    ['audio/wav', 'audio/wav'],
  ])('%s -> %s', async (raw, expected) => {
    const { normalizeUploadContentType } = await import('@/lib/storage/upload-ticket')
    expect(normalizeUploadContentType(raw)).toBe(expected)
  })

  it.each([[''], ['text/html'], ['application/octet-stream'], ['image/svg+xml']])(
    '%s -> null (not allowlisted)',
    async (raw) => {
      const { normalizeUploadContentType } = await import('@/lib/storage/upload-ticket')
      expect(normalizeUploadContentType(raw)).toBeNull()
    },
  )

  it('undefined-ish (non-string) -> null', async () => {
    const { normalizeUploadContentType } = await import('@/lib/storage/upload-ticket')
    expect(normalizeUploadContentType(undefined as unknown as string)).toBeNull()
  })

  it('a value carrying CRLF -> null (header-injection guard)', async () => {
    const { normalizeUploadContentType } = await import('@/lib/storage/upload-ticket')
    expect(normalizeUploadContentType('audio/webm\r\nX-Injected: 1')).toBeNull()
  })
})

describe('deriveUploadKey', () => {
  it('returns exactly `${companyId}/${projectId}/${id}.${ext}`', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    const key = deriveUploadKey({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      contentType: 'audio/webm',
      id: FIXED_ID,
    })
    expect(key).toBe(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`)
  })

  it('matches the literal shape production call sites build today', async () => {
    // Verified 2026-08-06 against components/capture/capture-recorder.tsx,
    // components/projects/inline-audio-recorder.tsx, and
    // components/workspace/ai-input-group/use-ai-input-submit.ts — all three
    // build `${companyId}/${projectId}/${recordingId}.${ext}` identically.
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    const productionShape = `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`
    const key = deriveUploadKey({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      contentType: 'audio/webm',
      id: FIXED_ID,
    })
    expect(key).toBe(productionShape)
  })

  it('derives the extension from getFileExtension (mp4 content type -> .mp4)', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    const key = deriveUploadKey({
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      contentType: 'audio/mp4',
      id: FIXED_ID,
    })
    expect(key).toBe(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.mp4`)
  })

  it('throws when companyId is not a UUID', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    expect(() =>
      deriveUploadKey({ companyId: 'not-a-uuid', projectId: PROJECT_ID, contentType: 'audio/webm' }),
    ).toThrow(/companyId must be a UUID/)
  })

  it('throws when projectId is not a UUID', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    expect(() =>
      deriveUploadKey({ companyId: COMPANY_ID, projectId: '../etc', contentType: 'audio/webm' }),
    ).toThrow(/projectId must be a UUID/)
  })

  it('throws when contentType is not allowlisted', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    expect(() =>
      deriveUploadKey({ companyId: COMPANY_ID, projectId: PROJECT_ID, contentType: 'text/html' }),
    ).toThrow(/contentType not allowlisted/)
  })

  it('without an explicit id, produces a fresh crypto.randomUUID()-based key each call', async () => {
    const { deriveUploadKey } = await import('@/lib/storage/upload-ticket')
    const key1 = deriveUploadKey({ companyId: COMPANY_ID, projectId: PROJECT_ID, contentType: 'audio/webm' })
    const key2 = deriveUploadKey({ companyId: COMPANY_ID, projectId: PROJECT_ID, contentType: 'audio/webm' })
    expect(key1).not.toBe(key2)
    expect(key1.startsWith(`${COMPANY_ID}/${PROJECT_ID}/`)).toBe(true)
  })
})

describe('assertKeyInTenant', () => {
  const validKey = `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`

  it('true for a well-formed key this tenant+project owns', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant(validKey, COMPANY_ID, PROJECT_ID)).toBe(true)
  })

  it('true for each allowlisted extension', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    for (const ext of ['webm', 'mp4', 'ogg']) {
      expect(assertKeyInTenant(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.${ext}`, COMPANY_ID, PROJECT_ID)).toBe(
        true,
      )
    }
  })

  it('false: another company UUID in segment 0', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${OTHER_COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: another project UUID in segment 1', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${COMPANY_ID}/${OTHER_PROJECT_ID}/${FIXED_ID}.webm`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: `..` traversal segment', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${COMPANY_ID}/../${FIXED_ID}.webm`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: leading slash', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant(`/${validKey}`, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: trailing slash', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant(`${validKey}/`, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: backslashes', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${COMPANY_ID}\\${PROJECT_ID}\\${FIXED_ID}.webm`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: URL-encoded traversal (%2e%2e)', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${COMPANY_ID}/${PROJECT_ID}/%2e%2e.webm`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: NUL byte', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const key = `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm\0`
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: key.length > 200', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    const padding = 'a'.repeat(250)
    const key = `${COMPANY_ID}/${PROJECT_ID}/${padding}.webm`
    expect(key.length).toBeGreaterThan(200)
    expect(assertKeyInTenant(key, COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: empty string', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant('', COMPANY_ID, PROJECT_ID)).toBe(false)
  })

  it('false: wrong segment count', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant(`${COMPANY_ID}/${PROJECT_ID}`, COMPANY_ID, PROJECT_ID)).toBe(false)
    expect(assertKeyInTenant(`${COMPANY_ID}/${PROJECT_ID}/x/${FIXED_ID}.webm`, COMPANY_ID, PROJECT_ID)).toBe(
      false,
    )
  })

  it('false: last segment is not a well-formed uuid.ext', async () => {
    const { assertKeyInTenant } = await import('@/lib/storage/upload-ticket')
    expect(assertKeyInTenant(`${COMPANY_ID}/${PROJECT_ID}/not-a-uuid.webm`, COMPANY_ID, PROJECT_ID)).toBe(
      false,
    )
    expect(assertKeyInTenant(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.exe`, COMPANY_ID, PROJECT_ID)).toBe(
      false,
    )
  })
})

describe('mintUploadTicket — common validation (backend-agnostic)', () => {
  it('throws on a non-allowlisted contentType before any backend call', async () => {
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})
    await expect(
      mintUploadTicket({
        bucket: 'audio',
        projectId: PROJECT_ID,
        companyId: COMPANY_ID,
        contentType: 'text/html',
        supabase: client,
      }),
    ).rejects.toThrow(/contentType not allowlisted/)
    expect(serverStorageBackendMock).not.toHaveBeenCalled()
  })

  it('throws on a bucket outside UPLOAD_TICKET_BUCKETS before any backend call', async () => {
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})
    await expect(
      mintUploadTicket({
        bucket: 'photos' as never,
        projectId: PROJECT_ID,
        companyId: COMPANY_ID,
        contentType: 'audio/webm',
        supabase: client,
      }),
    ).rejects.toThrow(/bucket not allowlisted/)
    expect(serverStorageBackendMock).not.toHaveBeenCalled()
  })

  it('with args.key present and valid: re-tickets the SAME key (retry does not orphan a second object)', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client, createSignedUploadUrl } = fakeSupabaseClient({})
    const existingKey = `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm',
      supabase: client,
      key: existingKey,
    })

    expect(ticket.key).toBe(existingKey)
    expect(createSignedUploadUrl).toHaveBeenCalledWith(existingKey)
  })

  it('with args.key present and invalid (foreign tenant): throws, never falls back to minting a fresh key', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client, createSignedUploadUrl } = fakeSupabaseClient({})
    const foreignKey = `${OTHER_COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`

    await expect(
      mintUploadTicket({
        bucket: 'audio',
        projectId: PROJECT_ID,
        companyId: COMPANY_ID,
        contentType: 'audio/webm',
        supabase: client,
        key: foreignKey,
      }),
    ).rejects.toThrow(/failed tenant-confinement validation/)
    expect(createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('with args.key absent: mints a fresh key via deriveUploadKey', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm',
      supabase: client,
    })

    expect(ticket.key.startsWith(`${COMPANY_ID}/${PROJECT_ID}/`)).toBe(true)
    expect(ticket.key.endsWith('.webm')).toBe(true)
  })
})

describe('mintUploadTicket — R2 mode (s3-presigned-put)', () => {
  it('returns a presigned PUT ticket with the content type pinned into the signature', async () => {
    serverStorageBackendMock.mockReturnValue('r2')
    stubS3Env()
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm;codecs=opus',
      supabase: client,
      key: `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`,
    })

    expect(ticket.strategy).toBe('s3-presigned-put')
    if (ticket.strategy !== 's3-presigned-put') throw new Error('unreachable')
    expect(ticket.bucket).toBe('audio')
    expect(ticket.key).toBe(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.webm`)
    expect(ticket.contentType).toBe('audio/webm')
    expect(ticket.headers).toEqual({ 'Content-Type': 'audio/webm' })
    expect(ticket.expiresInSeconds).toBe(900)

    const url = new URL(ticket.url)
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900')
    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') ?? ''
    expect(signedHeaders).toContain('content-type')
  })

  it('never embeds the secret access key anywhere in the returned ticket', async () => {
    serverStorageBackendMock.mockReturnValue('r2')
    stubS3Env()
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm',
      supabase: client,
    })

    const serialized = JSON.stringify(ticket)
    expect(serialized).not.toContain(FAKE_ENV.S3_SECRET_ACCESS_KEY)
  })

  it('the presigned URL contains no X-Amz-Security-Token', async () => {
    serverStorageBackendMock.mockReturnValue('r2')
    stubS3Env()
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm',
      supabase: client,
    })
    if (ticket.strategy !== 's3-presigned-put') throw new Error('unreachable')

    const url = new URL(ticket.url)
    expect(url.searchParams.has('X-Amz-Security-Token')).toBe(false)
  })

  it('throws a named error when s3ConfigFromEnv() is null in r2 mode (unreachable in practice, must never silently degrade)', async () => {
    serverStorageBackendMock.mockReturnValue('r2')
    stubEmptyS3Env()
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    await expect(
      mintUploadTicket({
        bucket: 'audio',
        projectId: PROJECT_ID,
        companyId: COMPANY_ID,
        contentType: 'audio/webm',
        supabase: client,
      }),
    ).rejects.toThrow(/s3ConfigFromEnv/)
  })
})

describe('mintUploadTicket — Supabase mode (supabase-signed-upload)', () => {
  it('calls createSignedUploadUrl on the RLS-bound client with bucket/key, returns the token, and does NOT forward signedUrl', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client, from, createSignedUploadUrl } = fakeSupabaseClient({
      token: 'the-real-token',
      signedUrl: 'https://example.supabase.co/storage/v1/object/upload/sign/audio/whatever?token=leak',
    })

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/mp4',
      supabase: client,
      key: `${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.mp4`,
    })

    expect(ticket.strategy).toBe('supabase-signed-upload')
    if (ticket.strategy !== 'supabase-signed-upload') throw new Error('unreachable')
    expect(from).toHaveBeenCalledWith('audio')
    expect(createSignedUploadUrl).toHaveBeenCalledWith(`${COMPANY_ID}/${PROJECT_ID}/${FIXED_ID}.mp4`)
    expect(ticket.token).toBe('the-real-token')
    expect(ticket.contentType).toBe('audio/mp4')
    expect(JSON.stringify(ticket)).not.toContain('leak')
  })

  it('a Supabase error is rethrown with .status/.statusCode preserved', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({
      error: { message: 'nope', status: 403, statusCode: '403' },
    })

    await expect(
      mintUploadTicket({
        bucket: 'audio',
        projectId: PROJECT_ID,
        companyId: COMPANY_ID,
        contentType: 'audio/webm',
        supabase: client,
      }),
    ).rejects.toMatchObject({ status: 403, statusCode: '403' })
  })

  it('never embeds any S3 credential shape in the returned ticket', async () => {
    serverStorageBackendMock.mockReturnValue('supabase')
    const { mintUploadTicket } = await import('@/lib/storage/upload-ticket')
    const { client } = fakeSupabaseClient({})

    const ticket = await mintUploadTicket({
      bucket: 'audio',
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      contentType: 'audio/webm',
      supabase: client,
    })

    const serialized = JSON.stringify(ticket)
    expect(serialized).not.toContain(FAKE_ENV.S3_SECRET_ACCESS_KEY)
    expect(serialized).not.toMatch(/service[-_]?role/i)
  })
})
