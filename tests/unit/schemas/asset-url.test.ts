/**
 * Phase 190 Plan 01 — URL-01: the 7 asset-URL validators must accept a
 * same-origin `/storage/…` path as well as an absolute URL.
 *
 * Why this matters BEFORE any writer is repointed (Plan 02): the admin SEO /
 * landing / price-book forms round-trip their own stored value. The moment a
 * stored value becomes relative, a `z.string().url()` field rejects the user's
 * own data on the next save — with a validation error on a field they never
 * touched. Relaxing the validators first makes Plan 02 a non-event.
 *
 * The two fields that must STAY strict are asserted here too, so a future
 * "relax them all" sweep fails loudly.
 */
import { describe, it, expect } from 'vitest'
import { assetUrlString } from '@/lib/schemas/asset-url'
import { seoSchema, landingContentSchema, blogPostSchema } from '@/lib/schemas/admin'
import { priceBookItemSchema } from '@/lib/schemas/price-book'

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const SUPABASE_URL =
  'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/x.webp'
const OG_PATH = '/storage/platform-brand/og-images/1784854705622-x.png'
const PHOTO_PATH = `/storage/photos/${UUID}/price-book/1784854705622-${UUID}.webp`

describe('assetUrlString', () => {
  const schema = assetUrlString()

  it.each([
    ['an existing absolute Supabase URL', SUPABASE_URL],
    ['a same-origin platform-brand path', OG_PATH],
    ['a same-origin photos path', PHOTO_PATH],
    ['an external image URL', 'https://images.example.com/a.png'],
  ])('accepts %s', (_label, value) => {
    expect(schema.safeParse(value).success).toBe(true)
  })

  it.each([
    ['nonsense', 'not a url'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a protocol-relative URL', '//evil.test/storage/logos/x'],
    ['an arbitrary same-origin path', '/etc/passwd'],
    ['a /storage path with no bucket', '/storage'],
    ['a bucket outside the allowlist', '/storage/estimates/x'],
    ['a traversal', '/storage/logos/../../etc/passwd'],
    ['empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(schema.safeParse(value).success).toBe(false)
  })

  it('carries a custom message when one is passed', () => {
    const result = assetUrlString('Must be a valid URL').safeParse('not a url')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be a valid URL')
    }
  })
})

describe('seoSchema.ogImageUrl', () => {
  const base = { siteTitle: 'X', metaDescription: 'd', canonicalBaseUrl: 'https://xtimator.com' }

  it('accepts a same-origin path and returns it unchanged', () => {
    const parsed = seoSchema.parse({ ...base, ogImageUrl: OG_PATH })
    expect(parsed.ogImageUrl).toBe(OG_PATH)
  })

  it('still accepts an absolute URL', () => {
    expect(seoSchema.parse({ ...base, ogImageUrl: SUPABASE_URL }).ogImageUrl).toBe(SUPABASE_URL)
  })

  it('still normalizes empty string to null', () => {
    expect(seoSchema.parse({ ...base, ogImageUrl: '' }).ogImageUrl).toBeNull()
  })

  it('still accepts null', () => {
    expect(seoSchema.parse({ ...base, ogImageUrl: null }).ogImageUrl).toBeNull()
  })

  it('still rejects a non-URL', () => {
    expect(seoSchema.safeParse({ ...base, ogImageUrl: 'nope' }).success).toBe(false)
  })
})

describe('seoSchema.canonicalBaseUrl stays STRICT (not an asset field)', () => {
  const base = { siteTitle: 'X', metaDescription: 'd', ogImageUrl: null }

  it('rejects a relative /storage path', () => {
    expect(
      seoSchema.safeParse({ ...base, canonicalBaseUrl: '/storage/platform-brand/x.png' }).success,
    ).toBe(false)
  })

  it('rejects any relative path', () => {
    expect(seoSchema.safeParse({ ...base, canonicalBaseUrl: '/x' }).success).toBe(false)
  })

  it('still accepts an absolute URL and empty string', () => {
    expect(seoSchema.parse({ ...base, canonicalBaseUrl: 'https://xtimator.com' }).canonicalBaseUrl)
      .toBe('https://xtimator.com')
    expect(seoSchema.parse({ ...base, canonicalBaseUrl: '' }).canonicalBaseUrl).toBeNull()
  })
})

describe('blogPostSchema.coverImageUrl stays STRICT (pasted external URLs only)', () => {
  const base = {
    title: 'T',
    slug: 'a-slug',
    content: 'c',
    excerpt: null,
    status: 'draft' as const,
    metaTitle: null,
    metaDescription: null,
  }

  it('rejects a relative /storage path', () => {
    expect(blogPostSchema.safeParse({ ...base, coverImageUrl: OG_PATH }).success).toBe(false)
  })

  it('still accepts an absolute URL and normalizes empty string to null', () => {
    expect(
      blogPostSchema.parse({ ...base, coverImageUrl: 'https://img.example.com/a.png' })
        .coverImageUrl,
    ).toBe('https://img.example.com/a.png')
    expect(blogPostSchema.parse({ ...base, coverImageUrl: '' }).coverImageUrl).toBeNull()
  })
})

function landingPayload(overrides: Record<string, unknown> = {}) {
  return {
    heroHeadline: 'Headline',
    heroSubheadline: 'Sub',
    ctaLabel: 'Go',
    howItWorksSteps: [
      { eyebrow: 'a', title: 'a', description: 'a' },
      { eyebrow: 'b', title: 'b', description: 'b' },
      { eyebrow: 'c', title: 'c', description: 'c' },
    ],
    features: [{ icon: 'i', title: 't', description: 'd', benefit: 'b' }],
    ...overrides,
  }
}

describe('landingContentSchema asset fields accept same-origin paths', () => {
  const HERO = '/storage/platform-brand/hero-images/1784854705622-x.webp'
  const BG = '/storage/platform-brand/hero-bg/1784854705622-x.webp'
  const VIDEO = '/storage/platform-brand/hero-bg-videos/1784854705622-x.mp4'

  it('parses all five relative asset URLs unchanged', () => {
    const parsed = landingContentSchema.parse(
      landingPayload({
        heroImageUrl: HERO,
        heroBackgroundImageUrl: BG,
        // NOTE: the validator is relaxed (harmless superset), but this field's
        // WRITER is deliberately NOT repointed — the proxy has no Range/206 and
        // Safari refuses to play a <video> from such an origin. Plan 02, B1.
        heroBackgroundVideoUrl: VIDEO,
        howItWorksSteps: [
          { eyebrow: 'a', title: 'a', description: 'a', imageUrl: OG_PATH },
          { eyebrow: 'b', title: 'b', description: 'b' },
          { eyebrow: 'c', title: 'c', description: 'c' },
        ],
        features: [{ icon: 'i', title: 't', description: 'd', benefit: 'b', imageUrl: OG_PATH }],
      }),
    )

    expect(parsed.heroImageUrl).toBe(HERO)
    expect(parsed.heroBackgroundImageUrl).toBe(BG)
    expect(parsed.heroBackgroundVideoUrl).toBe(VIDEO)
    expect(parsed.howItWorksSteps[0].imageUrl).toBe(OG_PATH)
    expect(parsed.features[0].imageUrl).toBe(OG_PATH)
  })

  it('still accepts absolute URLs on every asset field', () => {
    const parsed = landingContentSchema.parse(
      landingPayload({
        heroImageUrl: SUPABASE_URL,
        heroBackgroundImageUrl: SUPABASE_URL,
        heroBackgroundVideoUrl: SUPABASE_URL,
        howItWorksSteps: [
          { eyebrow: 'a', title: 'a', description: 'a', imageUrl: SUPABASE_URL },
          { eyebrow: 'b', title: 'b', description: 'b' },
          { eyebrow: 'c', title: 'c', description: 'c' },
        ],
        features: [
          { icon: 'i', title: 't', description: 'd', benefit: 'b', imageUrl: SUPABASE_URL },
        ],
      }),
    )
    expect(parsed.heroImageUrl).toBe(SUPABASE_URL)
    expect(parsed.features[0].imageUrl).toBe(SUPABASE_URL)
  })

  it('still normalizes empty string to null on every asset field', () => {
    const parsed = landingContentSchema.parse(
      landingPayload({
        heroImageUrl: '',
        heroBackgroundImageUrl: '',
        heroBackgroundVideoUrl: '',
        howItWorksSteps: [
          { eyebrow: 'a', title: 'a', description: 'a', imageUrl: '' },
          { eyebrow: 'b', title: 'b', description: 'b' },
          { eyebrow: 'c', title: 'c', description: 'c' },
        ],
        features: [{ icon: 'i', title: 't', description: 'd', benefit: 'b', imageUrl: '' }],
      }),
    )
    expect(parsed.heroImageUrl).toBeNull()
    expect(parsed.heroBackgroundImageUrl).toBeNull()
    expect(parsed.heroBackgroundVideoUrl).toBeNull()
    expect(parsed.howItWorksSteps[0].imageUrl).toBeNull()
    expect(parsed.features[0].imageUrl).toBeNull()
  })

  it('still omits the optional asset fields entirely', () => {
    const parsed = landingContentSchema.parse(landingPayload())
    expect(parsed.heroImageUrl).toBeUndefined()
  })

  it.each(['not a url', 'javascript:alert(1)', '/etc/passwd', '//evil.test/x'])(
    'still rejects %s on heroImageUrl',
    (bad) => {
      expect(landingContentSchema.safeParse(landingPayload({ heroImageUrl: bad })).success).toBe(
        false,
      )
    },
  )
})

describe('priceBookItemSchema.image_url', () => {
  const base = { name: 'Item', unit_price: 10 }

  it('accepts a same-origin photos path', () => {
    expect(priceBookItemSchema.parse({ ...base, image_url: PHOTO_PATH }).image_url).toBe(PHOTO_PATH)
  })

  it('still accepts an absolute URL', () => {
    expect(priceBookItemSchema.parse({ ...base, image_url: SUPABASE_URL }).image_url).toBe(
      SUPABASE_URL,
    )
  })

  it('still accepts empty string verbatim (no null coercion here)', () => {
    expect(priceBookItemSchema.parse({ ...base, image_url: '' }).image_url).toBe('')
  })

  it('still accepts the field being omitted', () => {
    expect(priceBookItemSchema.parse(base).image_url).toBeUndefined()
  })

  it.each(['not a url', 'javascript:alert(1)', '/etc/passwd'])('still rejects %s', (bad) => {
    expect(priceBookItemSchema.safeParse({ ...base, image_url: bad }).success).toBe(false)
  })
})
