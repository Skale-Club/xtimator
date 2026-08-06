/**
 * Phase 187 Plan 01 — PROXY-03 / PROXY-04: pure policy module for the
 * same-origin asset proxy.
 *
 * This file is intentionally pure: no `import 'server-only'`, no env reads,
 * no I/O. It must stay importable from unit tests, from the route handler
 * (Plan 03), and from `scripts/r2-verify.ts` (Plan 02) under plain `tsx`.
 *
 * Answers exactly three questions:
 *   1. Is this bucket one of the five real buckets? (allowlist)
 *   2. Is this key legal, or does it look like a traversal attempt? (normalize)
 *   3. How may an object from this bucket be cached? (cache policy)
 *
 * --- B1: access and cache are two DELIBERATELY SEPARATE axes ---
 *
 * Access axis (PUBLICLY_READABLE_BUCKETS): who may fetch the object without
 * authenticating. `logos` and `platform-brand` are public today in Supabase;
 * `photos`/`audio`/`pdfs` hold tenant job-site data and are private.
 *
 * Cache axis (CACHE_CONTROL_BY_BUCKET): how long a copy may be kept, per
 * bucket. An earlier draft derived the cache directive from the access
 * boolean (public => immutable). That is a BUG and must not be
 * reintroduced:
 *
 *   `logos` writers all use a STABLE key with `upsert: true`
 *   (`{companyUuid}/logo.webp`, `user-avatars/{userId}/avatar.webp`,
 *   `{companyUuid}/clients/{clientId}/logo.webp`), so the URL is
 *   byte-identical after the image changes. `immutable` for a year would
 *   pin the OLD logo in Cloudflare's edge cache *and* in every browser that
 *   already fetched it — and browser caches cannot be purged. `logos`
 *   therefore gets a short, revalidating public cache directive instead.
 *
 *   `platform-brand` is the opposite: its keys are timestamped
 *   (`hero-images/{Date.now()}-...`, `logo-{Date.now()}.webp`,
 *   `og-images/{Date.now()}-....{ext}`), so a new asset is always a new
 *   URL and a full year `immutable` is exactly right.
 *
 *   `logos` may become immutable once its writers move to versioned keys —
 *   tracked as a Phase 190 candidate improvement, not done here.
 *
 * The private buckets' `private, no-store` is a SECURITY property, not a
 * performance choice: `photos`/`audio`/`pdfs` hold tenant job-site data and
 * must never enter Cloudflare's shared edge cache (or any shared cache).
 */

export const PROXY_BUCKETS = ['audio', 'photos', 'pdfs', 'logos', 'platform-brand'] as const
export type ProxyBucket = (typeof PROXY_BUCKETS)[number]

const PROXY_BUCKET_SET = new Set<string>(PROXY_BUCKETS)

/** Access axis - who may fetch without authenticating. See file header (B1). */
const PUBLICLY_READABLE_BUCKETS = new Set<ProxyBucket>(['logos', 'platform-brand'])

/** The three (and only three) cache directives this proxy ever emits. */
export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
export const CACHE_REVALIDATE = 'public, max-age=300, stale-while-revalidate=86400'
export const CACHE_PRIVATE = 'private, no-store'

/**
 * Cache axis - per-bucket, pinned individually (B1). Record<ProxyBucket, string>
 * makes it a compile-time error to add a sixth bucket to PROXY_BUCKETS without
 * an explicit cache choice here; the unit test enforces the same thing at
 * runtime (matrix test).
 */
export const CACHE_CONTROL_BY_BUCKET: Record<ProxyBucket, string> = {
  audio: CACHE_PRIVATE,
  photos: CACHE_PRIVATE,
  pdfs: CACHE_PRIVATE,
  logos: CACHE_REVALIDATE,
  'platform-brand': CACHE_IMMUTABLE,
}

export function isProxyBucket(value: string): value is ProxyBucket {
  return PROXY_BUCKET_SET.has(value)
}

export function isPubliclyReadableBucket(bucket: ProxyBucket): boolean {
  return PUBLICLY_READABLE_BUCKETS.has(bucket)
}

export function cacheControlFor(bucket: ProxyBucket): string {
  return CACHE_CONTROL_BY_BUCKET[bucket]
}

const MAX_KEY_LENGTH = 1024
const NUL_CHAR_CODE = 0

/**
 * Reject-never-repair: a suspicious key is refused outright, never
 * sanitized-and-continued, so a caller cannot be tricked into reading a
 * neighbouring object via a crafted segment.
 */
export function normalizeProxyKey(segments: string[]): string | null {
  if (segments.length === 0) return null

  for (const segment of segments) {
    if (!isLegalSegment(segment)) return null

    // Belt and braces: Next.js already decodes route params, but reject a
    // segment whose decoded form is itself "." or "..". A decode that
    // throws (malformed percent-encoding) is itself a rejection.
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return null
    }
    if (decoded === '.' || decoded === '..') return null
  }

  const key = segments.join('/')
  if (key.length > MAX_KEY_LENGTH) return null

  return key
}

function isLegalSegment(segment: string): boolean {
  if (segment.length === 0) return false
  if (segment === '.' || segment === '..') return false
  if (containsForbiddenChar(segment)) return false
  return true
}

/**
 * Checked by char code (not a raw literal in a string) so the NUL and
 * backslash checks are unambiguous and never mangled by source-level
 * escaping quirks.
 */
function containsForbiddenChar(segment: string): boolean {
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i)
    if (code === NUL_CHAR_CODE) return true // NUL
    if (code === 47) return true // '/'
    if (code === 92) return true // '\'
  }
  return false
}
