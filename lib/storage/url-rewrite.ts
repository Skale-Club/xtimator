/**
 * Phase 192 Plan 01 — URL-02: the translation layer for the asset-URL cutover.
 *
 * Turns a persisted ABSOLUTE Supabase public storage URL — host `{ref}.supabase`
 * `.co`, path `/storage/v1/object/public/{bucket}/{key}` — into the same-origin
 * path this app's own asset proxy serves, and refuses, loudly in its return
 * value rather than by throwing, everything that must not be turned.
 *
 * (The host and path are spelled separately above on purpose:
 * `tests/unit/storage/persisted-url-form.test.ts` fails any line in app/, lib/
 * or components/ that glues them into a whole backend URL, comments included.)
 *
 * PURE, for the same reason `proxy-policy.ts` and `asset-url.ts` are: no
 * `import 'server-only'`, no env read, no I/O. It must stay importable from unit
 * tests, from `scripts/` under plain `tsx` (Plan 02's apply/revert scripts), and
 * from server code.
 *
 * --- This module NEVER constructs a path ---
 *
 * `lib/storage/asset-url.ts` already owns path construction and its header says
 * it is "the ONE place a same-origin asset URL is built". This module PARSES and
 * DECIDES; the emitting is delegated to `storageProxyPath`. A second emitter is
 * exactly the drift that header exists to prevent, and a drifted URL persisted
 * into a row is a permanently dead image. The only path-shaped literal below is
 * the REMOTE provider's `/storage/v1/object/public/` prefix, which is an input
 * to the parser — it has nothing to do with this app's own proxy prefix.
 *
 * --- The inverse operation is NOT a code path ---
 *
 * There is no `unrewriteAssetUrl`. Reversal is a DATA operation: the
 * `public.storage_url_rewrites` table
 * (`supabase/migrations/20260806000003_phase192_storage_url_rewrites.sql`)
 * stores the FULL previous value of every row touched, so a rollback writes
 * `old_value` back rather than re-deriving the original URL from the path. That
 * matters because the original URL cannot be re-derived: the project ref, and
 * the exact percent-encoding of the persisted string, are not recoverable from
 * `/storage/{bucket}/{key}` alone.
 *
 * --- Contract reconciliation with storageProxyPath (deliberate) ---
 *
 * `storageProxyPath` THROWS by design on a key the proxy would refuse: at a
 * WRITER, a persisted URL the proxy rejects is a permanently dead image, and it
 * is right to be loud. This module is a BULK REWRITER over existing production
 * rows, where one bad legacy row must not abort the whole run. So
 * `rewriteAssetUrl` wraps the call in try/catch and converts a throw into
 * `{ changed: false, unserveable: true }`, leaving the value untouched.
 *
 * The throw is NOT swallowed — the count is surfaced by the caller (Plan 02
 * prints `SKIPPED_UNSERVEABLE=<n>` and treats any non-zero as a finding to
 * investigate BEFORE applying). Both invariants hold: `storageProxyPath` stays
 * loud, and the rewriter never throws.
 */
import {
  PERSISTABLE_PROXY_BUCKETS,
  isStorageProxyPath,
  storageProxyPath,
  type PersistableProxyBucket,
} from '@/lib/storage/asset-url'

/**
 * The gate is `PERSISTABLE_PROXY_BUCKETS` (3: logos, platform-brand, photos) —
 * NEVER `isProxyBucket` (5). `asset-url.ts` states why: `audio` and `pdfs` are
 * excluded on purpose, because persisting a bare path for them "would create a
 * persisted private-bucket URL with no defined viewer, which is exactly the hole
 * `canReadPrivateKey` exists to prevent". Widening this back to five buckets
 * would open that hole from the data side instead of the code side.
 */
const PERSISTABLE_SET = new Set<string>(PERSISTABLE_PROXY_BUCKETS)

function isPersistableBucket(bucket: string): bucket is PersistableProxyBucket {
  return PERSISTABLE_SET.has(bucket)
}

/**
 * Emission table. Every entry calls `storageProxyPath` with a LITERAL bucket, so
 * "a URL is only ever persisted for a bucket with a defined viewer" stays a
 * STATIC property of this module and not merely a runtime one — and
 * `Record<PersistableProxyBucket, …>` turns a fourth persistable bucket into a
 * compile error here instead of a silent pass-through.
 *
 * This is also what `tests/unit/storage/persisted-url-form.test.ts` enforces
 * repo-wide ("storageProxyPath() must be called with a LITERAL bucket"). An
 * earlier draft of this module passed `parsed.bucket as PersistableProxyBucket`
 * and that gate caught it: the cast asserted the very thing the runtime check
 * was supposed to establish. The table removes the cast altogether.
 */
