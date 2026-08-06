/**
 * Phase 187 Plan 01 — W5: single source of truth for the S3_* env mapping
 * used by NEW code (the asset-proxy reader in ./asset-source.ts and
 * scripts/r2-verify.ts, Plan 02).
 *
 * NO `import 'server-only'`: scripts/r2-verify.ts imports this module and
 * runs under plain `tsx`, where `server-only` throws. This module holds no
 * secret itself — it reads `process.env` at call time, and `S3_*` are not
 * `NEXT_PUBLIC_*`, so they are never inlined into a client bundle.
 *
 * Three things worth stating explicitly:
 *
 * (a) Verified R2 settings (see .planning/phases/187-.../CONTEXT.md and
 *     scripts/storage-smoke.ts, which already passed against R2) are
 *     `S3_REGION=auto` and path-style addressing
 *     (`endpoint = https://<account-id>.r2.cloudflarestorage.com`).
 *
 * (b) This module deliberately IGNORES the legacy provider-selection env
 *     var that `getServerStorage()` reads in ./index.ts (see that
 *     function's own docblock for its name/values). That flag half-applies
 *     today (only `getServerStorage()`'s 4 call sites honor it; ~20 other
 *     sites call `createStorage(client)` and get Supabase unconditionally —
 *     Phase 188 fixes this properly). Coupling the asset proxy to a
 *     half-applied flag would make the split-brain worse. R2-configured is
 *     decided purely by the presence of the S3_* env vars, which is safe
 *     BECAUSE the Supabase read-through fallback in ./asset-source.ts
 *     always exists.
 *
 * (c) `getServerStorage()` in ./index.ts still has its OWN inline copy of
 *     this exact mapping. That duplication is scheduled, not accidental:
 *     Phase 188 rewrites `getServerStorage()` entirely and will fold it
 *     onto this helper then. Do not "clean up" that duplication in this
 *     plan — index.ts is out of scope here.
 */
import type { S3ProviderConfig } from './s3-provider'

/**
 * Reads S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
 * (all required, non-empty) plus optional S3_FORCE_PATH_STYLE /
 * S3_PUBLIC_URL_BASE. Returns `null` — never throws — when any required
 * var is missing or empty: "not configured" is a supported state, not an
 * error condition.
 */
export function s3ConfigFromEnv(): S3ProviderConfig | null {
  const endpoint = nonEmpty(process.env.S3_ENDPOINT)
  const region = nonEmpty(process.env.S3_REGION)
  const accessKeyId = nonEmpty(process.env.S3_ACCESS_KEY_ID)
  const secretAccessKey = nonEmpty(process.env.S3_SECRET_ACCESS_KEY)

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    return null
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE,
  }
}

export function isR2Configured(): boolean {
  return s3ConfigFromEnv() !== null
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined
}
