/**
 * Phase 191 — MIG-01/MIG-02: one re-runnable command that copies every
 * Supabase Storage object into the matching Cloudflare R2 bucket, preserving
 * byte size and stored content type, and re-verifies each object after
 * copying it.
 *
 * NEVER DELETES. There is no delete call anywhere in this file, in any
 * mode — not `--verify-only`, not the write path, not even a hidden flag.
 * A deleted or corrupted destination object is REPORTED, never healed
 * silently and never removed.
 *
 * THE ONE TRAP THIS FILE MUST NOT STEP INTO:
 * a migration run supplies `S3_*` inline so the process can talk to R2 for
 * the DESTINATION side. With those vars present, `serverStorageBackend()` in
 * `@/lib/storage/server` returns 'r2', so EVERY default-provider factory
 * exported by that module returns the R2 provider (see the selection matrix
 * in that module's own docblock). If the SOURCE side used any of those
 * factories, this script would enumerate R2, compare R2 against R2, and
 * report a flawless migration having moved nothing. The source side is
 * pinned below to `createStorage(requireServiceClient())` — the explicit
 * Supabase factory from `@/lib/storage` — for exactly the reason
 * `lib/storage/asset-source.ts` pins its own read-through fallback the same
 * way. See buildSourceStorage().
 *
 * `--verify-only` is genuinely write-free: it never calls `copyObject`, so
 * it can check the destination without healing anything it finds wrong —
 * which is the only way a deliberately corrupted/deleted destination object
 * can be demonstrated as CAUGHT rather than silently repaired first.
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
 * All four required S3_* vars (endpoint, region, the access-key-id var, the
 * secret-access-key var — see lib/storage/s3-config.ts for the exact names)
 * go inline on the command line, e.g.:
 *
 *   S3_ENDPOINT=<endpoint> S3_REGION=auto \
 *     <the two credential vars from s3ConfigFromEnv()>=<placeholders> \
 *     npx tsx scripts/r2-migrate.ts
 *
 *   npm run migrate:r2
 *   npm run migrate:r2 -- --verify-only
 *
 * The `--` before `--verify-only` is LOAD-BEARING when invoked through npm:
 * `npm run migrate:r2 --verify-only` (no `--`) silently swallows the flag as
 * an npm option instead of forwarding it to the script, and would run a full
 * WRITE pass instead of the read-only check an operator asked for.
 *
 * Flags:
 *   --verify-only        perform zero writes; report-only
 *   --bucket <name>       restrict to one of the five migration buckets
 *                          (repeatable is NOT supported — one bucket per flag
 *                          occurrence wins; pass the flag once)
 * An unrecognized flag, or a `--bucket` value outside the five provisioned
 * buckets, THROWS rather than being ignored — see parseArgs().
 *
 * Report row vocabulary — `[MATCH]` / `[COPIED]` / `[WARN]` / `[EXTRA]` /
 * `[FAIL]` — is defined by `formatMigrationReport` (see that function's own
 * docblock). `[EXTRA]` (destination-only object) is reported but NEVER
 * fatal. See docs/STORAGE-MIGRATION.md for the operator runbook.
 *
 * Importing this module performs no network call of any kind and never
 * touches `process.exit` — the only side effect is the dotenv.config() read
 * below, which silently no-ops when `.env.local` is absent (CI) and never
 * overrides an already-set var. `main()` only runs when this file is
 * executed directly (see the guard at the bottom of the file).
 */
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { StorageProvider } from '@/lib/storage'
import { createStorage } from '@/lib/storage'
import { requireServiceClient } from '@/lib/supabase/service'
import { s3ConfigFromEnv } from '@/lib/storage/s3-config'
import { createS3StorageProvider } from '@/lib/storage/s3-provider'

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

// ---------------------------------------------------------------------------
// Destination layer (Plan 02 — MIG-01)
// ---------------------------------------------------------------------------

export interface MigrationDeps {
  /** Always Supabase — see buildSourceStorage(). */
  sourceStorage: StorageProvider
  /** Always R2 — built from the same s3ConfigFromEnv() result as s3Client. */
  destStorage: StorageProvider
  /**
   * A raw @aws-sdk/client-s3 client against the SAME R2 config as
   * `destStorage`. `StorageProvider` has no head/stat operation and
   * `ListedObject` has no content-type field (see lib/storage/index.ts), so
   * HeadObjectCommand/ListObjectsV2Command are the only route to the
   * destination's stored size + content type through the S3 API.
   * `lib/storage/s3-provider.ts` is proven against R2 unmodified (Phase 187
   * MIG-03) and stays out of bounds — it is used here, never extended.
   */
  s3Client: S3Client
}