const EMIT_BY_BUCKET: Record<PersistableProxyBucket, (key: string) => string> = {
  logos: (key) => storageProxyPath('logos', key),
  'platform-brand': (key) => storageProxyPath('platform-brand', key),
  photos: (key) => storageProxyPath('photos', key),
}

/**
 * The REMOTE (Supabase) public-object path prefix — an input to the parser, not
 * an emitted path. Anything under `/object/sign/` or `/object/authenticated/`
 * deliberately fails this test: a URL carrying a token is never rewritten.
 */
const SUPABASE_PUBLIC_PATH_PREFIX = '/storage/v1/object/public/'

/** `{ref}.supabase.co` / `.supabase.in`. Anchored, so a lookalike host fails. */
const SUPABASE_HOST_PATTERN = /^[a-z0-9-]+\.supabase\.(co|in)$/

/**
 * Phase 192 (URL-02) — DELIBERATE EXEMPTION, do not "finish" this.
 *
 * Mirrors `app/admin/landing/actions.ts`'s writer exemption. The hero
 * background video stays on its absolute Supabase URL: the Phase 187 proxy is
 * whole-object pass-through with no Range/206 and no Accept-Ranges, and Safari
 * (desktop + iOS) refuses to play a `<video>` from an origin that does not
 * honour byte-range requests. The asset is up to 20 MB with no transcoding and
 * renders as a bare `<video>` in `components/landing/hero-section.tsx`.
 *
 * PREREQUISITE before rewriting: the asset proxy must support Range/206.
 * Tripwire: `tests/unit/storage/url-rewrite.test.ts` asserts a video leaf stays
 * absolute.
 */
const EXEMPT_KEY_PREFIXES = ['hero-bg-videos'] as const

/** Deepest node `rewriteJsonAssetUrls` will descend into. */
const MAX_JSON_DEPTH = 32

export interface ParsedStorageUrl {
  bucket: string
  /** DECODED — the raw storage key, i.e. what `storageProxyPath` expects. */
  key: string
}

/**
 * Parses the plain persisted public form and nothing else. Returns null for the
 * signed/authenticated forms, a non-Supabase host, a non-https protocol, and
 * anything carrying a query string or fragment — those are not the persisted
 * shape this phase rewrites, and a token-bearing URL must never be touched.
 *
 * Uses the `URL` constructor (not a hand-rolled regex) so host and path parsing
 * match what a browser would do. Path segments are DECODED, because a persisted
 * URL is percent-encoded while `storageProxyPath` takes the raw key and does its
 * own encoding.
 */
export function parseSupabasePublicUrl(value: string): ParsedStorageUrl | null {
  if (typeof value !== 'string' || value === '') return null

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (!SUPABASE_HOST_PATTERN.test(url.hostname)) return null
  if (url.search !== '' || url.hash !== '') return null
  if (!url.pathname.startsWith(SUPABASE_PUBLIC_PATH_PREFIX)) return null

  const parts = url.pathname.slice(SUPABASE_PUBLIC_PATH_PREFIX.length).split('/')
  const bucket = parts[0]
  const encodedSegments = parts.slice(1)
  if (!bucket || encodedSegments.length === 0) return null

  const segments: string[] = []
  for (const segment of encodedSegments) {
    try {
      segments.push(decodeURIComponent(segment))
    } catch {
      // A malformed percent-escape means this is not a well-formed persisted
      // URL; leave it entirely alone rather than guessing at the key.
      return null
    }
  }

  // NOTE: an EMPTY inner segment (`.../logos//x.webp`) deliberately survives
  // parsing. It is not this function's job to judge serveability —
  // `storageProxyPath` refuses it, and the caller counts it as unserveable.
  const key = segments.join('/')
  if (key === '') return null

  return { bucket, key }
}

/**
 * True for an object that must keep its absolute Supabase URL. See
 * `EXEMPT_KEY_PREFIXES` above for the full reasoning — this is the mirror of the
 * writer's Phase 190 exemption, not an oversight.
 *
 * Matches on the KEY PREFIX (first segment), never on the file extension: the
 * writer chooses the directory, and an `.mp4` uploaded into `og-images/` is a
 * different asset class that this exemption does not cover.
 *
 * `bucket` is accepted for call-site clarity and so a future bucket-scoped
 * exemption has somewhere to go; today the rule is bucket-independent, which
 * errs in the safe direction (never rewrite something in this asset class).
 */
