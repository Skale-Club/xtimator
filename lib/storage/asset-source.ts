import 'server-only'

/**
 * Phase 187 Plan 01 — PROXY-01 / PROXY-02: server-only dual-source asset
 * reader. R2 first, Supabase read-through fallback second.
 *
 * PROXY-02 (the Supabase read-through) is what makes the whole v4.24
 * milestone reversible: with it in place R2 can be completely empty and
 * nothing 404s, so objects may be copied into R2 in any order (Phase 191),
 * and removing the R2 env vars at any point returns the app to Supabase
 * with no code change and no data migration.
 *
 * PROXY-01 (content type preserved) is non-trivial because real production
 * keys frequently have no file extension (e.g.
 * `platform/1784854705622-kvwo24`) — the content type MUST come from the
 * stored object's own metadata, never inferred from the key/path.
 *
 * `import 'server-only'` is safe here: vitest aliases `server-only` to the
 * empty stub (see vitest.config.ts), so this module is still importable
 * from tests.
 *
 * Fallback observability (W3): the `[asset-proxy] fallback` console.warn
 * line emitted by recordFallback() below is the AUTHORITATIVE FUT-R2-01
 * signal that the Supabase fallback is (or isn't) being used in
 * production — NOT the `X-Asset-Source` response header Plan 03 adds to
 * the route. That header is edge-cached on public buckets (logos,
 * platform-brand), so a cached `x-asset-source: supabase` can keep being
 * served by Cloudflare long after R2 started successfully answering for
 * that key. Only this server-side log line reflects a real origin
 * decision made at fetch time.
 *
 * FUT-R2-01 (the kill switch): once every object lives in R2, the
 * read-through stops being a safety net and becomes an open-ended
 * Supabase egress bill for objects that should simply 404.
 * `STORAGE_SUPABASE_FALLBACK` turns it off — see
 * isSupabaseFallbackEnabled() below for the exact semantics. Two
 * properties of that switch are deliberate and load-bearing:
 *
 *  - **Default is ENABLED.** Absent, empty, or any unrecognized value
 *    keeps today's production behaviour byte-for-byte. Shipping this
 *    changes nothing until an operator sets it.
 *  - **It governs the FALLBACK, not the reader.** It is consulted only on
 *    the R2-configured path. When the `S3_*` vars are absent, Supabase is
 *    the PRIMARY source, not a fallback, and the switch is inert — which
 *    is what keeps "remove `S3_*` from Coolify" a working rollback lever
 *    (docs/STORAGE-MIGRATION.md, Phase 191 "Rollback") instead of a
 *    site-wide blackout for anyone who left the switch set.
 */
import type { ProxyBucket } from './proxy-policy'
import { s3ConfigFromEnv, isR2Configured } from './s3-config'

export { isR2Configured }

export type AssetSourceName = 'r2' | 'supabase'

export interface StoredAsset {
  /** Both ReadableStream and Blob are valid BodyInit for `new Response(...)`. */
  body: ReadableStream<Uint8Array> | Blob
  contentType: string
  contentLength?: number
  source: AssetSourceName
}

/** Values that DISABLE the read-through. Everything else enables it. */
const FALLBACK_DISABLE_VALUES = new Set(['false', '0', 'off'])

/**
 * FUT-R2-01 kill switch for the Supabase read-through.
 *
 * `STORAGE_SUPABASE_FALLBACK` is opt-OUT: only the explicit strings
 * `false`, `0` and `off` (trimmed, case-insensitive) disable the
 * fallback. Unset, empty, `true`, `1`, `on`, or a typo all leave it
 * ENABLED — i.e. exactly today's production behaviour. The asymmetry is
 * the point: a mistyped value must never silently start 404ing live
 * assets, whereas a mistyped *disable* just leaves the safety net in
 * place, which is the harmless direction.
 *
 * Exported so an operator-facing surface (health check, admin panel) can
 * report the effective mode without re-deriving the parsing rules.
 */
export function isSupabaseFallbackEnabled(): boolean {
  const raw = process.env.STORAGE_SUPABASE_FALLBACK
  if (raw === undefined) return true
  return !FALLBACK_DISABLE_VALUES.has(raw.trim().toLowerCase())
}

/**
 * Resolves an object's bytes + real content type from R2 first, Supabase
 * second. Returns `null` (never throws) when neither backend has the
 * object — callers render a 404.
 *
 * With the fallback disabled (see isSupabaseFallbackEnabled), an R2 miss
 * resolves to `null` too, so the route renders its ordinary 404: a
 * missing object becomes a loud, cheap error instead of a silent
 * Supabase egress charge. The caller cannot tell the two `null`s apart,
 * deliberately — the reason is a server-side log line, never a response.
 */
