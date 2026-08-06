// @vitest-environment node
/**
 * Phase 188 Plan 01 — PROV-01: selection-matrix coverage for
 * lib/storage/server.ts (serverStorageBackend / getServerStorage /
 * serverStorage), plus the lib/storage/index.ts purity assertion.
 *
 * Test-isolation landmine: vitest.config.ts's setupFiles load the
 * developer's real .env.local, so every test here explicitly stubs all
 * four S3_* vars (and STORAGE_PROVIDER) rather than relying on them being
 * absent. Never a real credential — only obviously-fake placeholder values.
 *
 * `@vitest-environment node` override: the global vitest config runs
 * `jsdom` (so `window` is always defined), but this module's browser guard
 * (`assertServer()`) checks `typeof window !== 'undefined'` — under jsdom
 * every test would spuriously hit the guard. The `node` environment here
 * gives us a real "no window" baseline; the browser-guard tests below stub
 * `globalThis.window` explicitly to simulate the browser case.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const FAKE_ENV = {
  S3_ENDPOINT: 'https://example-account.r2.cloudflarestorage.com',
  S3_REGION: 'auto',
  S3_ACCESS_KEY_ID: 'test-access-key-id',
  S3_SECRET_ACCESS_KEY: 'test-secret',
}

const createS3StorageProviderMock = vi.fn(() => ({ __s3Provider: true }))
const requireServiceClientMock = vi.fn(() => ({ __serviceClient: true }))

/**
 * Installs vi.spyOn on lib/storage/server.ts's exported `__internal` test
 * seam (see that file's docblock on `__internal`) so `loadS3Provider()` /
 * `loadServiceClient()` return our fakes WITHOUT the real `require()` call
 * ever running. This sidesteps a Vitest-only limitation: its SSR
 * `require()` shim never resolves an extensionless local `.ts` specifier
 * (independent of `vi.mock`, which only intercepts `import`/dynamic
 * `import()`, never a literal `require()`), even though Next.js's real
 * bundler resolves the exact same requires fine at build time.
 */
async function installLazyLoadSpies() {
  const serverModule = await import('@/lib/storage/server')
  vi.spyOn(serverModule.__internal, 'loadS3Provider').mockReturnValue({
    createS3StorageProvider: (...args: unknown[]) =>
      createS3StorageProviderMock(...(args as [])),
  } as never)
  vi.spyOn(serverModule.__internal, 'loadServiceClient').mockReturnValue({
    requireServiceClient: (...args: unknown[]) => requireServiceClientMock(...(args as [])),
  } as never)
  return serverModule
}

function stubAllEnv(overrides: Partial<Record<string, string | undefined>> = {}) {
  vi.stubEnv('STORAGE_PROVIDER', overrides.STORAGE_PROVIDER)
  vi.stubEnv('S3_ENDPOINT', overrides.S3_ENDPOINT)
  vi.stubEnv('S3_REGION', overrides.S3_REGION)
  vi.stubEnv('S3_ACCESS_KEY_ID', overrides.S3_ACCESS_KEY_ID)
  vi.stubEnv('S3_SECRET_ACCESS_KEY', overrides.S3_SECRET_ACCESS_KEY)
}

function stubCompleteS3Env(overrides: Partial<Record<string, string | undefined>> = {}) {
  stubAllEnv({ ...FAKE_ENV, ...overrides })
}

