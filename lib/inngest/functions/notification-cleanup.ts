/**
 * Phase 77 plan 06 (NOTIF-10) — Notification auto-cleanup cron.
 *
 * Daily at 03:00 UTC, deletes notification rows that meet ALL of:
 *   - created_at < (now - 60 days)
 *   - pinned = false       (pinned notifications survive forever)
 *   - expires_at IS NULL OR expires_at < now()
 *     (rows with a future expires_at survive until that timestamp passes)
 *
 * The deletion logic is extracted into `runNotificationCleanup` so it's
 * testable without standing up the Inngest test harness. The Inngest fn is
 * a thin wrapper that injects the service-role client.
 *
 * Best-effort: errors are logged and returned as `{deleted: 0, error: msg}`
 * rather than thrown. The cron runs daily anyway — losing one day is fine.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface CleanupResult {
  deleted: number
  error?: string
}

export async function runNotificationCleanup(
  svc: ServiceClientLike,
): Promise<CleanupResult> {
  const sixtyDaysAgo = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000,
  ).toISOString()
  const nowIso = new Date().toISOString()

  // Supabase `.delete()` returns the deleted rows when chained with `.select()`.
  // We only need the count, so select 'id' to keep payload minimal.
  const { data, error } = await svc
    .from('notifications')
    .delete()
    .lt('created_at', sixtyDaysAgo)
    .eq('pinned', false)
    .or(`expires_at.is.null,expires_at.lt.${nowIso}`)
    .select('id')

  if (error) {
    console.warn('[notification-cleanup] delete failed:', error.message)
    return { deleted: 0, error: error.message }
  }
  return { deleted: data?.length ?? 0 }
}

export const notificationCleanup = inngest.createFunction(
  {
    id: 'notification-cleanup',
    triggers: [{ cron: '0 3 * * *' }],
  },
  async ({ step }) => {
    return step.run('delete-stale-notifications', async () => {
      const svc = requireServiceClient()
      return runNotificationCleanup(svc)
    })
  },
)
