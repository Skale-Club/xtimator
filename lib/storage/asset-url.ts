/**
 * Phase 190 Plan 01 — URL-01: the ONE place a same-origin asset URL is built.
 *
 * Every later plan in this phase (and every reader in Plans 03/04) goes through
 * this module. If the `/storage/{bucket}/{key}` form were re-derived at each of
 * the ~15 call sites it would drift, and a drifted URL is a permanently dead
 * image in a PDF or an email that has already been sent.
 *
 * PURE and BROWSER-SAFE, for the same reason `proxy-policy.ts` is: `lib/schemas/*`
 * imports this, and client components import those. No `import 'server-only'`,
 * no env read, no I/O, and deliberately NO `getCanonicalBaseUrl()` call — the
 * base URL is always an argument, so the caller (server action, PDF renderer,
 * email builder) decides which origin it needs.
 *
 * --- Why these three buckets may be PERSISTED as a bare path ---
 *
 * `PERSISTABLE_PROXY_BUCKETS` is the executable form of Phase 187's second
 * deferred exclusion ("no share-token path"). A persisted relative URL carries
 * no credential, so it is only safe for objects whose eventual VIEWER is
 * guaranteed to be able to resolve it:
 *
 *   - `logos` — publicly readable through the proxy (`isPubliclyReadableBucket`
 *     is true), so an ANONYMOUS share-page viewer and any email client resolves
 *     it with no session and no token. That is precisely why no share token is
 *     needed here.
 *   - `platform-brand` — same: publicly readable, and the landing page, emails
 *     and OG tags are all anonymous surfaces.
 *   - `photos` — NOT publicly readable, and deliberately narrow: the ONLY
 *     persisted `photos` URL is `company_price_book.image_url`, rendered
 *     exclusively on authenticated app surfaces
 *     (`components/price-book/price-book-list.tsx`,
 *     `components/price-book/price-book-item-dialog.tsx`,
 *     `components/trash/trash-list.tsx`). It is NEVER rendered on a share page
 *     or in a PDF. Tenant job-site photos on share pages and in PDFs keep
 *     resolving through short-lived signed URLs generated server-side
 *     (`lib/queries/share.ts`, `lib/pdf/render-estimate-pdf.ts`) — those are not
 *     persisted and are not touched by this phase.
 *   - `audio` / `pdfs` — EXCLUDED, at the type level and again at runtime.
 *     Nothing persists a URL for them; they are always delivered as a signed URL
 *     at send time (`lib/whatsapp/pdf-delivery.ts`). Adding them here would
 *     create a persisted private-bucket URL with no defined viewer, which is
 *     exactly the hole `canReadPrivateKey` exists to prevent.
 *
 * --- Persistable != streamable ---
 *
 * **Not every object in a persistable bucket may actually be repointed.** The
 * Phase 187 proxy is whole-object pass-through with **no Range/206 and no
 * `Accept-Ranges`**. Safari (desktop and iOS) refuses to play a `<video>` served
 * from an origin that does not honour byte-range requests. `platform-brand`
 * therefore holds one asset class — the landing hero background video
 * (`hero-bg-videos/…`, up to 20 MB, no transcoding) — that must keep its
 * absolute Supabase URL until the proxy gains Range support. See Plan 02's
 * documented exemption. Membership in `PERSISTABLE_PROXY_BUCKETS` is about
 * ACCESS, not about playability.
 */
import { isProxyBucket, normalizeProxyKey, type ProxyBucket } from './proxy-policy'

/** Buckets whose object URL may be PERSISTED as a bare same-origin path. */
export const PERSISTABLE_PROXY_BUCKETS = ['logos', 'platform-brand', 'photos'] as const
export type PersistableProxyBucket = (typeof PERSISTABLE_PROXY_BUCKETS)[number]

const PERSISTABLE_SET = new Set<string>(PERSISTABLE_PROXY_BUCKETS)

/** The single literal prefix. Kept here so no caller ever spells it out again. */
const PROXY_PREFIX = '/storage/'

