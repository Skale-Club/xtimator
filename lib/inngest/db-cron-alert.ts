/**
 * SEED-059 step 1 - shared failure alert for the Inngest crons that replace the
 * former in-database pg_cron jobs. Best-effort, dedupe-bucketed so a persistently
 * broken job pages once per bucket, never once per run.
 */
import { notifyOps } from '@/lib/observability/ops-alert'

export async function alertDbCronFailed(
  jobId: string,
  message: string,
  bucket: 'hour' | 'day' = 'hour',
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, bucket === 'hour' ? 13 : 10)
  await notifyOps({
    kind: 'db_cron_failed',
    severity: 'error',
    title: `DB cron failed: ${jobId}`,
    message,
    dedupeKey: `db_cron_failed:${jobId}:${stamp}`,
  })
}
