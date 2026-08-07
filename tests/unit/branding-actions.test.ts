// @vitest-environment node
//
// Phase 188 Plan 02 (PROV-01): saveBranding now resolves storage through
// lib/storage/server.ts's serverStorage(client), whose assertServer() throws
// unconditionally when `window` is defined — true under Vitest's default
// jsdom environment regardless of any mock. This suite deliberately does NOT
// mock @/lib/storage or @/lib/storage/server (it mocks the Supabase client's
// storage.from directly, exercising the real Supabase-mode delegation), so it
// needs the Node environment to let serverStorage() past its browser guard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Tests for app/admin/branding/actions.ts -- saveBranding (ADMIN-08).
 *
 * Strategy:
 *   - vi.mock('@/lib/auth/admin-context')   -> requireAdmin returns a stub admin
 *   - vi.mock('@/lib/supabase/service')      -> chainable spy for storage + DB
 *   - vi.mock('@/lib/platform-config')       -> spy on invalidatePlatformConfig
 *   - vi.mock('@/lib/schemas/admin')         -> local copy of brandingSchema so this
 *     test does not depend on Plan 04 commit timing in this wave.
 *   - vi.mock('next/cache')                  -> swallow revalidatePath in test env.
 *
 * Each test re-imports the action via dynamic import after vi.resetModules() so
 * mocks are honoured (mirrors the pattern in tests/unit/platform-config.test.ts).
 */

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
}))

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// saveBranding now runs the logo through convertImageToWebp (sharp) before
// upload. This suite verifies saveBranding's ORCHESTRATION (upload → getPublicUrl
// → upsert → invalidate), not the sharp conversion itself — so mock the WebP
// helper to a deterministic Buffer. Without this, the tiny fake-PNG fixtures
// below are undecodable by sharp and the action returns { ok: false }.
vi.mock('@/lib/image/webp', () => ({
  convertImageToWebp: vi.fn(async () => Buffer.from([0x01, 0x02, 0x03])),
}))

// Provide a local copy of brandingSchema so this test does not race Plan 04
// (which owns lib/schemas/admin.ts). Shape is locked by the 08-CONTEXT D-09 spec
// and the integration contract in 08-04-PLAN.md <interfaces>.
vi.mock('@/lib/schemas/admin', async () => {
  const { z } = await import('zod')
  return {
    brandingSchema: z.object({
      appName: z.string().min(1).max(64),
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color code. Please enter a 6-digit hex value like #0D9488')
        .nullable(),
      emailFromName: z.string().max(128).nullable(),
      logoFile: z.instanceof(File).nullable().optional(),
    }),
  }
})

type ChainableMock = {
  storage: {
    from: ReturnType<typeof vi.fn>
  }
  from: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  getPublicUrl: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
}

function makeServiceClient(opts: {
  uploadResponse?: { data: { path: string } | null; error: { message: string } | null }
  publicUrl?: string
  upsertResponse?: { data: unknown; error: { message: string } | null }
}): ChainableMock {
  const uploadResp = opts.uploadResponse ?? {
    data: { path: 'logo-stub.png' },
    error: null,
  }
  const upsertResp = opts.upsertResponse ?? { data: [{ id: 1 }], error: null }
  const publicUrl = opts.publicUrl ?? 'https://example.test/storage/v1/object/public/platform-brand/logo-stub.png'

  const upload = vi.fn().mockResolvedValue(uploadResp)
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
  const upsert = vi.fn().mockResolvedValue(upsertResp)

  const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl })
  const from = vi.fn().mockReturnValue({ upsert })

  return {
    storage: { from: storageFrom },
    from,
    upload,
    getPublicUrl,
    upsert,
  }
}

