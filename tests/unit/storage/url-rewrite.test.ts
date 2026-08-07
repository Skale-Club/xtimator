/**
 * Phase 192 Plan 01 — URL-02: unit coverage for the pure URL translation layer
 * (parser + exemption rules + JSON deep walk).
 *
 * Three properties are load-bearing here, because Plan 03 runs this logic
 * against PRODUCTION rows and must not be discovering it there:
 *
 *  1. IDEMPOTENCY — a value already in the same-origin form comes back
 *     byte-identical, forever. Running the rewrite twice is a no-op.
 *  2. The VIDEO EXEMPTION is asserted POSITIVELY, not by omission. A
 *     `hero-bg-videos/` leaf must stay on its absolute Supabase URL (see the
 *     module header and app/admin/landing/actions.ts's writer exemption).
 *  3. The emitted path is compared against the REAL `storageProxyPath` output,
 *     never against a string literal — a second emitter is exactly the drift
 *     lib/storage/asset-url.ts's header exists to prevent.
 */
import { describe, it, expect } from 'vitest'
import { storageProxyPath, type PersistableProxyBucket } from '@/lib/storage/asset-url'
import {
  parseSupabasePublicUrl,
  isExemptFromRewrite,
  rewriteAssetUrl,
  rewriteJsonAssetUrls,
} from '@/lib/storage/url-rewrite'

/** The real production project ref (see CONTEXT.md). */
const HOST = 'prmqgcrnpuvpzruyzvuv.supabase.co'
const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

/** Builds the exact persisted form: segments percent-encoded, no query/fragment. */
function publicUrl(bucket: string, key: string, host = HOST): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `https://${host}/storage/v1/object/public/${bucket}/${encoded}`
}

/**
 * Same real-world key shapes as tests/unit/storage/asset-url.test.ts, so the
 * equality matrix below covers the encoding edge cases that module already
 * pins down.
 */
const KEY_FIXTURES: Array<[label: string, bucket: PersistableProxyBucket, key: string]> = [
  ['company-UUID-prefixed', 'logos', `${UUID}/logo.webp`],
  ['extensionless (real production shape)', 'platform-brand', 'platform/1784854705622-kvwo24'],
  ['key with a space', 'platform-brand', 'og-images/1784854705622-my file.png'],
  ['key with a +', 'platform-brand', 'hero-images/1784854705622-a+b.png'],
  ['key with a %', 'platform-brand', 'og-images/100%25done.png'],
  ['key with a non-ASCII char', 'photos', `${UUID}/price-book/café.webp`],
  ['key with URL-significant chars', 'photos', `${UUID}/price-book/a#b?c&d.webp`],
  ['single-segment key', 'logos', 'logo.webp'],
]

