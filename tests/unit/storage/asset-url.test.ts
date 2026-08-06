/**
 * Phase 190 Plan 01 — URL-01: unit coverage for the ONE same-origin asset URL
 * module (emitter / predicate / parser / absolutizer).
 *
 * The load-bearing test here is the ROUND-TRIP PROPERTY: every path
 * `storageProxyPath` emits must survive the exact journey a real request takes
 * (Next.js decodes each catch-all param, then the route hands them to
 * `normalizeProxyKey`) and come back as the original key. It imports the REAL
 * `normalizeProxyKey` from lib/storage/proxy-policy — never a copy — so the
 * emitter cannot drift away from the Phase 187 route that has to serve it.
 */
import { describe, it, expect } from 'vitest'
import { normalizeProxyKey } from '@/lib/storage/proxy-policy'
import {
  PERSISTABLE_PROXY_BUCKETS,
  storageProxyPath,
  isStorageProxyPath,
  parseStorageProxyPath,
  absoluteAssetUrl,
  isAcceptableAbsoluteAssetUrl,
  type PersistableProxyBucket,
} from '@/lib/storage/asset-url'

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

/**
 * Real-world key shapes. Note the `%` fixture is `100%25done`, NOT `100% done`:
 * a key whose literal `%` is not a valid percent-escape is UNSERVABLE by the
 * proxy (Next.js decodes the param, `normalizeProxyKey`'s decode throws, the
 * route 404s), so `storageProxyPath` refuses it on purpose — see the
 * "throws for a key normalizeProxyKey would reject" block.
 */
const KEY_FIXTURES: Array<[label: string, bucket: PersistableProxyBucket, key: string]> = [
  ['company-UUID-prefixed', 'logos', `${UUID}/logo.webp`],
  ['extensionless (real production shape)', 'platform-brand', 'platform/1784854705622-kvwo24'],
  ['key with a space', 'platform-brand', 'og-images/1784854705622-my file.png'],
  ['key with a +', 'platform-brand', 'hero-images/1784854705622-a+b.png'],
  ['key with a %', 'platform-brand', 'og-images/100%25done.png'],
  ['key with a non-ASCII char', 'photos', `${UUID}/price-book/café.webp`],
  ['single-segment key', 'logos', 'logo.webp'],
]

describe('PERSISTABLE_PROXY_BUCKETS', () => {
  it('is exactly logos, platform-brand, photos', () => {
    expect([...PERSISTABLE_PROXY_BUCKETS]).toEqual(['logos', 'platform-brand', 'photos'])
  })

  it('excludes the private delivery buckets audio and pdfs', () => {
    expect(PERSISTABLE_PROXY_BUCKETS).not.toContain('audio')
    expect(PERSISTABLE_PROXY_BUCKETS).not.toContain('pdfs')
  })
})

describe('storageProxyPath', () => {
  it('builds a same-origin path for a plain key', () => {
    expect(storageProxyPath('logos', 'abc/logo.webp')).toBe('/storage/logos/abc/logo.webp')
  })

  it('percent-encodes per SEGMENT and leaves the / separators literal', () => {
    expect(storageProxyPath('platform-brand', 'og-images/1784854705622-my file.png')).toBe(
      '/storage/platform-brand/og-images/1784854705622-my%20file.png',
    )
  })

  it('encodes a + so it cannot be read as a space', () => {
    expect(storageProxyPath('platform-brand', 'a+b.png')).toBe('/storage/platform-brand/a%2Bb.png')
  })

  it.each(['audio', 'pdfs', 'estimates'])(
    'throws for the non-persistable bucket %s',
    (bucket) => {
      expect(() =>
        // Deliberate cast: these are refused at the TYPE level too, so the
        // runtime guard can only be reached by lying to the compiler.
        storageProxyPath(bucket as PersistableProxyBucket, 'x/y.webp'),
      ).toThrow(/storageProxyPath/)
    },
  )

  it('never puts the raw key in the thrown message', () => {
    const secret = `${UUID}/private-job-site.webp`
    expect(() => storageProxyPath('audio' as PersistableProxyBucket, secret)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }),
    )
  })

  it.each([
    ['empty key', ''],
    ['dot-dot', '..'],
    ['traversal mid-key', 'a/../b'],
    ['encoded traversal', 'a/%2e%2e/b'],
    ['backslash', 'a\\b.webp'],
    ['leading slash (empty first segment)', '/a.webp'],
    ['double slash', 'a//b.webp'],
    ['unescaped percent', 'og-images/100% done.png'],
    ['over 1024 chars', 'a'.repeat(2000)],
  ])('throws for a key normalizeProxyKey would reject: %s', (_label, key) => {
    expect(() => storageProxyPath('logos', key)).toThrow(/storageProxyPath/)
  })

  it('a thrown key is one the proxy route genuinely could not serve', () => {
    // Guards the emitter against being "helpfully" relaxed: every key rejected
    // above is also rejected by the real route-side normalizer.
    expect(normalizeProxyKey('a/../b'.split('/'))).toBeNull()
    expect(normalizeProxyKey('og-images/100% done.png'.split('/'))).toBeNull()
  })
})