export async function fetchStoredAsset(
  bucket: ProxyBucket,
  key: string,
): Promise<StoredAsset | null> {
  const cfg = s3ConfigFromEnv()

  if (cfg) {
    // Read the switch ONCE per request and thread it through, so the
    // logged mode and the branch actually taken can never disagree.
    const fallbackEnabled = isSupabaseFallbackEnabled()
    const r2Result = await tryR2(bucket, key, cfg, fallbackEnabled)
    if (r2Result) return r2Result
    // tryR2 already emitted the single `[asset-proxy] fallback` line for
    // this miss, recording which mode the decision was made in — do not
    // log again here.
    if (!fallbackEnabled) return null
  }

  // R2 not configured: Supabase is the PRIMARY source here, not a
  // fallback, so the kill switch does not apply (see the file header).
  return fetchFromSupabase(bucket, key)
}

async function tryR2(
  bucket: ProxyBucket,
  key: string,
  cfg: NonNullable<ReturnType<typeof s3ConfigFromEnv>>,
  fallbackEnabled: boolean,
): Promise<StoredAsset | null> {
  try {
    // Lazy import — keeps the AWS SDK off the Supabase-only cold path,
    // same rationale as the existing lazy require in getServerStorage().
    // Import only; s3-provider.ts is proven against R2 and must never be
    // edited.
    const { createS3StorageProvider } = await import('./s3-provider')
    const provider = createS3StorageProvider(cfg)

    // A signed-URL round trip reuses the already-R2-verified provider with
    // zero new S3 code, AND takes the content type off the wire — the
    // only place it is reliable for extensionless keys. The signed URL is
    // used in-process only and is never returned or logged.
    const url = await provider.getSignedUrl(bucket, key, 60)

    // Deliberately pass no inbound headers/cookies — this call must carry
    // nothing from the end user.
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' })

    if (res.ok && res.body) {
      return {
        body: res.body,
        contentType: res.headers.get('content-type') || 'application/octet-stream',
        contentLength: lengthFrom(res),
        source: 'r2',
      }
    }

    // Non-ok — don't leak the socket.
    await res.body?.cancel()
    recordFallback(bucket, key, 'r2-miss', fallbackEnabled)
    return null
  } catch {
    recordFallback(bucket, key, 'r2-error', fallbackEnabled)
    return null
  }
}

/**
 * W2: `content-length` describes the bytes on the wire. When the response
 * carries `content-encoding` (e.g. gzip), undici has already transparently
 * decompressed the body by the time `res.body` is read, so the header
 * value describes the COMPRESSED size while the caller receives
 * decompressed bytes — forwarding it as `contentLength` would understate
 * (and effectively truncate against) the real payload size. Returns
 * `undefined` in that case, and also for a missing/NaN header.
 */
function lengthFrom(res: Response): number | undefined {
  if (res.headers.get('content-encoding')) return undefined
  const raw = res.headers.get('content-length')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

async function fetchFromSupabase(
  bucket: ProxyBucket,
  key: string,
): Promise<StoredAsset | null> {
  try {
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createStorage } = await import('./index')
    const blob = await createStorage(requireServiceClient()).download(bucket, key)
    return {
      body: blob,
      contentType: blob.type || 'application/octet-stream',
      contentLength: blob.size,
      source: 'supabase',
    }
  } catch {
    // Neither backend has it — caller renders 404. Never rethrow.
    return null
  }
}

/**
 * Called ONLY when R2 was configured and did not serve the object. Never
 * called when R2 is simply not configured (that is a supported steady
 * state, not an anomaly). Never logs the signed URL or any env value.
 *
 * Emitted exactly once per miss in BOTH modes — the `fallback` field is
 * what distinguishes them:
 *
 *   "fallback":"supabase"  the read-through served (or tried to serve) it
 *   "fallback":"disabled"  FUT-R2-01 is on; this request 404s instead
 *
 * `"fallback":"disabled"` lines are therefore the operator's list of
 * objects that are in Supabase but not in R2 — i.e. exactly what a
 * `npm run migrate:r2` re-run would fix. Alert on them; a healthy
 * post-cutover origin emits none.
 */
function recordFallback(
  bucket: string,
  key: string,
  reason: 'r2-miss' | 'r2-error',
  fallbackEnabled: boolean,
): void {
  console.warn(
    '[asset-proxy] fallback',
    JSON.stringify({
      bucket,
      key,
      reason,
      fallback: fallbackEnabled ? 'supabase' : 'disabled',
    }),
  )
}
