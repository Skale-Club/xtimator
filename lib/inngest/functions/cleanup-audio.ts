/**
 * Quick task 260522-kf2 (QUICK-KF2-BE-01..03) — Audio Storage auto-cleanup cron.
 *
 * Daily at 04:00 UTC, deletes Storage objects from the `audio` bucket for
 * recording rows whose `created_at < (now - 7 days)`. The recording row
 * (and its `transcript`) is preserved — only `storage_path` becomes NULL.
 *
 * Rationale:
 *   - Transcripts are the canonical input for AI estimate generation; we
 *     never want to lose them.
 *   - Raw audio files are only useful for the first few days (manual
 *     re-listen / retry transcription). After 7 days, the storage cost
 *     outweighs the recovery value.
 *
 * Implementation notes:
 *   - The deletion logic lives in the pure helper `runCleanupAudio(svc)`
 *     so it's testable without standing up the Inngest test harness. The
 *     Inngest function itself is a thin wrapper that injects the
 *     service-role client.
 *   - Uses the storage abstraction (`serverStorage(...)` from
 *     `@/lib/storage/server`, Phase 188 PROV-01) — NEVER calls Supabase's
 *     storage client directly, so this job follows the same R2/Supabase
 *     backend the rest of the server resolves.
 *   - Best-effort: per-file delete failures are logged and counted in
 *     `errors`. The cron runs daily so one failed file gets a retry
 *     within 24 hours. A whole-query failure (e.g. RLS) returns
 *     `{ deleted: 0, errors: 0 }` rather than throwing.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { serverStorage } from '@/lib/storage/server'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface CleanupAudioResult {
  deleted: number
  errors: number
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function runCleanupAudio(
  svc: ServiceClientLike,
): Promise<CleanupAudioResult> {
  const sevenDaysAgoIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()

  // Query stale recordings that still have an audio file in Storage.
  // The .not('storage_path', 'is', null) filter excludes text-only
  // recordings (Phase 27 made storage_path nullable) and rows already
  // cleaned up on a previous run.
  const { data: rows, error: selectErr } = await svc
    .from('recordings')
    .select('id, storage_path')
    .lt('created_at', sevenDaysAgoIso)
    .not('storage_path', 'is', null)

  if (selectErr) {
    console.warn('[cleanup-audio] select failed:', selectErr.message)
    return { deleted: 0, errors: 0 }
  }

  const stale = (rows ?? []) as Array<{ id: string; storage_path: string | null }>
  const storage = serverStorage(svc)

  let deleted = 0
  let errors = 0

  for (const row of stale) {
    if (!row.storage_path) continue // defensive — query already filters this out
    try {
      await storage.delete('audio', row.storage_path)
      // Null the storage_path so we don't re-attempt next run and the UI
      // knows the audio file is gone (transcript + row remain intact).
      const { error: updateErr } = await svc
        .from('recordings')
        .update({ storage_path: null })
        .eq('id', row.id)
      if (updateErr) {
        // The file is already gone from Storage; failing to null the
        // column means we'll attempt the (now-404) delete again
        // tomorrow. Count it as an error so the metric is honest.
        console.warn(
          '[cleanup-audio] storage_path null-out failed for',
          row.id,
          updateErr.message,
        )
        errors += 1
      } else {
        deleted += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[cleanup-audio] delete failed for', row.storage_path, msg)
      errors += 1
    }
  }

  return { deleted, errors }
}

export const cleanupAudioJob = inngest.createFunction(
  {
    id: 'cleanup-audio',
    triggers: [{ cron: '0 4 * * *' }],
  },
  async ({ step }) => {
    return step.run('delete-stale-audio-files', async () => {
      const svc = requireServiceClient()
      return runCleanupAudio(svc)
    })
  },
)
