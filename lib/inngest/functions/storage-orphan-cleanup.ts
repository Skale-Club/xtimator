/**
 * Phase 169-02 (CAPT-04) — Storage orphan reconciliation cron.
 *
 * Audit finding F5 (v4.19-ESTIMATE-DEEP-AUDIT.md § F5): upload precedes the
 * DB row + credit gate, so a blocked/failed request can leave a fully
 * uploaded Storage object with nothing referencing it — `cleanup-audio.ts`
 * is row-driven (walks `recordings`, not Storage) and can never see these;
 * photos have no cleanup at all.
 *
 * This cron walks the `audio` and `photos` buckets directly (the only place
 * in the app that does — every other call site works the other way, DB row
 * -> storage_path) and deletes objects that are:
 *   - older than 24h (by `updatedAt`, falling back to `createdAt` — see the
 *     AGE gate note below), AND
 *   - not referenced by ANY table that stores a full Storage key for that
 *     bucket.
 *
 * SHARED-BUCKET SAFETY (the 5 Opus plan-check blockers this rewrite fixes):
 *   1. The `photos` bucket is SHARED with price-book images
 *      ({companyId}/price-book/{ts}-{itemId}.{ext} — lib/actions/price-book.ts,
 *      referenced by `company_price_book.image_url`, no `photos` row at all).
 *   2. The `audio` bucket is SHARED with WhatsApp inbox audio
 *      ({companyId}/whatsapp/{msgId}.{ext} — lib/estimate/adapters/whatsapp.ts,
 *      referenced by `whatsapp_messages.media_url` while the corresponding
 *      `recordings` row's `storage_path` is NULL — WhatsApp audio is
 *      transcribed then the row is created with storage_path: null).
 *   Both prefixes are PROTECTED: the walk hard-skips them by name — it never
 *   even calls `storage.list()` inside them, let alone deletes anything
 *   there. This is stronger than a reference check (which those two classes
 *   would fail, since neither `recordings.storage_path` nor `photos.storage_path`
 *   ever points at them) — the protected-prefix skip is the primary guard;
 *   the union reference-matcher below is a belt for any future path shape.
 *   3. Real keys are 3 levels deep ({companyId}/{folder}/{leaf}) and
 *      Supabase's `.list()` is non-recursive/folder-style — the walk goes
 *      root (companies) -> per-company (folders) -> per-folder (files),
 *      paging past 100 entries at every level.
 *   4. `StorageProvider.list()` returns LEAF names only. Every key used for
 *      row-matching and for `storage.delete()` is the FULL rejoined key
 *      (`${companyId}/${folder}/${leafName}`) — never a bare leaf, which
 *      would never match a `storage_path` column and could theoretically
 *      collide across folders.
 *   5. The Inngest serve handler (app/api/inngest/route.ts) registers
 *      functions EXPLICITLY — this function is registered in BOTH the
 *      barrel (lib/inngest/functions/index.ts) AND route.ts's functions
 *      array, mirroring `cleanupAudioJob`'s dual presence.
 *
 * AGE gate note: Supabase Storage's `updated_at` for an object that has
 * never been re-uploaded (upsert) equals its `created_at` — so for the
 * never-touched orphans this cron targets, `updatedAt` IS a faithful
 * created_at proxy. `createdAt` (added additively in lib/storage/index.ts)
 * is used only as a fallback when `updatedAt` is somehow absent. If NEITHER
 * timestamp is available, the object is treated as "not old enough" (never
 * deleted) — an unknown age is not evidence of staleness.
 *
 * Phase 188 Plan 03 (PROV-01) — S3/R2-shaped `ListedObject` review: this job
 * now resolves its `StorageProvider` via `serverStorage()`, which returns
 * the S3 provider in R2 mode. `ageMsOf()` below already reads
 * `entry.updatedAt ?? entry.createdAt` and returns `null` (never delete) when
 * neither is present — that is exactly the fail-closed behavior this job
 * needs, and it required no code change: the S3 provider populates
 * `updatedAt` (from `LastModified`) for every real object it lists, so the
 * age gate works under both backends. The S3 provider also never sets
 * `isFolder` (undefined, not `false`/`true`) — the leaf-level check at
 * `if (fileEntry.isFolder) continue` only skips a Supabase folder
 * placeholder (`isFolder: true`); it is `false`/falsy for every S3 entry, so
 * no real S3 object is ever skipped there. The bucket/company/folder-level
 * `isFolder === false` guards above are Supabase-only defensive checks
 * against unexpected files at a level that should only contain folders —
 * under S3 they never trigger (isFolder is always `undefined`, never
 * `false`), which does not create a fail-open path: it only affects which
 * prefixes get walked, and the deletion decision is gated exclusively by
 * `ageMsOf()` and the reference check. Known separate limitation (NOT fixed
 * here — would require editing lib/storage/s3-provider.ts's `list()` to add
 * `Delimiter` support, which this plan may not touch): S3's
 * `ListObjectsV2Command` here has no `Delimiter`, so it returns keys
 * recursively rather than one folder level at a time the way Supabase's
 * `list()` does; under R2 this walk's assumed 3-level folder-by-folder
 * paging does not line up with a flat/recursive listing, so in practice real
 * orphans in R2 mode may not reach the deletion path at all (functional
 * gap, not a safety gap — deleting nothing wrongly-early is the fail-closed
 * direction).
 *
 * Convention (matches cleanup-audio.ts): NEVER call the Supabase Storage
 * client directly — every Storage operation here goes through the injected
 * `StorageProvider`. DB row lookups (`recordings`/`photos` tables) use the
 * Postgres client directly, same as cleanup-audio.ts's own row query — that
 * convention only forbids the Storage API, not Postgres queries.
 *
 * Never-throw: a `.list()` failure at any single level is logged and that
 * branch is abandoned (the rest of the walk continues); a reference-check or
 * delete failure for a single object is logged and that object is skipped.
 * One bad page/object never aborts the whole sweep.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { serverStorage } from '@/lib/storage/server'
import type { StorageProvider, ListedObject } from '@/lib/storage'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

const AGE_THRESHOLD_MS = 24 * 60 * 60 * 1000
const LIST_PAGE_SIZE = 100

export interface BucketSweepSummary {
  bucket: string
  scanned: number
  skippedProtectedPrefix: number
  deleted: number
}

export interface StorageOrphanCleanupResult {
  audio: BucketSweepSummary
  photos: BucketSweepSummary
}

interface BucketConfig {
  bucket: string
  /** Top-level folder names under {companyId}/ that are NEVER enumerated or deleted. */
  protectedPrefixes: string[]
  /** Union row-matcher: does ANY table reference this full key for this bucket? */
  isReferenced: (svc: ServiceClientLike, fullKey: string) => Promise<boolean>
}