describe('app/admin/branding/actions saveBranding (ADMIN-08)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const adminCtx = await import('@/lib/auth/admin-context')
    ;(adminCtx.requireAdmin as unknown as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValue({ userId: 'admin-1', email: 'admin@test' })

    const svc = await import('@/lib/supabase/service')
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReset()
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReset()

    const cfg = await import('@/lib/platform-config')
    ;(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('happy path without logo: returns ok, upserts singleton, calls invalidate exactly once, no upload', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('appName', 'X')
    fd.set('primaryColor', '#0D9488')
    fd.set('emailFromName', 'X Team')
    // no logoFile

    const { saveBranding } = await import('@/app/admin/branding/actions')
    const result = await saveBranding(fd)

    expect(result).toEqual({ ok: true })
    expect(client.upload).not.toHaveBeenCalled()
    expect(client.from).toHaveBeenCalledWith('platform_branding')
    expect(client.upsert).toHaveBeenCalledTimes(1)
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg).toMatchObject({
      id: 1,
      app_name: 'X',
      primary_color: '#0D9488',
      email_from_name: 'X Team',
      updated_by: 'admin-1',
    })
    expect(upsertArg.updated_at).toEqual(expect.any(String))
    // logo_url should NOT be present when no file uploaded
    expect('logo_url' in upsertArg).toBe(false)
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
  })

  it('with logoFile: uploads to platform-brand bucket and upserts logo_url from public URL', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({
      uploadResponse: { data: { path: 'logo-12345.png' }, error: null },
      publicUrl: 'https://example.test/storage/v1/object/public/platform-brand/logo-12345.png',
    })
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    // Tiny PNG file (1x1 transparent)
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const file = new File([pngBytes], 'brand.png', { type: 'image/png' })

    const fd = new FormData()
    fd.set('appName', 'Y')
    fd.set('primaryColor', '#FF0000')
    fd.set('emailFromName', 'Y Team')
    fd.set('logoFile', file)

    const { saveBranding } = await import('@/app/admin/branding/actions')
    const result = await saveBranding(fd)

    expect(result).toEqual({ ok: true })
    expect(client.storage.from).toHaveBeenCalledWith('platform-brand')
    expect(client.upload).toHaveBeenCalledTimes(1)
    const [uploadPath, uploadBody, uploadOpts] = client.upload.mock.calls[0]
    expect(uploadPath).toMatch(/^logo-\d+\.webp$/)
    expect(uploadBody).toBeInstanceOf(Buffer)
    expect(uploadOpts).toMatchObject({ contentType: 'image/webp', upsert: true })

    // Phase 190 (URL-01): saveBranding persists a same-origin proxy path instead
    // of a Supabase public-object URL, so the provider's getPublicUrl is never
    // reached. Inverted from the original assertion; still fails on a revert.
    expect(client.getPublicUrl).not.toHaveBeenCalled()
    expect(client.upsert).toHaveBeenCalledTimes(1)
    const persistedLogoUrl = client.upsert.mock.calls[0][0].logo_url
    expect(persistedLogoUrl).toBe('/storage/platform-brand/logo-12345.png')
    expect(persistedLogoUrl).not.toContain('://')
    expect(persistedLogoUrl).not.toContain('supabase.co')
  })

  it('schema violation (appName empty): returns ok:false with errors, no upsert, no invalidate', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('appName', '')
    fd.set('primaryColor', '#0D9488')
    fd.set('emailFromName', 'X Team')

    const { saveBranding } = await import('@/app/admin/branding/actions')
    const result = await saveBranding(fd)

    expect(result.ok).toBe(false)
    expect((result as { errors: unknown }).errors).toBeDefined()
    expect(client.upsert).not.toHaveBeenCalled()
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('storage upload error: returns ok:false with message, no upsert', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({
      uploadResponse: { data: null, error: { message: 'bucket not found' } },
    })
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const file = new File([pngBytes], 'brand.png', { type: 'image/png' })

    const fd = new FormData()
    fd.set('appName', 'X')
    fd.set('primaryColor', '#0D9488')
    fd.set('emailFromName', 'X Team')
    fd.set('logoFile', file)

    const { saveBranding } = await import('@/app/admin/branding/actions')
    const result = await saveBranding(fd)

    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toMatch(/bucket not found/)
    expect(client.upsert).not.toHaveBeenCalled()
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })
})