export interface MigrationOptions {
  verifyOnly: boolean
  buckets: readonly string[]
}

/**
 * HeadObject against the destination. A NotFound-shaped rejection
 * (`name: 'NotFound'`, and the '404'/'NoSuchKey' names some S3-compatible
 * stacks use) means "object absent" and resolves to `null`. ANY OTHER
 * rejection (AccessDenied, network error, etc.) THROWS — swallowing an
 * authorization failure as "absent" would make the script re-upload
 * everything on every run and then report a clean migration it never
 * actually verified.
 */
export async function headDestinationObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<DestinationObject | null> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return {
      size: res.ContentLength ?? 0,
      contentType: res.ContentType ?? '',
    }
  } catch (err) {
    if (isNotFoundError(err)) return null
    throw err
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('name' in err)) return false
  const name = String((err as { name: unknown }).name)
  return name === 'NotFound' || name === '404' || name === 'NoSuchKey'
}

/**
 * Lists every key currently in a destination bucket, paging via
 * ListObjectsV2's continuation-token protocol. At 51 objects one page
 * covers everything in practice — the loop and MAX_PAGES ceiling exist so an
 * unhandled truncation never silently under-reports `[EXTRA]` objects, which
 * is the one signal that tells an operator R2-only data exists (the
 * docs/STORAGE-MIGRATION.md rollback signal).
 */
export async function listDestinationKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = []
  let continuationToken: string | undefined
  let pagesFetched = 0

  for (;;) {
    if (pagesFetched >= MAX_PAGES) {
      throw new Error(
        `[r2-migrate] listDestinationKeys: bucket "${bucket}" exceeded MAX_PAGES=${MAX_PAGES} — ` +
          `refusing to keep paging. Production scale is 51 objects total, so this is almost ` +
          `certainly a bug (an infinite/misbehaving listing), not real growth.`,
      )
    }

    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    )
    pagesFetched += 1

    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key)
    }

    if (!res.IsTruncated || !res.NextContinuationToken) break
    continuationToken = res.NextContinuationToken
  }

  return keys
}

/**
 * Uploads the source bytes to the destination, unconditionally overwriting
 * whatever is there — R2/S3 PutObject has no create-only mode (see
 * lib/storage/s3-provider.ts's own file header). That overwrite semantics is
 * exactly what makes a re-run self-healing: a corrupted or size-mismatched
 * destination object gets replaced, not skipped.
 *
 * `contentType` is `source.contentType` RAW AND UNMODIFIED — normalization
 * (normalizeContentType) exists for comparison only and must never leak into
 * what gets written.
 */
export async function copyObject(destStorage: StorageProvider, source: SourceObject): Promise<void> {
  await destStorage.upload(source.bucket, source.key, source.bytes, {
    contentType: source.contentType,
  })
}

/**
 * Migrates (or, in --verify-only mode, checks) every source object in one
 * bucket, then sweeps the destination for `[EXTRA]` objects the source has
 * no counterpart for.
 *
 * Per object, sequentially:
 *   1. readSourceObject   — the size/content-type authority (Supabase).
 *   2. headDestinationObject.
 *   3. compareObject.
 *   4. status === 'match'      -> [MATCH], done, no write.
 *      opts.verifyOnly         -> [WARN] for 'unknown-source-content-type',
 *                                 [FAIL] for anything else that isn't a
 *                                 match — copyObject is NEVER called here.
 *      otherwise                -> copyObject, then re-head + re-compare:
 *                                 [COPIED] on a match, [FAIL] otherwise (a
 *                                 write that appears to succeed but does not
 *                                 land must never be reported as a copy).
 */