async function recordingsReference(svc: ServiceClientLike, fullKey: string): Promise<boolean> {
  const { count } = await svc
    .from('recordings')
    .select('id', { count: 'exact', head: true })
    .eq('storage_path', fullKey)
  return (count ?? 0) > 0
}

async function photosReference(svc: ServiceClientLike, fullKey: string): Promise<boolean> {
  const { count } = await svc
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('storage_path', fullKey)
  return (count ?? 0) > 0
}

const BUCKET_CONFIGS: BucketConfig[] = [
  {
    bucket: 'audio',
    // WhatsApp inbound audio lives here with recordings.storage_path NULL —
    // see lib/estimate/adapters/whatsapp.ts:189.
    protectedPrefixes: ['whatsapp'],
    isReferenced: recordingsReference,
  },
  {
    bucket: 'photos',
    // Price-book item images live here with NO photos row at all —
    // see lib/actions/price-book.ts:190-202, :254-266.
    protectedPrefixes: ['price-book'],
    isReferenced: photosReference,
  },
]

/**
 * Page through `storage.list(bucket, prefix, { limit, offset })` until a
 * short page (or an error) ends the loop. Never throws — a list failure at
 * any offset logs and returns whatever was already collected, so the caller
 * can move on to the next branch of the walk instead of aborting the sweep.
 */
