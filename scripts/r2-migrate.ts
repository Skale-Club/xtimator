/**
 * Phase 191 Plan 01 — MIG-02: source enumeration + per-object comparison
 * engine for the Supabase -> R2 migration.
 *
 * READ-ONLY. Nothing in this file writes to, or deletes from, either
 * backend — there is no upload call and no delete call anywhere below.
 * Plan 02 adds `main()` and the R2-side HeadObject/copy work; this plan
 * only builds the half that decides what is true and what matched.
 *
 * THE ONE TRAP THIS FILE MUST NOT STEP INTO:
 * a migration run supplies `S3_*` inline so the process can talk to R2 for
 * the DESTINATION side (added in Plan 02). With those vars present,
 * `serverStorageBackend()` in `@/lib/storage/server` returns 'r2', so EVERY
 * default-provider factory exported by that module returns the R2 provider
 * (see the selection matrix in that module's own docblock). If the
 * SOURCE side used any of those factories, this script would enumerate R2,
 * compare R2 against R2, and report a flawless migration having moved
 * nothing. The source side is pinned below to
 * `createStorage(requireServiceClient())` — the explicit Supabase factory
 * from `@/lib/storage` — for exactly the reason `lib/storage/asset-source.ts`
 * pins its own read-through fallback the same way. See buildSourceStorage().
 *
 * Usage — env vars inline, never written to `.env.local` (the same house
 * convention `scripts/storage-smoke.ts`'s docblock states verbatim). This
 * file DOES read `.env.local` for the Supabase side
 * (NEXT_PUBLIC_SUPABASE_URL + the service key) via dotenv, the way
 * `scripts/apply-migration-m6p.mjs` does — `import 'dotenv/config'` only
 * reads `.env`, not `.env.local`. dotenv never overrides an already-set
 * var, so the operator's inline `S3_*` still win over anything in
 * `.env.local`.
 *
 *   S3_ENDPOINT=<endpoint> S3_REGION=auto \
 *     S3_ACCESS_KEY_ID=<key-id> S3_SECRET_ACCESS_KEY=<secret> \
 *     npx tsx scripts/r2-migrate.ts
 *
 * `main()` does not exist yet — Plan 02 adds it and the direct-execution
 * guard that calls it. Importing this module today performs no network
 * call of any kind; the only side effect is the dotenv.config() read below,
 * which silently no-ops when `.env.local` is absent (CI) and never
 * overrides an already-set var.
 */
import dotenv from 'dotenv'
import type { StorageProvider } from '@/lib/storage'
import { createStorage } from '@/lib/storage'
import { requireServiceClient } from '@/lib/supabase/service'

dotenv.config({ path: '.env.local' })

/** The five buckets provisioned in Phase 187 (MIG-03) — verbatim, no others. */
export const MIGRATION_BUCKETS = ['audio', 'photos', 'pdfs', 'logos', 'platform-brand'] as const

/**
 * Supabase's `list()` page size used while walking a bucket. Production
 * scale is 51 objects total across all five buckets, so a single page
 * covers everything in practice — paging support exists for correctness,
 * not because it is expected to trigger.
 */
const PAGE_SIZE = 100

/**
 * Hard ceiling on pages fetched per (bucket, prefix) walk. At PAGE_SIZE=100
 * this allows up to 5000 objects before throwing — unreachable at the
 * documented 51-object production scale, which is exactly why reaching it
 * means something is wrong (a provider bug returning infinite full pages)
 * rather than "the bucket grew".
 */
const MAX_PAGES = 50

export interface SourceKey {
  bucket: string
  key: string
}

/**
 * The SOURCE side of the migration must always be Supabase, in every env
 * configuration — see the trap docblock at the top of this file. This is
 * the one and only call site in the migration script that should construct
 * the source storage provider. Plan 02's `main()` calls this, never one of
 * the default-provider factories from `@/lib/storage/server`.
 */
export function buildSourceStorage(): StorageProvider {
  // createStorage(...) — the EXPLICIT Supabase factory — is required here,
  // not the default-provider helpers exported by `@/lib/storage/server`,
  // because those honor S3_* and would silently hand back the R2 provider
  // during a migration run.
  return createStorage(requireServiceClient())
}