describe('lib/storage/server.ts — selection matrix', () => {
  beforeEach(() => {
    vi.resetModules()
    createS3StorageProviderMock.mockClear()
    requireServiceClientMock.mockClear()
    // Baseline: everything unset. Individual tests layer on top.
    stubAllEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('unset STORAGE_PROVIDER + complete S3_* -> r2', async () => {
    stubCompleteS3Env()
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('r2')
  })

  it('unset STORAGE_PROVIDER + incomplete S3_* -> supabase', async () => {
    stubAllEnv({ S3_ENDPOINT: FAKE_ENV.S3_ENDPOINT })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('supabase')
  })

  it('unrecognized STORAGE_PROVIDER value (typo) + complete S3_* -> r2', async () => {
    stubCompleteS3Env({ STORAGE_PROVIDER: 'S3' })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('r2')
  })

  it('empty-string STORAGE_PROVIDER + incomplete S3_* -> supabase', async () => {
    stubAllEnv({ STORAGE_PROVIDER: '' })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('supabase')
  })

  it("STORAGE_PROVIDER='supabase' + complete S3_* -> supabase (explicit kill switch wins)", async () => {
    stubCompleteS3Env({ STORAGE_PROVIDER: 'supabase' })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('supabase')
  })

  it("STORAGE_PROVIDER='supabase' + incomplete S3_* -> supabase", async () => {
    stubAllEnv({ STORAGE_PROVIDER: 'supabase' })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('supabase')
  })

  it("STORAGE_PROVIDER='s3' + complete S3_* -> r2", async () => {
    stubCompleteS3Env({ STORAGE_PROVIDER: 's3' })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(serverStorageBackend()).toBe('r2')
  })

  it("STORAGE_PROVIDER='s3' + incomplete S3_* -> throws naming the missing var(s), never silently degrades", async () => {
    stubAllEnv({
      STORAGE_PROVIDER: 's3',
      S3_ENDPOINT: FAKE_ENV.S3_ENDPOINT,
      // S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY left unset
    })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(() => serverStorageBackend()).toThrowError(
      /S3_REGION.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/,
    )
  })

  it('partial config (S3_ENDPOINT set, S3_SECRET_ACCESS_KEY empty) with STORAGE_PROVIDER unset -> supabase, no throw', async () => {
    stubAllEnv({
      S3_ENDPOINT: FAKE_ENV.S3_ENDPOINT,
      S3_REGION: FAKE_ENV.S3_REGION,
      S3_ACCESS_KEY_ID: FAKE_ENV.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: '',
    })
    const { serverStorageBackend } = await import('@/lib/storage/server')
    expect(() => serverStorageBackend()).not.toThrow()
    expect(serverStorageBackend()).toBe('supabase')
  })
})

describe('lib/storage/server.ts — browser guard', () => {
  beforeEach(() => {
    vi.resetModules()
    stubAllEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    // @ts-expect-error — deliberately removing the test-only stub
    delete (globalThis as { window?: unknown }).window
  })

  it('serverStorageBackend() throws when globalThis.window is defined', async () => {
    const { serverStorageBackend } = await import('@/lib/storage/server')
    ;(globalThis as unknown as { window: unknown }).window = {}
    expect(() => serverStorageBackend()).toThrow()
  })

  it('getServerStorage() throws when globalThis.window is defined', async () => {
    const { getServerStorage } = await import('@/lib/storage/server')
    ;(globalThis as unknown as { window: unknown }).window = {}
    expect(() => getServerStorage()).toThrow()
  })

  it('serverStorage(client) throws when globalThis.window is defined', async () => {
    const { serverStorage } = await import('@/lib/storage/server')
    ;(globalThis as unknown as { window: unknown }).window = {}
    expect(() => serverStorage({} as never)).toThrow()
  })
})

describe('lib/storage/server.ts — serverStorage(client) delegation', () => {
  beforeEach(() => {
    vi.resetModules()
    createS3StorageProviderMock.mockClear()
    requireServiceClientMock.mockClear()
    stubAllEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("supabase mode: serverStorage(client) delegates to the PASSED client, not the service-role client", async () => {
    const { serverStorage } = await installLazyLoadSpies()
    const fakeClient = {
      storage: {
        from: vi.fn(() => ({
          list: vi.fn(async () => ({ data: [], error: null })),
        })),
      },
    }
    const provider = serverStorage(fakeClient as never)
    await provider.list('logos', '')
    expect(fakeClient.storage.from).toHaveBeenCalledWith('logos')
    expect(requireServiceClientMock).not.toHaveBeenCalled()
  })

  it('supabase mode: getServerStorage() uses requireServiceClient()', async () => {
    const { getServerStorage } = await installLazyLoadSpies()
    getServerStorage()
    expect(requireServiceClientMock).toHaveBeenCalledTimes(1)
  })

  it('r2 mode: getServerStorage() returns a provider built from s3ConfigFromEnv(), ignoring any client', async () => {
    stubCompleteS3Env()
    const { getServerStorage } = await installLazyLoadSpies()
    getServerStorage()
    expect(createS3StorageProviderMock).toHaveBeenCalledTimes(1)
    expect(createS3StorageProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: FAKE_ENV.S3_ENDPOINT,
        region: FAKE_ENV.S3_REGION,
        accessKeyId: FAKE_ENV.S3_ACCESS_KEY_ID,
        secretAccessKey: FAKE_ENV.S3_SECRET_ACCESS_KEY,
      }),
    )
  })

  it('r2 mode: serverStorage(client) ignores the client entirely', async () => {
    stubCompleteS3Env()
    const { serverStorage } = await installLazyLoadSpies()
    const fakeClient = { storage: { from: vi.fn() } }
    serverStorage(fakeClient as never)
    expect(createS3StorageProviderMock).toHaveBeenCalledTimes(1)
    expect(fakeClient.storage.from).not.toHaveBeenCalled()
  })
})

describe('lib/storage/index.ts — purity assertion', () => {
  it('contains no occurrence of s3-provider, @/lib/supabase/service, process.env, or STORAGE_PROVIDER', () => {
    const indexPath = path.resolve(process.cwd(), 'lib/storage/index.ts')
    const source = readFileSync(indexPath, 'utf8')

    expect(source).not.toContain('s3-provider')
    expect(source).not.toContain('@/lib/supabase/service')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('STORAGE_PROVIDER')
  })
})
