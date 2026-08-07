// @vitest-environment node
//
// Phase 190 Plan 02 — URL-01: saveLandingContent's asset writers.
//
// Four of the five platform-brand assets this action writes must persist a
// SAME-ORIGIN path. The fifth — the hero background VIDEO — deliberately must
// NOT. See the B1 block below; that case is asserted POSITIVELY so a future
// contributor cannot "finish the job" without a test going red.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const SUPABASE_PUBLIC = 'https://example.supabase.co/storage/v1/object/public'

const storageMocks = vi.hoisted(() => ({
  upload: vi.fn(async (_bucket: string, path: string) => ({ path })),
  getPublicUrl: vi.fn(
    (bucket: string, path: string) =>
      `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
  ),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/storage/server', () => ({
  serverStorage: () => ({
    upload: storageMocks.upload,
    getPublicUrl: storageMocks.getPublicUrl,
    delete: storageMocks.remove,
  }),
}))

vi.mock('@/lib/image/webp', () => ({
  convertImageToWebp: vi.fn(async () => Buffer.from([0x01, 0x02, 0x03])),
}))

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', email: 'admin@test' })),
}))

vi.mock('@/lib/platform-config', () => ({ invalidatePlatformConfig: vi.fn() }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let lastUpsert: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: () => ({
      upsert: async (payload: Record<string, unknown>) => {
        lastUpsert = payload
        return { error: null }
      },
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { app_name: 'Xtimator' } }) }),
      }),
    }),
  }),
}))

import { saveLandingContent } from '@/app/admin/landing/actions'

const BASE_CONTENT = {
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

function imageFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

function videoFile(name = 'loop.mp4'): File {
  return new File([new Uint8Array([0x00, 0x01])], name, { type: 'video/mp4' })
}

function formData(
  content: Record<string, unknown>,
  files: Record<string, File> = {},
): FormData {
  const fd = new FormData()
  fd.set('content', JSON.stringify(content))
  for (const [key, file] of Object.entries(files)) fd.set(key, file)
  return fd
}

function persisted(): Record<string, unknown> {
  return (lastUpsert?.landing_content ?? {}) as Record<string, unknown>
}

function expectSameOrigin(value: unknown): void {
  expect(typeof value).toBe('string')
  const url = value as string
  expect(url.startsWith('/storage/platform-brand/')).toBe(true)
  expect(url).not.toContain('://')
  expect(url).not.toContain('supabase.co')
}

beforeEach(() => {
  lastUpsert = null
  storageMocks.upload.mockClear()
  storageMocks.getPublicUrl.mockClear()
  storageMocks.remove.mockClear()
})

describe('saveLandingContent — same-origin asset paths (URL-01)', () => {
  it('hero image persists a same-origin path', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, { heroImageFile: imageFile('hero.png') }),
    )

    expect(res.ok).toBe(true)
    const url = persisted().heroImageUrl
    expect(url).toMatch(/^\/storage\/platform-brand\/hero-images\/\d+-hero\.webp$/)
    expectSameOrigin(url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('hero background IMAGE persists a same-origin path', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, { heroBackgroundImageFile: imageFile('backdrop.png') }),
    )

    expect(res.ok).toBe(true)
    const url = persisted().heroBackgroundImageUrl
    expect(url).toMatch(/^\/storage\/platform-brand\/hero-bg-images\/\d+-backdrop\.webp$/)
    expectSameOrigin(url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('step images persist same-origin paths IN INDEX ORDER', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, {
        stepImageFile_0: imageFile('one.png'),
        stepImageFile_1: imageFile('two.png'),
        stepImageFile_2: imageFile('three.png'),
      }),
    )

    expect(res.ok).toBe(true)
    const steps = persisted().howItWorksSteps as Array<{ title: string; imageUrl: string }>
    expect(steps).toHaveLength(3)
    steps.forEach((step, i) => {
      expect(step.imageUrl).toMatch(
        new RegExp(`^/storage/platform-brand/step-images/\\d+-step-${i}\\.webp$`),
      )
      expectSameOrigin(step.imageUrl)
    })
    // Index order is preserved: step N's URL carries the -step-N suffix.
    expect(steps.map((s) => s.title)).toEqual(['Record audio', 'Add photos', 'Get estimate'])
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('feature images persist same-origin paths IN INDEX ORDER', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, {
        featureImageFile_0: imageFile('a.png'),
        featureImageFile_1: imageFile('b.png'),
        featureImageFile_2: imageFile('c.png'),
      }),
    )

    expect(res.ok).toBe(true)
    const features = persisted().features as Array<{ title: string; imageUrl: string | null }>
    expect(features).toHaveLength(4)
    for (let i = 0; i < 3; i++) {
      expect(features[i].imageUrl).toMatch(
        new RegExp(`^/storage/platform-brand/feature-images/\\d+-feature-${i}\\.webp$`),
      )
      expectSameOrigin(features[i].imageUrl)
    }
    // The 4th feature had no upload and no remove flag: its existing value stays.
    expect(features[3].imageUrl).toBeNull()
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('a step that was NOT re-uploaded keeps its existing value, absolute or relative', async () => {
    const content = {
      ...BASE_CONTENT,
      howItWorksSteps: [
        { ...BASE_CONTENT.howItWorksSteps[0], imageUrl: `${SUPABASE_PUBLIC}/platform-brand/step-images/1-old.webp` },
        { ...BASE_CONTENT.howItWorksSteps[1], imageUrl: '/storage/platform-brand/step-images/2-newer.webp' },
        { ...BASE_CONTENT.howItWorksSteps[2] },
      ],
    }

    const res = await saveLandingContent(formData(content))

    expect(res.ok).toBe(true)
    const steps = persisted().howItWorksSteps as Array<{ imageUrl: string | null }>
    // Pre-existing rows are NOT rewritten by this plan (that is Phase 192).
    expect(steps[0].imageUrl).toBe(`${SUPABASE_PUBLIC}/platform-brand/step-images/1-old.webp`)
    expect(steps[1].imageUrl).toBe('/storage/platform-brand/step-images/2-newer.webp')
    expect(steps[2].imageUrl).toBeNull()
  })
})

describe('saveLandingContent — B1: the hero background VIDEO stays ABSOLUTE', () => {
  /**
   * B1 — DELIBERATE EXEMPTION. This is the tripwire.
   *
   * The Phase 187 asset proxy is whole-object pass-through with no Range/206 and
   * no `Accept-Ranges`. Safari (desktop + iOS) refuses to play a `<video>` served
   * from an origin that does not honour byte-range requests, and this asset is
   * rendered as a bare `<video autoPlay muted loop playsInline>` in
   * components/landing/hero-section.tsx at up to 20MB with no transcoding.
   *
   * PREREQUISITE before this may be repointed: the asset proxy must support
   * Range/206 + `Accept-Ranges`. Until then, repointing it trades a working video
   * for one that is broken on every Apple device.
   *
   * If you are here because this test failed after you made the video relative:
   * that is the test doing its job. Revert, or land Range support first.
   */
  it('persists an ABSOLUTE storage URL for the background video — NOT a /storage/ path', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, { heroBackgroundVideoFile: videoFile('loop.mp4') }),
    )

    expect(res.ok).toBe(true)
    const url = persisted().heroBackgroundVideoUrl as string

    expect(url.startsWith('/storage/')).toBe(false)
    expect(url).toContain('://')
    expect(url).toMatch(/^https?:\/\//)
    expect(url).toContain('/platform-brand/hero-bg-videos/')

    // The video branch is the ONE site in this action still allowed to mint a
    // backend URL, so a blanket not.toHaveBeenCalled() here would be WRONG.
    expect(storageMocks.getPublicUrl).toHaveBeenCalledTimes(1)
    expect(storageMocks.getPublicUrl).toHaveBeenCalledWith(
      'platform-brand',
      expect.stringMatching(/^hero-bg-videos\/\d+-loop\.mp4$/),
    )
  })

  it('uploading a video alongside images repoints only the images', async () => {
    const res = await saveLandingContent(
      formData(BASE_CONTENT, {
        heroImageFile: imageFile('hero.png'),
        heroBackgroundImageFile: imageFile('backdrop.png'),
        heroBackgroundVideoFile: videoFile('loop.webm'),
      }),
    )

    expect(res.ok).toBe(true)
    expectSameOrigin(persisted().heroImageUrl)
    expectSameOrigin(persisted().heroBackgroundImageUrl)
    expect(persisted().heroBackgroundVideoUrl as string).toMatch(/^https?:\/\//)
    // Exactly one backend-URL mint in the whole action: the video.
    expect(storageMocks.getPublicUrl).toHaveBeenCalledTimes(1)
  })
})
