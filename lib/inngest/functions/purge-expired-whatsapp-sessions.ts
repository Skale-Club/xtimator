/**
 * SEED-059 step 1 - replaces the pg_cron job `purge-expired-whatsapp-sessions`:
 *   DELETE FROM whatsapp_sessions
 *   WHERE state = 'awaiting_confirm' AND expires_at < NOW() - INTERVAL '5 minutes'
 * every 10 minutes. Idempotent; safe to overlap with pg_cron until the cutover.
 *
 * Never throws: a failure raises an ops alert (hour-bucketed so a broken job
 * pages once an hour, not every 10 minutes) and resolves with `error`.
 */
import { inngest } from '@/lib/inngest/client'
import { alertDbCronFailed } from '@/lib/inngest/db-cron-alert'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

const GRACE_MS = 5 * 60 * 1000

export interface PurgeSessionsResult {
  deleted: number
  error?: string
}

export async function runPurgeExpiredWhatsAppSessions(
  svc: ServiceClientLike,
  now: number = Date.now(),
): Promise<PurgeSessionsResult> {
  const cutoff = new Date(now - GRACE_MS).toISOString()
  const { error, count } = await svc
    .from('whatsapp_sessions')
    .delete({ count: 'exact' })
    .eq('state', 'awaiting_confirm')
    .lt('expires_at', cutoff)
  if (error) {
    console.warn('[purge-expired-whatsapp-sessions] delete failed:', error.message)
    await alertDbCronFailed('purge-expired-whatsapp-sessions', error.message)
    return { deleted: 0, error: error.message }
  }
  return { deleted: count ?? 0 }
}

export const purgeExpiredWhatsAppSessionsJob = inngest.createFunction(
  {
    id: 'purge-expired-whatsapp-sessions',
    triggers: [{ cron: '*/10 * * * *' }],
    retries: 1,
  },
  async ({ step }) => {
    return step.run('purge-expired-whatsapp-sessions', async () =>
      runPurgeExpiredWhatsAppSessions(requireServiceClient()),
    )
  },
)