async function listAllPages(
  storage: StorageProvider,
  bucket: string,
  prefix: string,
): Promise<ListedObject[]> {
  const all: ListedObject[] = []
  let offset = 0
  for (;;) {
    let page: ListedObject[]
    try {
      page = await storage.list(bucket, prefix, { limit: LIST_PAGE_SIZE, offset })
    } catch (err) {
      console.warn(
        `[storage-orphan-cleanup] list failed (${bucket}/${prefix}):`,
        err instanceof Error ? err.message : String(err),
      )
      break
    }
    if (page.length === 0) break
    all.push(...page)
    if (page.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }
  return all
}

function ageMsOf(entry: ListedObject, now: number): number | null {
  const basis = entry.updatedAt ?? entry.createdAt
  if (!basis) return null
  const ts = new Date(basis).getTime()
  if (Number.isNaN(ts)) return null
  return now - ts
}

async function sweepBucket(
  svc: ServiceClientLike,
  storage: StorageProvider,
  config: BucketConfig,
  now: number,
): Promise<BucketSweepSummary> {
  let scanned = 0
  let skippedProtectedPrefix = 0
  let deleted = 0

  // Level 1: root of the bucket — company-id folders.
  const companies = await listAllPages(storage, config.bucket, '')

  for (const companyEntry of companies) {
    // Defensive: the documented shape never has files at bucket root — skip
    // anything that isn't a folder rather than guessing at a key shape.
    if (companyEntry.isFolder === false) continue
    const companyId = companyEntry.name

    // Level 2: per-company folders (projectId / whatsapp / price-book / ...).
    const level2 = await listAllPages(storage, config.bucket, companyId)

    for (const folderEntry of level2) {
      const folderName = folderEntry.name

      if (config.protectedPrefixes.includes(folderName)) {
        // Hard skip — never enumerate (no list() call) or delete inside a
        // protected prefix, regardless of what any reference check would say.
        skippedProtectedPrefix += 1
        continue
      }
      if (folderEntry.isFolder === false) {
        // Unexpected: a file directly under {companyId}/ (not the documented
        // 3-level shape). Skip defensively rather than guessing a key.
        continue
      }

      const folderPrefix = `${companyId}/${folderName}`

      // Level 3: the actual FILE objects inside this (non-protected) folder.
      const files = await listAllPages(storage, config.bucket, folderPrefix)

      for (const fileEntry of files) {
        if (fileEntry.isFolder) continue // folder placeholder — never a deletable object

        scanned += 1
        // Full-key rejoin — the FULL prefix + leaf name, never a bare leaf.
        const fullKey = `${folderPrefix}/${fileEntry.name}`

        const age = ageMsOf(fileEntry, now)
        if (age === null || age <= AGE_THRESHOLD_MS) continue // too fresh (or age unknown — never delete on an unknown age)

        try {
          const referenced = await config.isReferenced(svc, fullKey)
          if (referenced) continue

          // Defensive re-check immediately before delete (TOCTOU belt): a
          // row may have been created between the check above and now.
          const stillUnreferenced = !(await config.isReferenced(svc, fullKey))
          if (!stillUnreferenced) continue

          await storage.delete(config.bucket, fullKey)
          deleted += 1
        } catch (err) {
          console.warn(
            `[storage-orphan-cleanup] object check/delete failed (${config.bucket}/${fullKey}):`,
            err instanceof Error ? err.message : String(err),
          )
          continue
        }
      }
    }
  }

  const summary: BucketSweepSummary = {
    bucket: config.bucket,
    scanned,
    skippedProtectedPrefix,
    deleted,
  }
  console.log('[storage-orphan-cleanup] summary:', summary)
  return summary
}

export async function runStorageOrphanCleanup(
  svc: ServiceClientLike,
  storage: StorageProvider,
  opts?: { now?: number },
): Promise<StorageOrphanCleanupResult> {
  const now = opts?.now ?? Date.now()
  const audio = await sweepBucket(svc, storage, BUCKET_CONFIGS[0]!, now)
  const photos = await sweepBucket(svc, storage, BUCKET_CONFIGS[1]!, now)
  return { audio, photos }
}

export const storageOrphanCleanupJob = inngest.createFunction(
  {
    id: 'storage-orphan-cleanup',
    // Daily, offset 45min from cleanup-audio's 04:00 UTC (and clear of
    // retention-cleanup's 04:30) — see lib/inngest/functions/cleanup-audio.ts.
    triggers: [{ cron: '45 4 * * *' }],
  },
  async ({ step }) => {
    return step.run('sweep-storage-orphans', async () => {
      const svc = requireServiceClient()
      // Phase 188 (PROV-01): server-wide provider selection — see the
      // AGE-gate / isFolder note in this file's header for why the walk
      // below is safe (fails closed, never deletes) under the S3-shaped
      // ListedObject this can now return.
      const storage = serverStorage(svc)
      return runStorageOrphanCleanup(svc, storage)
    })
  },
)
