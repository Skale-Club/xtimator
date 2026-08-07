import 'server-only'

/**
 * Phase 190 Plan 03 — URL-03: the resolver for renderers that have NO browser
 * origin.
 *
 * `@react-pdf/renderer` (lib/pdf/render-estimate-pdf.ts) and the `ImageResponse`
 * favicon routes (app/icon.tsx, app/apple-icon.tsx) run in Node. Neither can
 * retrieve a same-origin path like `/storage/logos/{uuid}/logo.webp` — a
 * relative specifier has no base URL there, and the platform HTTP client throws
 * "Failed to parse URL". This module reads the object IN PROCESS through the
 * same R2-first / Supabase-fallback reader the Phase 187 proxy route uses, and
 * hands the bytes over as a `data:` URI.
 *
 * Why bytes and not an absolutized HTTP request against the canonical base URL
 * helper (lib/utils/site-url.ts): absolutizing would make the container request
 * its own public domain — out through Cloudflare and back in through Traefik.
 * This repo has already been bitten by a self-request loop in exactly that path
 * (the Flexible-SSL HTTP->HTTPS redirect loop) and by that helper resolving to
 * production from a dev box. Reading the object in-process removes the origin
 * from the problem entirely and cannot leak a credential, because no URL is ever
 * emitted. Emails are the one place an absolute URL is genuinely required — that
 * is Plan 04, deliberately a different mechanism.
 *
 * NOTHING in this file may call an HTTP client, a signed-URL helper, the
 * canonical base URL helper, or any logger. That is enforced as a grep gate in
 * 190-03-PLAN.md's verification block, so the prose above deliberately spells
 * none of those symbols literally.
 *
 * NOTE ON WEBP (see PDF-LOGO-01): `image/webp` is in the allowlist below because
 * it is what the `logos` writers actually produce (all four run
 * `convertImageToWebp`) and because the bytes are legitimately an image — the
 * `ImageResponse` renderer behind app/icon.tsx DOES decode WebP, so excluding it
 * would break the favicon route. But `@react-pdf/image` accepts only jpg/jpeg/png,
 * on BOTH the remote-URL and the data-URI path, so a WebP company logo still does
 * not appear in an estimate PDF. That is a pre-existing product bug this module
 * neither causes nor fixes; it is recorded as follow-up PDF-LOGO-01.
 */
import { isAcceptableAbsoluteAssetUrl, parseStorageProxyPath } from './asset-url'
import { fetchStoredAsset } from './asset-source'

/**
 * Content types this resolver will emit as a `data:` URI.
 *
 * B3 — this allowlist is a LOGGING-SAFETY control, not a nicety.
 * `@react-pdf/image`'s `resolveBase64Image` throws ``Invalid base64 image: ${uri}``
 * with the WHOLE uri interpolated, and `@react-pdf/layout` catches that into a
 * warn-level log line. Emitting a data URI for a type react-pdf cannot decode would
 * therefore print a multi-megabyte base64 blob into container logs and Sentry
 * breadcrumbs on every render. `asset-source.ts` defaults `contentType` to
 * `'application/octet-stream'` on BOTH its branches (routine for the
 * extensionless keys this codebase really has), so that case is the norm, not a
 * hypothetical. Unknown type -> null -> no logo -> no log.
 *
 * `image/svg+xml` is deliberately absent: SVG can carry inline script, and the
 * public buckets already dropped it from `allowed_mime_types` (migration
 * 20260528000002).
 */
const INLINEABLE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * Max bytes we will inline. A single logo/favicon is tens of kB; the cap exists
 * so a mistakenly-huge object degrades to "no logo" instead of ballooning every
 * PDF (a data URI is ~1.33x the raw byte count, and it is embedded in the
 * document, not streamed).
 */
const MAX_INLINE_BYTES = 2 * 1024 * 1024

/**
 * Resolves an asset URL into something an origin-less renderer can draw.
 *
 *   - falsy                          -> null
 *   - `/storage/{bucket}/{key}`      -> `data:{type};base64,...`, allowlisted image types only
 *   - acceptable absolute URL        -> returned BYTE-IDENTICAL (existing
 *                                       `*.supabase.co` rows keep today's exact
 *                                       react-pdf code path)
 *   - anything else                  -> null
 *
 * Never throws. Never logs — not even on the reject branches: a "could not
 * inline" warn is exactly the leak the allowlist above exists to prevent, the
 * moment someone interpolates the uri into it.
 */
export async function resolveAssetForRenderer(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null

  const parsed = parseStorageProxyPath(url)
  if (!parsed) {
    // Not one of our proxy paths. Only an http/https/data URL may pass through;
    // `isAcceptableAbsoluteAssetUrl` is Plan 01's shared predicate — do NOT
    // hand-roll a second definition of "an absolute URL we accept" here. This is
    // what keeps `javascript:` and protocol-relative `//host/...` out.
    return isAcceptableAbsoluteAssetUrl(url) ? url : null
  }

  // `parseStorageProxyPath` returns the segments STILL ENCODED (it mirrors what
  // Next.js hands a catch-all route). The storage layer wants the real key, and
  // the parser already proved every segment decodes.
  let key: string
  try {
    key = parsed.segments.map(decodeURIComponent).join('/')
  } catch {
    return null
  }

  let asset: Awaited<ReturnType<typeof fetchStoredAsset>>
  try {
    asset = await fetchStoredAsset(parsed.bucket, key)
  } catch {
    // fetchStoredAsset documents "never throws", but a broken render is not an
    // acceptable price for that promise being wrong.
    return null
  }
  if (!asset) return null

  const contentType = (asset.contentType ?? '').split(';')[0].trim().toLowerCase()
  if (!INLINEABLE_CONTENT_TYPES.has(contentType)) return null

  // Cheap rejection first: when the backend told us the size, never open the body.
  if (asset.contentLength !== undefined && asset.contentLength > MAX_INLINE_BYTES) return null

  const buffer = await readCapped(asset.body)
  if (!buffer) return null

  return `data:${contentType};base64,${buffer.toString('base64')}`
}

/**
 * Reads either body shape `StoredAsset` can carry — R2 gives a `ReadableStream`,
 * Supabase gives a `Blob` — enforcing {@link MAX_INLINE_BYTES}. Returns null on
 * over-cap or on any read error.
 *
 * The stream branch is checked FIRST and by duck-typing rather than
 * `instanceof`: `getReader` is unambiguous, and an `instanceof` test against a
 * global constructor is unreliable across realms (jsdom vs node, undici's Blob
 * vs the global one).
 */
async function readCapped(body: ReadableStream<Uint8Array> | Blob): Promise<Buffer | null> {
  const maybeStream = body as ReadableStream<Uint8Array>
  if (typeof maybeStream?.getReader === 'function') {
    return readStreamCapped(maybeStream)
  }

  const blob = body as Blob
  if (typeof blob?.arrayBuffer !== 'function') return null
  // A Blob knows its size up front, so the cap costs nothing here.
  if (typeof blob.size === 'number' && blob.size > MAX_INLINE_BYTES) return null
  try {
    const buf = Buffer.from(await blob.arrayBuffer())
    return buf.byteLength > MAX_INLINE_BYTES ? null : buf
  } catch {
    return null
  }
}

/**
 * The chunked reader — this is what enforces the cap when `contentLength` is
 * absent, by aborting the read instead of buffering an unbounded body.
 */
async function readStreamCapped(stream: ReadableStream<Uint8Array>): Promise<Buffer | null> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_INLINE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    try {
      await reader.cancel()
    } catch {
      // the stream is already dead; nothing to release
    }
    return null
  }
  return Buffer.concat(chunks)
}
