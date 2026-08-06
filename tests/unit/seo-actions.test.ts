// @vitest-environment node
//
// Phase 188 Plan 02 (PROV-01): saveSeo now resolves storage through
// lib/storage/server.ts's serverStorage(client), whose assertServer() throws
// unconditionally when `window` is defined — true under Vitest's default
// jsdom environment regardless of any mock. This suite deliberately does NOT
// mock @/lib/storage or @/lib/storage/server (it mocks the Supabase client's
// storage.from directly, exercising the real Supabase-mode delegation), so it
// needs the Node environment to let serverStorage() past its browser guard.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Tests for app/admin/seo/actions.ts -- saveSeo (SEO-01).
 *
 * Strategy mirrors branding-actions.test.ts:
 *   - vi.mock('@/lib/auth/admin-context')  -> requireAdmin returns stub admin
 *   - vi.mock('@/lib/supabase/service')     -> chainable spy for DB upsert
 *   - vi.mock('@/lib/platform-config')      -> spy on invalidatePlatformConfig
 *   - vi.mock('@/lib/schemas/admin')        -> inline seoSchema so test is wave-order-safe
 *   - vi.mock('next/cache')                 -> swallow revalidatePath in test env
 */

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => {
  // saveSeo calls requireServiceClient(); alias both exports to one spy so tests that
  // configure createServiceClient.mockReturnValue(...) also drive requireServiceClient().
  const client = vi.fn()
  return { createServiceClient: client, requireServiceClient: client }
})

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Inline schema so this test does not depend on lib/schemas/admin.ts commit order.
vi.mock('@/lib/schemas/admin', async () => {
  const { z } = await import('zod')
  return {
    seoSchema: z.object({
      siteTitle: z.string().max(120).nullable(),
      metaDescription: z.string().max(300).nullable(),
      ogImageUrl: z
        .string()
        .url('Must be a valid URL')
        .nullable()
        .or(z.literal(''))
        .transform((v) => v || null),
      canonicalBaseUrl: z
        .string()
        .url('Must be a valid URL')
        .nullable()
        .or(z.literal(''))
        .transform((v) => v || null),
    }),
  }
})

function makeServiceClient(opts: {
  upsertResponse?: { data: unknown; error: { message: string } | null }
  existingRow?: { app_name?: string | null; og_image_url?: string | null } | null
}) {
  const upsertResp = opts.upsertResponse ?? { data: [{ id: 1 }], error: null }
  const upsert = vi.fn().mockResolvedValue(upsertResp)
  // saveSeo reads the existing row (app_name / og_image_url) via
  // .from('platform_branding').select(...).eq('id', 1).maybeSingle() before the upsert.
  const existing =
    opts.existingRow !== undefined ? opts.existingRow : { app_name: 'Xtimator', og_image_url: null }
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select, upsert })
  return { from, upsert }
}

describe('saveSeo server action (SEO-01)', () => {
  beforeEach(async () => {
    vi.resetModules()
    const adminCtx = await import('@/lib/auth/admin-context')
    ;(adminCtx.requireAdmin as unknown as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockResolvedValue({ userId: 'admin-1', email: 'admin@test' })

    const svc = await import('@/lib/supabase/service')
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReset()

    const cfg = await import('@/lib/platform-config')
    ;(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves site_title, meta_description, og_image_url, canonical_base_url to platform_branding id=1', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('siteTitle', 'Xtimator')
    fd.set('metaDescription', 'Professional AI estimates for service businesses.')
    fd.set('ogImageUrl', 'https://xtimator.com/og.png')
    fd.set('canonicalBaseUrl', 'https://xtimator.com')

    const { saveSeo } = await import('@/app/admin/seo/actions')
    const result = await saveSeo(fd)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('platform_branding')
    expect(client.upsert).toHaveBeenCalledTimes(1)
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg).toMatchObject({
      id: 1,
      site_title: 'Xtimator',
      meta_description: 'Professional AI estimates for service businesses.',
      og_image_url: 'https://xtimator.com/og.png',
      canonical_base_url: 'https://xtimator.com',
    })
    expect(upsertArg.updated_at).toEqual(expect.any(String))
  })

  it('calls invalidatePlatformConfig after successful save', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('siteTitle', 'X')
    fd.set('metaDescription', '')
    fd.set('ogImageUrl', '')
    fd.set('canonicalBaseUrl', '')

    const { saveSeo } = await import('@/app/admin/seo/actions')
    await saveSeo(fd)

    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
  })

  it('revalidates / layout path after save', async () => {
    const svc = await import('@/lib/supabase/service')
    const nextCache = await import('next/cache')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('siteTitle', 'X')
    fd.set('metaDescription', '')
    fd.set('ogImageUrl', '')
    fd.set('canonicalBaseUrl', '')

    const { saveSeo } = await import('@/app/admin/seo/actions')
    await saveSeo(fd)

    const revalidatePath = nextCache.revalidatePath as unknown as ReturnType<typeof vi.fn>
    expect(revalidatePath).toHaveBeenCalledWith('/admin/seo')
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('returns ok:false when requireAdmin throws', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const adminCtx = await import('@/lib/auth/admin-context')
    const client = makeServiceClient({})
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(adminCtx.requireAdmin as unknown as ReturnType<typeof vi.fn>)
      .mockReset()
      .mockRejectedValue(new Error('Not found'))

    const fd = new FormData()
    fd.set('siteTitle', 'X')
    fd.set('metaDescription', '')
    fd.set('ogImageUrl', '')
    fd.set('canonicalBaseUrl', '')

    const { saveSeo } = await import('@/app/admin/seo/actions')
    await expect(saveSeo(fd)).rejects.toThrow('Not found')

    expect(client.upsert).not.toHaveBeenCalled()
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it('returns ok:false when DB upsert fails', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({
      upsertResponse: { data: null, error: { message: 'DB write failed' } },
    })
    ;(svc.createServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const fd = new FormData()
    fd.set('siteTitle', 'X')
    fd.set('metaDescription', '')
    fd.set('ogImageUrl', '')
    fd.set('canonicalBaseUrl', '')

    const { saveSeo } = await import('@/app/admin/seo/actions')
    const result = await saveSeo(fd)

    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toMatch(/DB write failed/)
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })
})