/**
 * Depth-first walk of one Supabase bucket. Returns full keys (path segments
 * joined with '/'), folder placeholder entries excluded. Not hard-coded to
 * any nesting depth — recurses as deep as the listing goes.
 */
export async function walkSupabaseBucket(
  storage: StorageProvider,
  bucket: string,
  prefix?: string,
): Promise<string[]> {
  const keys: string[] = []
  let offset = 0
  let pagesFetched = 0

  for (;;) {
    if (pagesFetched >= MAX_PAGES) {
      throw new Error(
        `[r2-migrate] walkSupabaseBucket: bucket "${bucket}" prefix "${prefix ?? ''}" ` +
          `exceeded MAX_PAGES=${MAX_PAGES} at PAGE_SIZE=${PAGE_SIZE} — refusing to keep ` +
          `paging. Production scale is 51 objects total, so this is almost certainly a ` +
          `bug (an infinite/misbehaving listing), not real growth.`,
      )
    }

    const entries = await storage.list(bucket, prefix, { limit: PAGE_SIZE, offset })
    pagesFetched += 1

    for (const entry of entries) {
      const fullKey = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isFolder) {
        // Supabase's list() returns a folder PLACEHOLDER entry (no `id`, no
        // `metadata`) for every intermediate path segment — see
        // ListedObject.isFolder in lib/storage/index.ts. Recurse into it
        // instead of emitting it as an object; emitting it would produce a
        // phantom key that fails to download.
        const nested = await walkSupabaseBucket(storage, bucket, fullKey)
        keys.push(...nested)
      } else {
        keys.push(fullKey)
      }
    }

    if (entries.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return keys
}

/**
 * Enumerates every real object across all given buckets. Does not swallow a
 * rejection from any single bucket's walk — a `list()` failure propagates so
 * the caller never mistakes a partial enumeration for a complete one.
 */
export async function enumerateSource(
  storage: StorageProvider,
  buckets: readonly string[],
): Promise<{ objects: SourceKey[]; countsByBucket: Record<string, number> }> {
  const objects: SourceKey[] = []
  const countsByBucket: Record<string, number> = {}

  for (const bucket of buckets) {
    const keys = await walkSupabaseBucket(storage, bucket)
    countsByBucket[bucket] = keys.length
    for (const key of keys) {
      objects.push({ bucket, key })
    }
  }

  return { objects, countsByBucket }
}

export interface SourceObject {
  bucket: string
  key: string
  bytes: Uint8Array
  size: number
  /** Raw, as stored on the object — preserved verbatim on upload. Never normalized here. */
  contentType: string
}

export interface DestinationObject {
  size: number
  contentType: string
}

export type ComparisonStatus =
  | 'match'
  | 'missing'
  | 'size-mismatch'
  | 'content-type-mismatch'
  | 'unknown-source-content-type'

export interface Comparison {
  bucket: string
  key: string
  status: ComparisonStatus
  source: { size: number; contentType: string }
  destination: DestinationObject | null
  detail: string
}

export type RowLabel = 'MATCH' | 'COPIED' | 'FAIL' | 'WARN' | 'EXTRA'

export interface ReportRow {
  label: RowLabel
  bucket: string
  key: string
  detail: string
}

/**
 * Downloads one object and reads its TRUE size and content type off the
 * downloaded body — never off the listing's `metadata.size` (which can be
 * stale) and never inferred from the key's extension (production keys such
 * as `platform/1784854705622-kvwo24` have none). Supabase serves the stored
 * mimetype as the response `Content-Type`, and `Blob.type` carries it —
 * that is the only route to this metadata through the existing
 * `StorageProvider` interface, since `ListedObject` has no content-type
 * field and widening it is out of scope for this plan.
 *
 * Callers must let `bytes` go out of scope after each row is produced
 * rather than accumulating an array of bodies — 14.3 MB total is fine held
 * one object at a time, not as 51 buffers held simultaneously.
 */
export async function readSourceObject(
  storage: StorageProvider,
  bucket: string,
  key: string,
): Promise<SourceObject> {
  const blob = await storage.download(bucket, key)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    bucket,
    key,
    bytes,
    size: bytes.length,
    contentType: blob.type,
  }
}

