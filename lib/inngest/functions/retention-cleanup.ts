/**
 * Data-retention auto-cleanup cron (2026-07-09 performance sweep).
 *
 * Daily at 04:30 UTC, prunes the append-only event/telemetry tables that
 * otherwise grow unbounded (no code path ever deletes from them):
 *   - usage_events        — created_at older than 90 days
 *   - ai_cost_events      — created_at older than 90 days
 *   - pipeline_events     — created_at older than 90 days
 *   - tour_events         — created_at older than 90 days
 *   - processed_stripe_events — created_at older than 90 days (Stripe only
 *                            redelivers webhook events for ~3 days, so this
 *                            idempotency table has no reason to grow forever;
 *                            PK is `event_id`, not `id` — see deleteInBatches'
 *                            `idColumn` param)
 *   - price_research_cache — expires_at < now() (TTL already elapsed; the cache
 *                            module treats expired rows as a miss, so they are
 *                            dead weight the moment they expire)
 *
 * All five tables are service-role-only (RLS enabled, zero tenant policies),
 * so the cron reads/writes via requireServiceClient().
 *
 * Implementation notes (mirrors notification-cleanup.ts + cleanup-audio.ts):
 *   - The deletion logic lives in the pure helper `runRetentionCleanup(svc)`
 *     so it's testable without standing up the Inngest test harness. The
 *     Inngest fn is a thin wrapper that injects the service-role client.
 *   - Deletes are BATCHED (select a page of ids, delete that page, repeat) so a
 *     first run against a large backlog never issues one giant unbounded DELETE.
 *   - Best-effort & resilient: a per-table failure is logged and surfaced in
 *     `errors` rather than thrown — the cron runs daily, so a lost day is fine.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const DELETE_BATCH = 1000
// Hard cap on batches per table per run — a backstop against an unexpected
// infinite loop. 1000 batches * 1000 rows = 1M rows/table/run, far above any
// realistic daily accrual once the first backlog sweep completes.
const MAX_BATCHES = 1000

export interface RetentionTableResult {
  table: string
  deleted: number
  error?: string
}

export interface RetentionCleanupResult {
  deleted: number
  errors: number
  tables: RetentionTableResult[]
}

/**
 * Delete rows from `table` matching a single comparison predicate, in batches
 * of `DELETE_BATCH` ids. Returns the total deleted (or an error string on the
 * first failing query — partial progress is kept).
 */
async function deleteInBatches(
  svc: ServiceClientLike,
  table: string,
  column: string,
  cutoffIso: string,
  idColumn: string = 'id',
): Promise<RetentionTableResult> {
  let deleted = 0

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data: rows, error: selectErr } = await svc
      .from(table)
      .select(idColumn)
      .lt(column, cutoffIso)
      .limit(DELETE_BATCH)

    if (selectErr) {
      console.warn(`[retention-cleanup] ${table} select failed:`, selectErr.message)
      return { table, deleted, error: selectErr.message }
    }

    const ids = ((rows ?? []) as unknown as Record<string, string>[]).map((r) => r[idColumn])
    if (ids.length === 0) break

    const { error: deleteErr } = await svc.from(table).delete().in(idColumn, ids)
    if (deleteErr) {
      console.warn(`[retention-cleanup] ${table} delete failed:`, deleteErr.message)
      return { table, deleted, error: deleteErr.message }
    }

    deleted += ids.length
    // A short final page means the table is drained — avoid a redundant query.
    if (ids.length < DELETE_BATCH) break
  }

  return { table, deleted }
}

export async function runRetentionCleanup(
  svc: ServiceClientLike,
): Promise<RetentionCleanupResult> {
  const nowIso = new Date().toISOString()
  const ninetyDaysAgoIso = new Date(Date.now() - NINETY_DAYS_MS).toISOString()

  const tables: RetentionTableResult[] = []

  // 90-day age-based retention (created_at).
  for (const table of [
    'usage_events',
    'ai_cost_events',
    'pipeline_events',
    'tour_events',
  ]) {
    tables.push(await deleteInBatches(svc, table, 'created_at', ninetyDaysAgoIso))
  }

  // processed_stripe_events: PK is `event_id`, not `id` — pass idColumn.
  tables.push(
    await deleteInBatches(
      svc,
      'processed_stripe_events',
      'created_at',
      ninetyDaysAgoIso,
      'event_id',
    ),
  )

  // TTL-based retention (expires_at already elapsed).
  tables.push(
    await deleteInBatches(svc, 'price_research_cache', 'expires_at', nowIso),
  )

  return {
    deleted: tables.reduce((sum, t) => sum + t.deleted, 0),
    errors: tables.filter((t) => t.error).length,
    tables,
  }
}

export const retentionCleanupJob = inngest.createFunction(
  {
    id: 'retention-cleanup',
    triggers: [{ cron: '30 4 * * *' }],
  },
  async ({ step }) => {
    return step.run('prune-append-only-tables', async () => {
      const svc = requireServiceClient()
      return runRetentionCleanup(svc)
    })
  },
)
