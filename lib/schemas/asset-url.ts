import { z } from 'zod'
import { parseStorageProxyPath, isAcceptableAbsoluteAssetUrl } from '@/lib/storage/asset-url'

/**
 * Phase 190 Plan 01 — URL-01.
 *
 * Accepts an absolute http(s) (or data:) URL — existing rows, external images —
 * OR a same-origin `/storage/{bucket}/{key}` path served by the Phase 187 asset
 * proxy. Everything else — `javascript:`, a protocol-relative `//host/…`, a bare
 * `/path`, a bucket outside the proxy allowlist, a traversal — is rejected
 * exactly as `z.string().url()` rejected it before.
 *
 * `lib/schemas/*` is imported by client components, so this may only import
 * pure/browser-safe code: `lib/storage/asset-url` (and transitively
 * `proxy-policy`) are pure functions with no env read and no I/O. Never import
 * `proxy-auth`, `asset-source`, or `lib/storage/index` from a schema.
 */
export function assetUrlString(message = 'Must be a valid URL or a /storage/ path') {
  return z
    .string()
    .refine(
      (value) => parseStorageProxyPath(value) !== null || isAcceptableAbsoluteAssetUrl(value),
      { message },
    )
}