/**
 * Normalization is for COMPARISON ONLY. The value written to R2 (Plan 02)
 * is always the raw `source.contentType`, unmodified — silently rewriting a
 * stored content type during a migration is exactly the class of "helpful"
 * change that would make a verification meaningless.
 */
export function normalizeContentType(raw: string | undefined): string {
  return raw?.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * Classifies one source object against one destination descriptor into
 * exactly one status. Size is checked before content type so the more
 * severe finding wins the single-status slot when both differ.
 */
export function compareObject(
  source: SourceObject,
  destination: DestinationObject | null,
): Comparison {
  const base = {
    bucket: source.bucket,
    key: source.key,
    source: { size: source.size, contentType: source.contentType },
  }

  if (destination === null) {
    return {
      ...base,
      status: 'missing',
      destination: null,
      detail: `source size=${source.size} contentType=${JSON.stringify(source.contentType)}; destination absent`,
    }
  }

  if (source.size !== destination.size) {
    return {
      ...base,
      status: 'size-mismatch',
      destination,
      detail: `source size=${source.size}; destination size=${destination.size}`,
    }
  }

  const normalizedSource = normalizeContentType(source.contentType)
  const normalizedDestination = normalizeContentType(destination.contentType)

  if (normalizedSource === '') {
    // Source never recorded a content type at all. This is a WARN, not a
    // failure — there is nothing on the source side to verify the
    // destination against — UNLESS the destination also drifted away from
    // the generic fallback, which is still worth flagging as a real
    // mismatch.
    if (normalizedDestination === 'application/octet-stream') {
      return {
        ...base,
        status: 'unknown-source-content-type',
        destination,
        detail: `source has no recorded content type; destination contentType=${JSON.stringify(destination.contentType)} (generic fallback)`,
      }
    }
    return {
      ...base,
      status: 'content-type-mismatch',
      destination,
      detail: `source has no recorded content type; destination contentType=${JSON.stringify(destination.contentType)}`,
    }
  }

  if (normalizedSource !== normalizedDestination) {
    return {
      ...base,
      status: 'content-type-mismatch',
      destination,
      detail: `source contentType=${JSON.stringify(source.contentType)}; destination contentType=${JSON.stringify(destination.contentType)}`,
    }
  }

  return {
    ...base,
    status: 'match',
    destination,
    detail: `size=${source.size} contentType=${JSON.stringify(source.contentType)}`,
  }
}

/**
 * Renders the final report. `allPassed` is computed from the rows
 * themselves (`rows.every(r => r.label !== 'FAIL')`) — never accepted as a
 * caller-supplied argument, so no caller can assert success independently
 * of what the rows actually say.
 *
 * `[EXTRA]` rows (a destination object with no source counterpart) are
 * reported and counted but never fatal: once Phase 188/189 route writes to
 * R2 directly, R2-only objects are an EXPECTED state, not a defect — failing
 * on them would make this command permanently red. Their presence is
 * precisely the W1 rollback signal documented in docs/STORAGE-MIGRATION.md,
 * so they must stay visible rather than being suppressed.
 */
export function formatMigrationReport(
  rows: ReportRow[],
  countsByBucket: Record<string, { source: number; destination: number }>,
): { text: string; allPassed: boolean } {
  const objectLines = rows.map(
    (r) => `[${r.label}] ${r.bucket}/${r.key} — ${r.detail}`,
  )

  const bucketLines = Object.entries(countsByBucket).map(
    ([bucket, counts]) => `${bucket}: source=${counts.source} destination=${counts.destination}`,
  )

  const countOf = (label: RowLabel) => rows.filter((r) => r.label === label).length
  const summaryCounts =
    `objects=${rows.length} match=${countOf('MATCH')} copied=${countOf('COPIED')} ` +
    `warn=${countOf('WARN')} extra=${countOf('EXTRA')} FAIL=${countOf('FAIL')}`

  const allPassed = rows.every((r) => r.label !== 'FAIL')
  const verdict = allPassed ? 'ALL OBJECTS VERIFIED' : 'ONE OR MORE OBJECTS FAILED VERIFICATION'

  const text = [...objectLines, '', ...bucketLines, '', summaryCounts, verdict].join('\n')

  return { text, allPassed }
}