export function isExemptFromRewrite(bucket: string, key: string): boolean {
  const firstSegment = key.split('/')[0]
  return (EXEMPT_KEY_PREFIXES as readonly string[]).includes(firstSegment)
}

export interface RewriteResult {
  changed: boolean
  /** The rewritten value, or the ORIGINAL value untouched when unchanged. */
  value: unknown
  /** Set when the value is an exempt asset class (the hero background video). */
  exempt?: boolean
  /** Set when `storageProxyPath` refused the key. Counted, never thrown. */
  unserveable?: boolean
}

/**
 * Rewrites ONE value. Never throws.
 *
 * Returns unchanged for: anything that is not a non-empty string; a value
 * already in the same-origin form (idempotency — tested as a fixed point); a
 * string that does not parse as a Supabase public storage URL; a
 * non-persistable bucket; and the exempt video asset class.
 */
export function rewriteAssetUrl(value: unknown): RewriteResult {
  if (typeof value !== 'string' || value === '') return { changed: false, value }

  // IDEMPOTENCY: already the same-origin form. Asked of the real predicate in
  // asset-url.ts rather than a prefix test, so "already rewritten" means
  // exactly "a path this app's proxy would serve".
  if (isStorageProxyPath(value)) return { changed: false, value }

  const parsed = parseSupabasePublicUrl(value)
  if (!parsed) return { changed: false, value }

  // THE gate — PERSISTABLE_PROXY_BUCKETS (3), never the 5-bucket proxy
  // allowlist. Narrowing here is what makes the emission table below total, so
  // no cast is needed anywhere in this module.
  if (!isPersistableBucket(parsed.bucket)) return { changed: false, value }

  if (isExemptFromRewrite(parsed.bucket, parsed.key)) {
    return { changed: false, value, exempt: true }
  }

  try {
    return { changed: true, value: EMIT_BY_BUCKET[parsed.bucket](parsed.key) }
  } catch {
    // See the header: the writer is right to throw, the bulk rewriter is right
    // to keep going. The count is surfaced by the caller.
    return { changed: false, value, unserveable: true }
  }
}

interface WalkCounts {
  changed: number
  exempt: number
  unserveable: number
}

/**
 * Walks a JSON document (a JSONB column such as
 * `platform_branding.landing_content`, or an `auth.users.user_metadata` object)
 * and applies `rewriteAssetUrl` to every string leaf INDIVIDUALLY — a
 * value-level rewrite, never a document-level string substitution.
 *
 * Deliberately KEY-AGNOSTIC: enumerating `landing_content`'s field paths
 * (heroImageUrl, steps[].imageUrl, features[].image, …) would rot the moment the
 * landing editor adds a field, and a missed field is a landing image still
 * served from `*.supabase.co`. Only strings that parse as a Supabase public
 * storage URL for a persistable, non-exempt bucket are ever touched, so being
 * key-agnostic costs nothing in safety.
 *
 * Returns a structural COPY (the input is never mutated) with key and array
 * order preserved.
 */
export function rewriteJsonAssetUrls(doc: unknown): {
  changed: number
  exempt: number
  unserveable: number
  value: unknown
} {
  const counts: WalkCounts = { changed: 0, exempt: 0, unserveable: 0 }
  const value = walk(doc, 0, counts)
  return { ...counts, value }
}

function walk(node: unknown, depth: number, counts: WalkCounts): unknown {
  // Depth cap: return the subtree untouched rather than recursing forever on a
  // pathological (or cyclic-looking) document.
  if (depth > MAX_JSON_DEPTH) return node

  if (typeof node === 'string') {
    const result = rewriteAssetUrl(node)
    if (result.changed) counts.changed++
    if (result.exempt) counts.exempt++
    if (result.unserveable) counts.unserveable++
    return result.value
  }

  if (Array.isArray(node)) {
    return node.map((item) => walk(item, depth + 1, counts))
  }

  if (typeof node === 'object' && node !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      // `out['__proto__'] = x` would set the PROTOTYPE instead of an own
      // property; defineProperty keeps every key an ordinary own property, so a
      // hostile document cannot pollute anything. Insertion order preserved.
      Object.defineProperty(out, key, {
        value: walk(child, depth + 1, counts),
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
    return out
  }

  // numbers, booleans, null, undefined — untouched.
  return node
}