describe('parseSupabasePublicUrl', () => {
  it('extracts bucket and (decoded) key from the persisted public form', () => {
    expect(
      parseSupabasePublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/logos/uuid/logo.webp'
      )
    ).toEqual({ bucket: 'logos', key: 'uuid/logo.webp' })
  })

  it('decodes percent-escaped segments back to the raw storage key', () => {
    expect(
      parseSupabasePublicUrl(publicUrl('platform-brand', 'og-images/my file.png'))
    ).toEqual({ bucket: 'platform-brand', key: 'og-images/my file.png' })
  })

  it('returns null for the SIGNED form (a URL carrying a token is never rewritten)', () => {
    expect(
      parseSupabasePublicUrl(
        'https://abc.supabase.co/storage/v1/object/sign/photos/a/b.webp?token=eyJhbG'
      )
    ).toBeNull()
    expect(
      parseSupabasePublicUrl('https://abc.supabase.co/storage/v1/object/sign/photos/a/b.webp')
    ).toBeNull()
  })

  it('returns null for the AUTHENTICATED form', () => {
    expect(
      parseSupabasePublicUrl(
        'https://abc.supabase.co/storage/v1/object/authenticated/photos/a/b.webp'
      )
    ).toBeNull()
  })

  it('returns null for a non-Supabase host', () => {
    expect(parseSupabasePublicUrl('https://images.pexels.com/photos/1/x.jpeg')).toBeNull()
    // Lookalike hosts must not slip through a substring match.
    expect(
      parseSupabasePublicUrl('https://evil-supabase.co.attacker.net/storage/v1/object/public/logos/a.webp')
    ).toBeNull()
    expect(
      parseSupabasePublicUrl('https://supabase.co.evil.com/storage/v1/object/public/logos/a.webp')
    ).toBeNull()
  })

  it('returns null for a non-https protocol', () => {
    expect(
      parseSupabasePublicUrl('http://abc.supabase.co/storage/v1/object/public/logos/a.webp')
    ).toBeNull()
  })

  it('returns null when a query string or fragment is present (not the plain persisted form)', () => {
    expect(
      parseSupabasePublicUrl(
        'https://abc.supabase.co/storage/v1/object/public/logos/a.webp?width=200'
      )
    ).toBeNull()
    expect(
      parseSupabasePublicUrl('https://abc.supabase.co/storage/v1/object/public/logos/a.webp#top')
    ).toBeNull()
  })

  it('returns null for a bucket with no key at all', () => {
    expect(parseSupabasePublicUrl('https://abc.supabase.co/storage/v1/object/public/logos')).toBeNull()
    expect(parseSupabasePublicUrl('https://abc.supabase.co/storage/v1/object/public/logos/')).toBeNull()
  })

  it('returns null for garbage input', () => {
    expect(parseSupabasePublicUrl('not a url')).toBeNull()
    expect(parseSupabasePublicUrl('')).toBeNull()
  })
})

describe('isExemptFromRewrite — the hero background video', () => {
  it('exempts any key under hero-bg-videos/', () => {
    expect(isExemptFromRewrite('platform-brand', 'hero-bg-videos/x.mp4')).toBe(true)
    expect(isExemptFromRewrite('platform-brand', 'hero-bg-videos/1784854705622-clip.webm')).toBe(true)
  })

  it('does NOT exempt other platform-brand asset classes', () => {
    expect(isExemptFromRewrite('platform-brand', 'hero-images/x.webp')).toBe(false)
    expect(isExemptFromRewrite('platform-brand', 'og-images/x.png')).toBe(false)
    expect(isExemptFromRewrite('logos', `${UUID}/logo.webp`)).toBe(false)
  })

  it('matches on the key PREFIX, not the file extension', () => {
    // The writer chooses the directory. An .mp4 uploaded elsewhere is a
    // different asset class and is NOT this exemption.
    expect(isExemptFromRewrite('platform-brand', 'og-images/promo.mp4')).toBe(false)
    // ...and a substring match must not leak the exemption to a sibling dir.
    expect(isExemptFromRewrite('platform-brand', 'not-hero-bg-videos/x.mp4')).toBe(false)
    expect(isExemptFromRewrite('platform-brand', 'a/hero-bg-videos/x.mp4')).toBe(false)
  })
})