/**
 * Builds the same-origin path `app/storage/[bucket]/[...key]/route.ts` serves.
 *
 * Validates BEFORE encoding, and throws loudly on anything the route could not
 * serve: a persisted URL the proxy rejects is a permanently dead image, and a
 * silent "" or a repaired key would only move the failure somewhere harder to
 * find. The message never contains the raw key (keys embed tenant UUIDs and
 * file names).
 */
export function storageProxyPath(bucket: PersistableProxyBucket, key: string): string {
  if (!PERSISTABLE_SET.has(bucket)) {
    throw new Error(
      `storageProxyPath: bucket "${bucket}" may not be persisted as a same-origin path ` +
        `(allowed: ${PERSISTABLE_PROXY_BUCKETS.join(', ')})`,
    )
  }

  const segments = key.split('/')
  if (normalizeProxyKey(segments) !== key) {
    throw new Error(
      `storageProxyPath: key rejected for bucket "${bucket}" — the asset proxy ` +
        `would refuse it (empty/relative segment, backslash, NUL, malformed ` +
        `percent-escape, or over 1024 chars)`,
    )
  }

  return `${PROXY_PREFIX}${bucket}/${segments.map(encodeURIComponent).join('/')}`
}

/** True only for a path this app's own asset proxy would serve. */
export function isStorageProxyPath(value: string): boolean {
  return parseStorageProxyPath(value) !== null
}

/**
 * Inverse of `storageProxyPath`. Returns the segments STILL ENCODED — the
 * caller decodes, which is what lets the round-trip test mirror exactly what
 * Next.js does to a catch-all param before the route handler sees it.
 *
 * Rejects anything the route would reject (traversal, empty segment, malformed
 * escape) by running the REAL `normalizeProxyKey` over the decoded form, so a
 * value that parses here is a value the proxy genuinely serves.
 */
export function parseStorageProxyPath(
  value: string,
): { bucket: ProxyBucket; segments: string[] } | null {
  // A protocol-relative URL (`//host/...`) is CROSS-origin, not same-origin.
  // Belt-and-braces: no string can start with both `//` and `/storage/`, so the
  // prefix test below already rejects these — this states the intent explicitly
  // so a later refactor of the prefix test cannot silently open the hole.
  if (value.startsWith('//')) return null
  if (!value.startsWith(PROXY_PREFIX)) return null

  const parts = value.slice(PROXY_PREFIX.length).split('/')
  const bucket = parts[0]
  const segments = parts.slice(1)

  if (!bucket || !isProxyBucket(bucket)) return null
  if (segments.length === 0) return null

  const decoded: string[] = []
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment))
    } catch {
      return null
    }
  }
  if (normalizeProxyKey(decoded) === null) return null

  return { bucket, segments }
}

/**
 * Absolutizes a same-origin asset path against `baseUrl`, and passes everything
 * else through UNTOUCHED — an already-absolute `https://*.supabase.co/...` row
 * comes back byte-identical, which is what makes this phase a no-op for data
 * that already exists.
 *
 * The generic is load-bearing: it preserves `null`/`undefined` for the four
 * call sites in Plans 03/04 that hold a nullable column. TypeScript cannot
 * prove a string built inside this body satisfies the caller-chosen `T`, so the
 * joined branch needs the explicit `as T`; do NOT "fix" that by widening the
 * signature to `string | null`, which would put a cast at every call site
 * instead of this one.
 */
export function absoluteAssetUrl<T extends string | null | undefined>(
  url: T,
  baseUrl: string,
): T {
  if (url === null || url === undefined || url === '') return url

  const value = url as string
  // Absolute, protocol-relative, or anything not rooted at "/" is left alone.
  if (!value.startsWith('/') || value.startsWith('//')) return url

  const base = baseUrl.replace(/\/+$/, '')
  return `${base}${value}` as T
}

/**
 * True for a URL whose protocol is http:, https: or data:. `new URL()` alone is
 * NOT sufficient — `javascript:alert(1)` parses successfully.
 *
 * Shared with `lib/schemas/asset-url.ts` (and Plan 03) so there is exactly one
 * definition of "an absolute URL we will accept".
 */
export function isAcceptableAbsoluteAssetUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'data:'
}
