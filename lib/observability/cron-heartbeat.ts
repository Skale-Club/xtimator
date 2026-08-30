import 'server-only'

/**
 * lib/observability/cron-heartbeat.ts
 *
 * The deadman half of cron monitoring.
 *
 * The cron routes already alert LOUDLY when they fail: both call
 * `notifyOps({ kind: 'cron_failed' })`, which is a locked platform event and
 * always reaches Telegram regardless of the admin toggle matrix. That covers
 * "it ran and broke".
 *
 * It does not cover "it never ran". Scheduling lives in the `skale-cron`
 * crontab on the Coolify VPS (every `schedule:` was removed from
 * .github/workflows/cron-jobs.yml), so a broken crontab, a rotated CRON_SECRET
 * or a rebuilt box produces no request, no error, and no alert — just silence.
 *
 * So each job records a heartbeat when it SUCCEEDS, and an observer outside the
 * app (the uptime probe workflow, via GET /api/health/crons) alerts when a
 * heartbeat goes stale.
 *
 * Never throws. A heartbeat write is telemetry; it must never turn a cron run
 * that actually did its work into a failed one.
 */
import { createServiceClient } from '@/lib/supabase/service'

/**
 * The jobs under deadman watch, and how long silence is allowed to last.
 *
 * `staleAfterMinutes` is the scheduled interval plus deliberate slack. It is
 * NOT the interval itself: cron fires are not instantaneous, a deploy can eat a
 * tick, and a probe that alerts the moment a job is one second late would page
 * on normal jitter — which is how a channel gets muted. Roughly 2x the interval
 * (with a floor that tolerates one fully missed run) is the target.
 *
 * Keep this in sync with the skale-cron crontab on the VPS. If a schedule
 * changes there and not here, the deadman either cries wolf or goes blind.
 */
export const CRON_JOBS = {
  'cleanup-orphan-projects': {
    /** Crontab: 0 3 * * *  (daily, 03:00) */
    schedule: 'daily 03:00',
    staleAfterMinutes: 30 * 60, // 30h — tolerates one fully missed day
  },
  'cleanup-whatsapp-sessions': {
    /** Crontab: *​/15 * * * *  (every 15 minutes) */
    schedule: 'every 15 min',
    staleAfterMinutes: 60, // 1h — tolerates three missed ticks
  },
} as const

export type CronJobName = keyof typeof CRON_JOBS
export const CRON_JOB_NAMES = Object.keys(CRON_JOBS) as CronJobName[]

/**
 * Record that `job` completed successfully, just now.
 *
 * Call ONLY on the success path. Recording on failure would refresh the
 * heartbeat of a job that runs and fails every time, hiding it from the
 * deadman behind the very signal meant to expose it — the failure is already
 * carried by notifyOps('cron_failed').
 *
 * `detail` is small, non-PII run metadata (counts, ids of nothing) surfaced in
 * /api/health/crons purely to make an alert readable.
 */
export async function recordCronHeartbeat(
  job: CronJobName,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const svc = createServiceClient()
    if (!svc) return // no service client (env missing) → nothing to record
    await svc.from('cron_heartbeats').upsert(
      {
        job,
        last_success_at: new Date().toISOString(),
        last_detail: detail ?? null,
      },
      { onConflict: 'job' }
    )
  } catch (err) {
    // Telemetry must never fail the job it observes.
    console.warn(`[cron-heartbeat] failed to record '${job}':`, err)
  }
}

export interface CronHeartbeatStatus {
  job: string
  schedule: string
  lastSuccessAt: string | null
  ageMinutes: number | null
  staleAfterMinutes: number
  stale: boolean
}

/**
 * Current deadman status for every watched job.
 *
 * A job with NO row reports `lastSuccessAt: null` and `stale: true`. That is
 * deliberate: "never ran once" is strictly worse than "ran and went quiet", and
 * treating an absent row as healthy would make the whole mechanism fail open —
 * the deadman would be born dead and never say so.
 *
 * In practice the migration seeds a baseline row per job (marked
 * `{"bootstrap": true}`) so the watch starts counting at install time instead
 * of alerting the moment it ships. A null row therefore means someone deleted
 * it or added a job to CRON_JOBS without a matching baseline — both worth
 * hearing about.
 */
export async function getCronHeartbeats(
  now = Date.now()
): Promise<CronHeartbeatStatus[]> {
  const rows = new Map<string, string>()
  try {
    const svc = createServiceClient()
    if (svc) {
      const { data } = await svc
        .from('cron_heartbeats')
        .select('job, last_success_at')
      for (const r of data ?? []) {
        rows.set(r.job as string, r.last_success_at as string)
      }
    }
  } catch (err) {
    console.warn('[cron-heartbeat] read failed:', err)
  }

  return CRON_JOB_NAMES.map((job) => {
    const cfg = CRON_JOBS[job]
    const last = rows.get(job) ?? null
    const ageMinutes =
      last === null ? null : Math.floor((now - new Date(last).getTime()) / 60_000)
    return {
      job,
      schedule: cfg.schedule,
      lastSuccessAt: last,
      ageMinutes,
      staleAfterMinutes: cfg.staleAfterMinutes,
      stale: ageMinutes === null || ageMinutes > cfg.staleAfterMinutes,
    }
  })
}