describe('rewriteAssetUrl', () => {
  it('converts a platform-brand hero image to the same-origin proxy path', () => {
    const result = rewriteAssetUrl(publicUrl('platform-brand', 'hero-images/1784-x.webp'))
    expect(result.changed).toBe(true)
    expect(result.value).toBe('/storage/platform-brand/hero-images/1784-x.webp')
  })

  it('converts a companies logo URL', () => {
    const result = rewriteAssetUrl(publicUrl('logos', `${UUID}/logo.webp`))
    expect(result.changed).toBe(true)
    expect(result.value).toBe(`/storage/logos/${UUID}/logo.webp`)
  })

  describe('VIDEO EXEMPTION — the hero background video stays ABSOLUTE', () => {
    it('leaves an .mp4 hero background video untouched and absolute', () => {
      const url = publicUrl('platform-brand', 'hero-bg-videos/1784-clip.mp4')
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.exempt).toBe(true)
      // byte-identical, and still absolute — the proxy has no Range/206.
      expect(result.value).toBe(url)
      expect(result.value as string).toMatch(/^https:\/\//)
    })

    it('leaves a .webm hero background video untouched and absolute', () => {
      const url = publicUrl('platform-brand', 'hero-bg-videos/1784-clip.webm')
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.exempt).toBe(true)
      expect(result.value).toBe(url)
      expect(result.value as string).toMatch(/^https:\/\//)
    })
  })

  /**
   * These assert WHY the refusal happened, not just that it happened.
   *
   * `changed: false` alone is a VACUOUS assertion here: if the bucket gate were
   * widened from PERSISTABLE_PROXY_BUCKETS (3) to all proxy buckets (5), an
   * `audio` URL would still come back `changed: false` — because
   * storageProxyPath would throw and it would be reported as `unserveable`
   * instead. Requiring `unserveable` to be FALSY pins the refusal to the bucket
   * gate itself, which is the invariant that matters. (Verified by mutation:
   * widening the gate makes these fail.)
   */
  describe('private delivery buckets are NEVER converted', () => {
    it('refuses an audio/ URL at the bucket gate', () => {
      const url = publicUrl('audio', `${UUID}/walkthrough.webm`)
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(url)
      expect(result.unserveable).toBeFalsy()
      expect(result.exempt).toBeFalsy()
    })

    it('refuses a pdfs/ URL at the bucket gate', () => {
      const url = publicUrl('pdfs', `${UUID}/estimate-1.pdf`)
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(url)
      expect(result.unserveable).toBeFalsy()
      expect(result.exempt).toBeFalsy()
    })

    it('refuses a bucket that is not a proxy bucket at all', () => {
      const url = publicUrl('avatars', 'x.webp')
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(url)
      expect(result.unserveable).toBeFalsy()
    })

    it('a private-bucket URL inside a JSONB document is left alone and not counted', () => {
      const doc = { audio: publicUrl('audio', `${UUID}/a.webm`), pdf: publicUrl('pdfs', `${UUID}/b.pdf`) }
      const result = rewriteJsonAssetUrls(doc)
      expect(result.changed).toBe(0)
      expect(result.unserveable).toBe(0)
      expect(result.value).toEqual(doc)
    })
  })

  describe('idempotency', () => {
    it('leaves a value already in the same-origin form byte-identical', () => {
      const path = '/storage/platform-brand/hero-images/1784-x.webp'
      const result = rewriteAssetUrl(path)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(path)
    })

    it('is a fixed point: re-running on its own output never changes it again', () => {
      const first = rewriteAssetUrl(publicUrl('platform-brand', 'hero-images/1784-x.webp'))
      expect(first.changed).toBe(true)

      const second = rewriteAssetUrl(first.value)
      expect(second.changed).toBe(false)
      expect(second.value).toBe(first.value)

      const third = rewriteAssetUrl(second.value)
      expect(third.changed).toBe(false)
      expect(third.value).toBe(first.value)
    })
  })

  describe('non-string and empty input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['number', 42],
      ['boolean', true],
      ['object', { a: 1 }],
      ['array', ['a']],
    ])('leaves %s untouched', (_label, input) => {
      const result = rewriteAssetUrl(input)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(input)
    })

    it('leaves an unrelated external URL untouched', () => {
      const url = 'https://images.pexels.com/photos/1/x.jpeg'
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.value).toBe(url)
    })
  })

  describe('a key storageProxyPath would REJECT is reported, never thrown', () => {
    const unserveable: Array<[label: string, url: string]> = [
      // %252e%252e survives WHATWG URL normalization (a bare %2e%2e does NOT —
      // the URL parser folds it away as a double-dot segment) and decodes to
      // "%2e%2e", which normalizeProxyKey's belt-and-braces decode rejects.
      ['traversal segment', `https://${HOST}/storage/v1/object/public/logos/%252e%252e/x.webp`],
      ['backslash in a segment', `https://${HOST}/storage/v1/object/public/logos/a%5Cb.webp`],
      ['empty inner segment', `https://${HOST}/storage/v1/object/public/logos//x.webp`],
      ['over-long key', publicUrl('logos', `${'a'.repeat(1200)}.webp`)],
    ]

    it.each(unserveable)('does not throw on %s', (_label, url) => {
      expect(() => rewriteAssetUrl(url)).not.toThrow()
    })

    it.each(unserveable)('reports %s as unserveable and leaves the value alone', (_label, url) => {
      const result = rewriteAssetUrl(url)
      expect(result.changed).toBe(false)
      expect(result.unserveable).toBe(true)
      expect(result.value).toBe(url)
    })

    it('does not flag a serveable key as unserveable', () => {
      const result = rewriteAssetUrl(publicUrl('logos', `${UUID}/logo.webp`))
      expect(result.unserveable).toBeFalsy()
    })
  })

  describe('emitted path equals storageProxyPath exactly', () => {
    it.each(KEY_FIXTURES)('%s', (_label, bucket, key) => {
      const result = rewriteAssetUrl(publicUrl(bucket, key))
      expect(result.changed).toBe(true)
      // Compared against the REAL emitter, not a literal.
      expect(result.value).toBe(storageProxyPath(bucket, key))
    })
  })
})

