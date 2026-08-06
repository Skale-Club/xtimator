/**
 * Phase 187 Plan 01 — PROXY-03 / PROXY-04: unit coverage for the pure
 * proxy-policy module (bucket allowlist, key normalization/traversal
 * rejection, per-bucket cache policy).
 */
import { describe, it, expect } from 'vitest'
import {
  PROXY_BUCKETS,
  CACHE_CONTROL_BY_BUCKET,
  CACHE_IMMUTABLE,
  CACHE_REVALIDATE,
  CACHE_PRIVATE,
  isProxyBucket,
  isPubliclyReadableBucket,
  normalizeProxyKey,
  cacheControlFor,
  type ProxyBucket,
} from '@/lib/storage/proxy-policy'

describe('isProxyBucket', () => {
  it.each(['audio', 'photos', 'pdfs', 'logos', 'platform-brand'])(
    'accepts real bucket %s',
    (bucket) => {
      expect(isProxyBucket(bucket)).toBe(true)
    },
  )

  it.each(['estimates', 'PHOTOS', 'photos ', '', 'photos/../logos'])(
    'rejects %j',
    (bucket) => {
      expect(isProxyBucket(bucket)).toBe(false)
    },
  )
})

describe('isPubliclyReadableBucket', () => {
  it.each(['logos', 'platform-brand'] as ProxyBucket[])(
    '%s is publicly readable',
    (bucket) => {
      expect(isPubliclyReadableBucket(bucket)).toBe(true)
    },
  )

  it.each(['photos', 'audio', 'pdfs'] as ProxyBucket[])(
    '%s is NOT publicly readable',
    (bucket) => {
      expect(isPubliclyReadableBucket(bucket)).toBe(false)
    },
  )
})

describe('normalizeProxyKey', () => {
  it('joins legal segments with /', () => {
    expect(normalizeProxyKey(['co-uuid', 'proj', 'shot.webp'])).toBe(
      'co-uuid/proj/shot.webp',
    )
  })

  it('accepts extensionless keys (the production norm)', () => {
    expect(normalizeProxyKey(['platform', '1784854705622-kvwo24'])).toBe(
      'platform/1784854705622-kvwo24',
    )
  })

  it('rejects an empty segments array', () => {
    expect(normalizeProxyKey([])).toBeNull()
  })

  it('rejects a single empty-string segment', () => {
    expect(normalizeProxyKey([''])).toBeNull()
  })

  it('rejects a leading traversal segment', () => {
    expect(normalizeProxyKey(['..', 'secrets'])).toBeNull()
  })

  it('rejects a mid-path traversal segment', () => {
    expect(normalizeProxyKey(['a', '..', 'b'])).toBeNull()
  })

  it('rejects a single-dot segment', () => {
    expect(normalizeProxyKey(['.'])).toBeNull()
  })

  it('rejects a percent-encoded traversal segment', () => {
    expect(normalizeProxyKey(['%2e%2e', 'x'])).toBeNull()
  })

  it('rejects a segment containing a backslash', () => {
    expect(normalizeProxyKey(['a\\b'])).toBeNull()
  })

  it('rejects a segment containing a NUL character', () => {
    expect(normalizeProxyKey(['a' + String.fromCharCode(0) + 'b'])).toBeNull()
  })

  it('rejects a segment containing a forward slash', () => {
    expect(normalizeProxyKey(['a/b'])).toBeNull()
  })

  it('rejects a joined key longer than 1024 chars', () => {
    const longSegment = 'a'.repeat(1025)
    expect(normalizeProxyKey([longSegment])).toBeNull()
  })

  it('accepts a joined key at exactly 1024 chars', () => {
    const longSegment = 'a'.repeat(1024)
    expect(normalizeProxyKey([longSegment])).toBe(longSegment)
  })
})

describe('cacheControlFor — three distinct policies pinned individually (B1)', () => {
  it('platform-brand is immutable for a year', () => {
    expect(cacheControlFor('platform-brand')).toBe(
      'public, max-age=31536000, immutable',
    )
  })

  it('logos is public but revalidating, NOT immutable', () => {
    expect(cacheControlFor('logos')).toBe(
      'public, max-age=300, stale-while-revalidate=86400',
    )
  })

  it.each(['photos', 'audio', 'pdfs'] as ProxyBucket[])(
    '%s is private, no-store',
    (bucket) => {
      expect(cacheControlFor(bucket)).toBe('private, no-store')
    },
  )

  it('logos does not contain immutable and has max-age <= 3600', () => {
    const value = cacheControlFor('logos')
    expect(value).not.toContain('immutable')
    const match = value.match(/max-age=(\d+)/)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBeLessThanOrEqual(3600)
  })

  it('logos starts with public (it must still reach the edge)', () => {
    expect(cacheControlFor('logos').startsWith('public')).toBe(true)
  })

  it.each(['photos', 'audio', 'pdfs'] as ProxyBucket[])(
    '%s contains neither public nor immutable',
    (bucket) => {
      const value = cacheControlFor(bucket)
      expect(value).not.toContain('public')
      expect(value).not.toContain('immutable')
    },
  )

  it('CACHE_CONTROL_BY_BUCKET keys match PROXY_BUCKETS exactly (sorted)', () => {
    const mapKeys = Object.keys(CACHE_CONTROL_BY_BUCKET).sort()
    const bucketKeys = [...PROXY_BUCKETS].sort()
    expect(mapKeys).toEqual(bucketKeys)
  })

  it('every CACHE_CONTROL_BY_BUCKET value is one of the three exported literals', () => {
    const allowed = new Set([CACHE_IMMUTABLE, CACHE_REVALIDATE, CACHE_PRIVATE])
    for (const value of Object.values(CACHE_CONTROL_BY_BUCKET)) {
      expect(allowed.has(value)).toBe(true)
    }
  })
})