export async function migrateBucket(
  deps: MigrationDeps,
  bucket: string,
  opts: MigrationOptions,
): Promise<{ rows: ReportRow[]; counts: { source: number; destination: number } }> {
  const { sourceStorage, destStorage, s3Client } = deps
  const rows: ReportRow[] = []

  const sourceKeys = await walkSupabaseBucket(sourceStorage, bucket)
  const sourceKeySet = new Set(sourceKeys)

  for (const key of sourceKeys) {
    const source = await readSourceObject(sourceStorage, bucket, key)
    const destination = await headDestinationObject(s3Client, bucket, key)
    const comparison = compareObject(source, destination)

    if (comparison.status === 'match') {
      rows.push({ label: 'MATCH', bucket, key, detail: comparison.detail })
      console.log(`[r2-migrate] [MATCH] ${bucket}/${key}`)
      continue
    }

    if (opts.verifyOnly) {
      const label: RowLabel = comparison.status === 'unknown-source-content-type' ? 'WARN' : 'FAIL'
      rows.push({ label, bucket, key, detail: comparison.detail })
      console.log(`[r2-migrate] [${label}] ${bucket}/${key} — ${comparison.detail} (verify-only: not copying)`)
      continue
    }

    console.log(`[r2-migrate] copying ${bucket}/${key} (was ${comparison.status})...`)
    await copyObject(destStorage, source)
    const recheckDestination = await headDestinationObject(s3Client, bucket, key)
    const recheck = compareObject(source, recheckDestination)

    if (recheck.status === 'match') {
      rows.push({ label: 'COPIED', bucket, key, detail: recheck.detail })
      console.log(`[r2-migrate] [COPIED] ${bucket}/${key}`)
    } else {
      rows.push({
        label: 'FAIL',
        bucket,
        key,
        detail: `copy did not land: ${recheck.detail}`,
      })
      console.log(`[r2-migrate] [FAIL] ${bucket}/${key} — copy did not land: ${recheck.detail}`)
    }
  }

  const destinationKeys = await listDestinationKeys(s3Client, bucket)
  for (const key of destinationKeys) {
    if (!sourceKeySet.has(key)) {
      rows.push({
        label: 'EXTRA',
        bucket,
        key,
        detail: 'present in destination, no source counterpart',
      })
      console.log(`[r2-migrate] [EXTRA] ${bucket}/${key} — present in destination, no source counterpart`)
    }
  }

  return { rows, counts: { source: sourceKeys.length, destination: destinationKeys.length } }
}

/** Runs migrateBucket over every requested bucket and renders one combined report. */
export async function runMigration(
  deps: MigrationDeps,
  opts: MigrationOptions,
): Promise<{ text: string; allPassed: boolean }> {
  const rows: ReportRow[] = []
  const countsByBucket: Record<string, { source: number; destination: number }> = {}

  for (const bucket of opts.buckets) {
    const { rows: bucketRows, counts } = await migrateBucket(deps, bucket, opts)
    rows.push(...bucketRows)
    countsByBucket[bucket] = counts
  }

  return formatMigrationReport(rows, countsByBucket)
}

// ---------------------------------------------------------------------------
// CLI (Plan 02 — MIG-01)
// ---------------------------------------------------------------------------

const SUPPORTED_FLAGS = '--verify-only, --bucket <name>'

/**
 * Three flags, hand-rolled — not worth a CLI arg library. An unrecognized
 * flag, or a `--bucket` value outside the five provisioned buckets, THROWS
 * rather than being silently ignored: an ignored `--delete-extra` typo or an
 * ignored `--verify-only` typo is exactly how an intended read-only check
 * turns into an unintended write run.
 */
export function parseArgs(argv: string[]): MigrationOptions {
  let verifyOnly = false
  const explicitBuckets: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--verify-only') {
      verifyOnly = true
      continue
    }

    if (arg === '--bucket') {
      const value = argv[i + 1]
      i += 1
      if (!value || !(MIGRATION_BUCKETS as readonly string[]).includes(value)) {
        throw new Error(
          `[r2-migrate] --bucket must be one of: ${MIGRATION_BUCKETS.join(', ')} (got ${JSON.stringify(value)})`,
        )
      }
      explicitBuckets.push(value)
      continue
    }

    throw new Error(`[r2-migrate] unrecognized flag ${JSON.stringify(arg)}. Supported flags: ${SUPPORTED_FLAGS}`)
  }

  return {
    verifyOnly,
    buckets: explicitBuckets.length > 0 ? explicitBuckets : MIGRATION_BUCKETS,
  }
}

/**
 * `argv` defaults to `process.argv.slice(2)` for real CLI invocations, and
 * is overridable so tests can call `main()` without inheriting the test
 * runner's own process.argv (which is not this script's CLI surface).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv)

  const config = s3ConfigFromEnv()
  if (!config) {
    console.error(
      '[r2-migrate] R2 not configured — one or more required S3_* env vars are missing or ' +
        'empty (see lib/storage/s3-config.ts for the exact list). Set them inline and re-run.',
    )
    process.exit(1)
    return
  }

  const s3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  })
  const destStorage = createS3StorageProvider(config)
  const sourceStorage = buildSourceStorage()

  const { text, allPassed } = await runMigration({ sourceStorage, destStorage, s3Client }, opts)
  // Print BEFORE exiting so a failing run is diagnosable from the terminal
  // without re-running.
  console.log(text)
  process.exit(allPassed ? 0 : 1)
}

// Guard direct execution so tests can import every export above with zero
// S3 calls, zero Supabase calls, and zero process.exit side effects — same
// pattern as scripts/r2-verify.ts.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
}