/**
 * Mirrors production's platform_branding.landing_content: 8 matching .webp
 * image URLs (1 hero-image, 3 step-images, 4 feature-images) PLUS the
 * hero-bg-videos leaf that must survive untouched.
 */
function landingContentFixture() {
  return {
    heroTitle: 'Estimates in minutes',
    heroImageUrl: publicUrl('platform-brand', 'hero-images/1784854705601-hero.webp'),
    heroBackgroundVideoUrl: publicUrl('platform-brand', 'hero-bg-videos/1784854705602-clip.mp4'),
    steps: [
      { title: 'Record', imageUrl: publicUrl('platform-brand', 'hero-images/1784854705603-step1.webp') },
      { title: 'Review', imageUrl: publicUrl('platform-brand', 'hero-images/1784854705604-step2.webp') },
      { title: 'Send', imageUrl: publicUrl('platform-brand', 'hero-images/1784854705605-step3.webp') },
    ],
    features: [
      { name: 'AI', image: publicUrl('platform-brand', 'hero-images/1784854705606-f1.webp') },
      { name: 'PDF', image: publicUrl('platform-brand', 'hero-images/1784854705607-f2.webp') },
      { name: 'Share', image: publicUrl('platform-brand', 'hero-images/1784854705608-f3.webp') },
      { name: 'Photos', image: publicUrl('platform-brand', 'hero-images/1784854705609-f4.webp') },
    ],
    ctaEnabled: true,
    columns: 3,
    tagline: null,
  }
}

