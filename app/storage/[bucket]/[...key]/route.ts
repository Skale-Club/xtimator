/**
 * Phase 187 Plan 03 — PROXY-01..04: the same-origin asset proxy route.
 *
 * `GET /storage/{bucket}/{key}` serves any object from one of the five
 * allowlisted buckets (`audio`, `photos`, `pdfs`, `logos`, `platform-brand`)
 * from R2 when it is there and from Supabase when it is not (Plan 01's
 * `fetchStoredAsset`), with the object's real stored content type (never
 * inferred from the key — production keys are frequently extensionless),
 * a per-bucket cache policy (Plan 01's `cacheControlFor`), and a refusal
 * for anything outside the allowlist, outside the caller's tenant, or that
 * looks like a traversal attempt.
 *
 * The route is CREATED here but NOT YET CONSUMED: no DB row is rewritten,
 * no `getPublicUrl()` output changes, and no component / PDF / share page
 * is repointed at this URL shape. That rewiring is Phase 190 (private
 * buckets) and Phase 192 (public buckets, the CDN cache-HIT proof). R2 is
 * optional here — the Supabase read-through in `asset-source.ts` is what
 * keeps every later phase of this migration reversible.
 *
 * Handler order below is deliberate — do not reorder. Each gate is cheaper
 * and stricter than the next, and every refusal happens BEFORE any storage
 * call:
 *   1. bucket allowlist            (cheapest — no auth, no I/O)
 *   2. key traversal / shape check (still no auth, no I/O)
 *   3. tenant ownership            (DB, only for private buckets)
 *   4. the actual storage read     (only after 1-3 pass)
 *
 * Known limitation (deliberate, recorded in docs/STORAGE-MIGRATION.md):
 * no Range/206 support, no ETag revalidation, whole-object pass-through
 * only. Production is 51 objects / 14.3 MB; audio playback still goes
 * through today's signed URLs.
 */
import { isProxyBucket, normalizeProxyKey, cacheControlFor, isPubliclyReadableBucket } from '@/lib/storage/proxy-policy'
import { fetchStoredAsset } from '@/lib/storage/asset-source'
import { canReadPrivateKey } from '@/lib/storage/proxy-auth'

// AWS SDK (via asset-source.ts) and the service-role client are Node-only.
export const runtime = 'nodejs'
// Every response is per-caller (auth-gated on private buckets) — never
// statically cached by Next itself. Cloudflare/browser caching is governed
// entirely by the Cache-Control header this route sets explicitly below.
export const dynamic = 'force-dynamic'

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain' },
  })
}

function badRequest(): Response {
  return new Response('Bad request', {
    status: 400,
    headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain' },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bucket: string; key: string[] }> }
) {
  const { bucket: rawBucket, key: segments } = await params

  // Gate 1: bucket allowlist. 404, not 400 — the route does not enumerate
  // which buckets exist to a caller probing it.
  if (!isProxyBucket(rawBucket)) return notFound()
  const bucket = rawBucket

  // Gate 2: traversal-safe key normalization (reject-never-repair).
  const key = normalizeProxyKey(segments)
  if (key === null) return badRequest()

  // Gate 3: tenant ownership, private buckets only. isPubliclyReadableBucket
  // is the ACCESS axis only — never derive the Cache-Control header from it
  // (logos and platform-brand are both publicly readable but get different
  // cache directives; see proxy-policy.ts's file header).
  if (!isPubliclyReadableBucket(bucket)) {
    const allowed = await canReadPrivateKey(key)
    // 404 rather than 403 — the response must not confirm the object exists.
    if (!allowed) return notFound()
  }

  // Gate 4: the actual read. R2 first, Supabase read-through fallback.
  const asset = await fetchStoredAsset(bucket, key)
  if (!asset) return notFound()

  const headers = new Headers({
    'Content-Type': asset.contentType,
    'Cache-Control': cacheControlFor(bucket),
    // No filename — this is what makes an image render inline and a PDF
    // open in-browser instead of triggering a download (Success Criterion 1).
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    // Convenience only for manual curling — edge-cached on public buckets,
    // so it can go stale. The authoritative FUT-R2-01 signal is the
    // server-side `[asset-proxy] fallback` log line in asset-source.ts.
    'X-Asset-Source': asset.source,
  })
  if (asset.contentLength !== undefined) {
    headers.set('Content-Length', String(asset.contentLength))
  }
  // Belt-and-braces next to `private, no-store` on tenant-private buckets.
  if (!isPubliclyReadableBucket(bucket)) {
    headers.set('Vary', 'Cookie')
  }

  return new Response(asset.body as BodyInit, { status: 200, headers })
}
