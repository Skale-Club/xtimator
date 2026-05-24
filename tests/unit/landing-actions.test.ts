import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/storage', () => ({ createStorage: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ invalidatePlatformConfig: vi.fn() }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const VALID_CONTENT = {
  heroHeadline: 'Professional estimates in 5 minutes.',
  heroSubheadline: 'Record a site walkthrough and let AI draft the scope.',
  ctaLabel: 'Start free',
  heroImageUrl: null,
  howItWorksSteps: [
    { eyebrow: 'Step 1', title: 'Record audio', description: 'Walk the property.' },
    { eyebrow: 'Step 2', title: 'Add photos', description: 'Drop in site photos.' },
    { eyebrow: 'Step 3', title: 'Get estimate', description: 'Review the draft.' },
  ],
  features: [
    { icon: 'BrainCircuit', title: 'AI draft', description: 'Turns notes into scope.', benefit: 'Skip the blank page' },
    { icon: 'FileBadge2', title: 'Branded PDF', description: 'Polished output.', benefit: 'Look professional' },
    { icon: 'Link2', title: 'Share link', description: 'Live estimate link.', benefit: 'Faster response' },
    { icon: 'Smartphone', title: 'Mobile-first', description: 'iPhone and Android.', benefit: 'Works where you work' },
  ],
}

function makeFormData(content: typeof VALID_CONTENT, extra?: { file?: File; removed?: boolean }) {
  const fd = new FormData()
  fd.set('content', JSON.stringify(content))
  if (extra?.file) fd.set('heroImageFile', extra.file)
  fd.set('heroImageRemoved', String(extra?.removed ?? false))
  return fd
}

function makeServiceClient(opts: {
  upsertResponse?: { error: { message: string } | null }
  existingBranding?: { app_name: string } | null
}) {
  const upsertResp = opts.upsertResponse ?? { error: null }
  const upsert = vi.fn().mockResolvedValue(upsertResp)
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.existingBranding ?? null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ upsert, select })
  return { from, upsert, select, eq, maybeSingle }
}

describe('saveLandingContent server action (LP-01)', () => {
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

  it('saves heroHeadline, heroSubheadline, ctaLabel to platform_branding.landing_content JSONB', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    const result = await saveLandingContent(makeFormData(VALID_CONTENT))

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('platform_branding')
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg.id).toBe(1)
    expect(upsertArg.app_name).toBe('Xtimator')
    expect(upsertArg.landing_content.heroHeadline).toBe(VALID_CONTENT.heroHeadline)
    expect(upsertArg.landing_content.heroSubheadline).toBe(VALID_CONTENT.heroSubheadline)
    expect(upsertArg.landing_content.ctaLabel).toBe(VALID_CONTENT.ctaLabel)
  })

  it('preserves existing app_name when saving landing content', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({ existingBranding: { app_name: 'Custom App' } })
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    const result = await saveLandingContent(makeFormData(VALID_CONTENT))

    expect(result).toEqual({ ok: true })
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg.app_name).toBe('Custom App')
  })

  it('saves howItWorksSteps array (3 items) correctly', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    const result = await saveLandingContent(makeFormData(VALID_CONTENT))

    expect(result).toEqual({ ok: true })
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg.landing_content.howItWorksSteps).toHaveLength(3)
    expect(upsertArg.landing_content.howItWorksSteps[0]).toMatchObject({
      eyebrow: 'Step 1',
      title: 'Record audio',
    })
  })

  it('saves features array correctly', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    const result = await saveLandingContent(makeFormData(VALID_CONTENT))

    expect(result).toEqual({ ok: true })
    const upsertArg = client.upsert.mock.calls[0][0]
    expect(upsertArg.landing_content.features).toHaveLength(4)
    expect(upsertArg.landing_content.features[0]).toMatchObject({
      icon: 'BrainCircuit',
      title: 'AI draft',
    })
  })

  it('calls invalidatePlatformConfig after successful save', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    await saveLandingContent(makeFormData(VALID_CONTENT))

    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
  })

  it('revalidates / path after save', async () => {
    const svc = await import('@/lib/supabase/service')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    await saveLandingContent(makeFormData(VALID_CONTENT))

    const { revalidatePath } = await import('next/cache')
    expect(revalidatePath as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('/')
  })

  it('returns validation error for malformed input', async () => {
    const svc = await import('@/lib/supabase/service')
    const cfg = await import('@/lib/platform-config')
    const client = makeServiceClient({})
    ;(svc.requireServiceClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const { saveLandingContent } = await import('@/app/admin/landing/actions')
    // heroHeadline is empty -- violates min(1)
    const result = await saveLandingContent(
      makeFormData({ ...VALID_CONTENT, heroHeadline: '' })
    )

    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toBeTruthy()
    expect(client.upsert).not.toHaveBeenCalled()
    expect(cfg.invalidatePlatformConfig as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })
})