describe('rewriteJsonAssetUrls', () => {
  it('rewrites all 8 production image URLs and leaves the video leaf ABSOLUTE', () => {
    const input = landingContentFixture()
    const original = landingContentFixture()
    const result = rewriteJsonAssetUrls(input)

    expect(result.changed).toBe(8)
    expect(result.exempt).toBe(1)
    expect(result.unserveable).toBe(0)

    const value = result.value as ReturnType<typeof landingContentFixture>
    expect(value.heroImageUrl).toBe('/storage/platform-brand/hero-images/1784854705601-hero.webp')
    expect(value.steps.map((s) => s.imageUrl)).toEqual([
      '/storage/platform-brand/hero-images/1784854705603-step1.webp',
      '/storage/platform-brand/hero-images/1784854705604-step2.webp',
      '/storage/platform-brand/hero-images/1784854705605-step3.webp',
    ])
    expect(value.features.map((f) => f.image)).toEqual([
      '/storage/platform-brand/hero-images/1784854705606-f1.webp',
      '/storage/platform-brand/hero-images/1784854705607-f2.webp',
      '/storage/platform-brand/hero-images/1784854705608-f3.webp',
      '/storage/platform-brand/hero-images/1784854705609-f4.webp',
    ])

    // THE tripwire: the background video is untouched and still absolute.
    expect(value.heroBackgroundVideoUrl).toBe(original.heroBackgroundVideoUrl)
    expect(value.heroBackgroundVideoUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\//)
    expect(value.heroBackgroundVideoUrl).toContain('hero-bg-videos/')
  })

  it('does not mutate the input document', () => {
    const input = landingContentFixture()
    rewriteJsonAssetUrls(input)
    expect(input).toEqual(landingContentFixture())
  })

  it('is idempotent over a whole document (second pass reports zero changes)', () => {
    const first = rewriteJsonAssetUrls(landingContentFixture())
    const second = rewriteJsonAssetUrls(first.value)
    expect(second.changed).toBe(0)
    expect(second.value).toEqual(first.value)
  })

  it('returns changed: 0 and a deep-equal value for a document with no matching URLs', () => {
    const doc = {
      title: 'Price book',
      items: [
        { name: 'Sod', imageUrl: 'https://images.pexels.com/photos/1/x.jpeg' },
        { name: 'Mulch', imageUrl: 'https://images.pexels.com/photos/2/y.jpeg' },
      ],
      count: 293,
    }
    const result = rewriteJsonAssetUrls(doc)
    expect(result.changed).toBe(0)
    expect(result.exempt).toBe(0)
    expect(result.unserveable).toBe(0)
    expect(result.value).toEqual(doc)
  })

  it('leaves non-string leaves and non-matching strings untouched', () => {
    const doc = { n: 42, b: false, z: null, s: 'hello', nested: { arr: [1, 'two', null, true] } }
    const result = rewriteJsonAssetUrls(doc)
    expect(result.changed).toBe(0)
    expect(result.value).toEqual(doc)
  })

  it('preserves key order and array order', () => {
    const input = landingContentFixture()
    const result = rewriteJsonAssetUrls(input) as { value: Record<string, unknown> }
    expect(Object.keys(result.value)).toEqual(Object.keys(input))
    const steps = (result.value.steps as Array<{ title: string }>).map((s) => s.title)
    expect(steps).toEqual(['Record', 'Review', 'Send'])
  })

  it('finds URLs at arbitrary depth without enumerating field names', () => {
    const doc = { a: { b: { c: [{ d: { anyFieldNameAtAll: publicUrl('logos', 'deep/logo.webp') } }] } } }
    const result = rewriteJsonAssetUrls(doc)
    expect(result.changed).toBe(1)
    expect(
      (result.value as typeof doc).a.b.c[0].d.anyFieldNameAtAll
    ).toBe('/storage/logos/deep/logo.webp')
  })

  it('counts unserveable leaves without throwing', () => {
    const doc = { good: publicUrl('logos', 'a/logo.webp'), bad: `https://${HOST}/storage/v1/object/public/logos/a%5Cb.webp` }
    const result = rewriteJsonAssetUrls(doc)
    expect(result.changed).toBe(1)
    expect(result.unserveable).toBe(1)
    expect((result.value as typeof doc).bad).toBe(doc.bad)
  })

  it('returns a deeply nested subtree untouched rather than recursing past the depth cap', () => {
    const url = publicUrl('logos', 'deep/logo.webp')
    let node: unknown = url
    for (let i = 0; i < 40; i++) node = { child: node }
    const result = rewriteJsonAssetUrls(node)
    expect(result.changed).toBe(0)
    expect(result.value).toEqual(node)
  })

  it('handles a bare string document and a bare null document', () => {
    const url = publicUrl('logos', 'a/logo.webp')
    expect(rewriteJsonAssetUrls(url)).toMatchObject({ changed: 1, value: '/storage/logos/a/logo.webp' })
    expect(rewriteJsonAssetUrls(null)).toMatchObject({ changed: 0, value: null })
  })
})
