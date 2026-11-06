/**
 * SEED-056 step 1 - replaces the pg_cron job `cleanup-orphan-draft-projects`
 * (`SELECT public.cleanup_orphan_draft_projects();`, daily 03:00).
 *
 * The cleanup lives in the SQL function (drafts older than 24h with no
 * recordings and no estimates), so this job only calls the RPC. The RPC is
 * idempotent: a second run finds nothing, so overlapping with pg_cron until the
 * cutover is safe.
 *
 * Never throws: a failure raises an ops alert and resolves with `error`; the next
 * daily run tries again.
 */
import { inngest } from '@/lib/inngest/client'
import { alertDbCronFailed } from '@/lib/inngest/db-cron-alert'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface CleanupOrphanDraftsResult {
  deleted: number
  error?: string
}

export async function runCleanupOrphanDraftProjects(
  svc: ServiceClientLike,
): Promise<CleanupOrphanDraftsResult> {
  const { data, error } = await svc.rpc('cleanup_orphan_draft_projects')
  if (error) {
    console.warn('[cleanup-orphan-draft-projects] rpc failed:', error.message)
    await alertDbCronFailed('cleanup-orphan-draft-projects', error.message, 'day')
    return { deleted: 0, error: error.message }
  }
  // RETURNS TABLE(deleted_count integer) -> [{ deleted_count: n }]
  const row = Array.isArray(data) ? data[0] : data
  const count = Number((row as { deleted_count?: unknown } | null)?.deleted_count ?? 0)
  return { deleted: Number.isFinite(count) ? count : 0 }
}

export const cleanupOrphanDraftProjectsJob = inngest.createFunction(
  {
    id: 'cleanup-orphan-draft-projects',
    triggers: [{ cron: '0 3 * * *' }],
    retries: 2,
  },
  async ({ step }) => {
    return step.run('cleanup-orphan-draft-projects', async () =>
      runCleanupOrphanDraftProjects(requireServiceClient()),
    )
  },
)
