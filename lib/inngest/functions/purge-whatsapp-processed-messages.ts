/**
 * SEED-059 step 1 - replaces the pg_cron job `purge-whatsapp-processed-messages`:
 *   DELETE FROM whatsapp_processed_messages WHERE processed_at < NOW() - INTERVAL '48 hours'
 * every 6 hours. Idempotent; safe to overlap with pg_cron until the cutover.
 *
 * Never throws: a failure raises an ops alert and resolves with `error`.
 */
import { inngest } from '@/lib/inngest/client'
import { alertDbCronFailed } from '@/lib/inngest/db-cron-alert'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

const RETENTION_MS = 48 * 60 * 60 * 1000

export interface PurgeProcessedMessagesResult {
  deleted: number
  error?: string
}

export async function runPurgeWhatsAppProcessedMessages(
  svc: ServiceClientLike,
  now: number = Date.now(),
): Promise<PurgeProcessedMessagesResult> {
  const cutoff = new Date(now - RETENTION_MS).toISOString()
  const { error, count } = await svc
    .from('whatsapp_processed_messages')
    .delete({ count: 'exact' })
    .lt('processed_at', cutoff)
  if (error) {
    console.warn('[purge-whatsapp-processed-messages] delete failed:', error.message)
    await alertDbCronFailed('purge-whatsapp-processed-messages', error.message)
    return { deleted: 0, error: error.message }
  }
  return { deleted: count ?? 0 }
}

export const purgeWhatsAppProcessedMessagesJob = inngest.createFunction(
  {
    id: 'purge-whatsapp-processed-messages',
    triggers: [{ cron: '0 */6 * * *' }],
    retries: 2,
  },
  async ({ step }) => {
    return step.run('purge-whatsapp-processed-messages', async () =>
      runPurgeWhatsAppProcessedMessages(requireServiceClient()),
    )
  },
)