describe('round-trip property: emitted path -> Next.js decode -> normalizeProxyKey', () => {
  it.each(KEY_FIXTURES)('%s round-trips byte-identically', (_label, bucket, key) => {
    const path = storageProxyPath(bucket, key)
    const parsed = parseStorageProxyPath(path)
    expect(parsed).not.toBeNull()
    expect(parsed!.bucket).toBe(bucket)
    // Exactly what Next.js + app/storage/[bucket]/[...key]/route.ts do.
    expect(normalizeProxyKey(parsed!.segments.map(decodeURIComponent))).toBe(key)
  })
})

describe('isStorageProxyPath', () => {
  it('accepts a same-origin proxy path', () => {
    expect(isStorageProxyPath('/storage/logos/x')).toBe(true)
  })

  it.each([
    ['an absolute Supabase URL', 'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/x'],
    ['a lookalike prefix', '/storageplus/x'],
    ['a protocol-relative URL (cross-origin!)', '//evil.test/storage/logos/x'],
    ['a bare path', '/etc/passwd'],
    ['no bucket', '/storage'],
    ['an unknown bucket', '/storage/estimates/x'],
    ['no key', '/storage/logos/'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isStorageProxyPath(value)).toBe(false)
  })
})

describe('parseStorageProxyPath', () => {
  it('splits bucket and STILL-ENCODED segments', () => {
    expect(parseStorageProxyPath('/storage/platform-brand/og-images/a%20b.png')).toEqual({
      bucket: 'platform-brand',
      segments: ['og-images', 'a%20b.png'],
    })
  })

  it('parses the private buckets too (persistence is refused at emit time, not read time)', () => {
    expect(parseStorageProxyPath('/storage/audio/x.webm')?.bucket).toBe('audio')
  })

  it.each([
    ['unknown bucket', '/storage/estimates/x'],
    ['no key', '/storage/logos'],
    ['trailing slash only', '/storage/logos/'],
    ['not a storage path', '/images/logo.png'],
    ['absolute URL', 'https://xtimator.com/storage/logos/x'],
    ['protocol-relative', '//evil.test/storage/logos/x'],
    ['traversal', '/storage/logos/../../etc/passwd'],
    ['encoded traversal', '/storage/logos/%2e%2e/x'],
  ])('returns null for %s', (_label, value) => {
    expect(parseStorageProxyPath(value)).toBeNull()
  })
})

describe('absoluteAssetUrl', () => {
  it('joins a same-origin path onto the base', () => {
    expect(absoluteAssetUrl('/storage/logos/x', 'https://xtimator.com')).toBe(
      'https://xtimator.com/storage/logos/x',
    )
  })

  it('strips a trailing slash on the base (never //storage)', () => {
    expect(absoluteAssetUrl('/storage/logos/x', 'https://xtimator.com/')).toBe(
      'https://xtimator.com/storage/logos/x',
    )
  })

  it('returns an already-absolute URL BYTE-IDENTICAL (existing rows unaffected)', () => {
    const existing =
      'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/platform-brand/og-images/1784854705622-x.png'
    expect(absoluteAssetUrl(existing, 'https://xtimator.com')).toBe(existing)
  })

  it('passes null, undefined and empty string straight through', () => {
    expect(absoluteAssetUrl(null, 'https://xtimator.com')).toBeNull()
    expect(absoluteAssetUrl(undefined, 'https://xtimator.com')).toBeUndefined()
    expect(absoluteAssetUrl('', 'https://xtimator.com')).toBe('')
  })

  it('never rebases a protocol-relative URL onto our own origin', () => {
    expect(absoluteAssetUrl('//evil.test/x', 'https://xtimator.com')).toBe('//evil.test/x')
  })
})

describe('isAcceptableAbsoluteAssetUrl', () => {
  it.each([
    'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/x.webp',
    'http://localhost:3000/storage/logos/x.webp',
    'data:image/png;base64,iVBORw0KGgo=',
  ])('accepts %s', (value) => {
    expect(isAcceptableAbsoluteAssetUrl(value)).toBe(true)
  })

  it.each([
    ['a javascript: URL that new URL() happily parses', 'javascript:alert(1)'],
    ['a relative path', '/storage/logos/x'],
    ['a protocol-relative URL', '//evil.test/x'],
    ['nonsense', 'not a url'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(isAcceptableAbsoluteAssetUrl(value)).toBe(false)
  })
})
