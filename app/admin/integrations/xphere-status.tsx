/**
 * Phase 1000 (XPHERE-B7): Xphere sync observability panel.
 *
 * Async server component rendered in the CRM integrations category. Surfaces a
 * glanceable view of mirror health straight from the companies sync-state
 * columns (no separate log table — Inngest run history + these columns are the
 * source of truth). Never prints any API key or token.
 */
import { requireServiceClient } from '@/lib/supabase/service'

export async function XphereStatus() {
  const svc = requireServiceClient()

  const [syncedRes, errorRes, erroredRes] = await Promise.all([
    // head-count queries avoid loading every row just to count
    svc
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .not('xphere_synced_at', 'is', null),
    svc
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .not('xphere_sync_error', 'is', null),
    svc
      .from('companies')
      .select('id, name, xphere_sync_error')
      .not('xphere_sync_error', 'is', null)
      .order('xphere_synced_at', { ascending: false, nullsFirst: false })
      .limit(20),
  ])

  const syncedCount = syncedRes.count ?? 0
  const errorCount = errorRes.count ?? 0
  const errored = (erroredRes.data ?? []) as Array<{
    id: string
    name: string | null
    xphere_sync_error: string | null
  }>

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 md:p-6 space-y-3">
      <h3 className="text-sm font-semibold">Sync Status</h3>
      <p className="text-sm text-muted-foreground">
        Synced: {syncedCount} · Errors: {errorCount}
      </p>

      {errorCount === 0 ? (
        <p className="text-sm text-muted-foreground">All companies synced.</p>
      ) : (
        <ul className="space-y-1.5">
          {errored.map((row) => (
            <li key={row.id} className="flex flex-col">
              <span className="text-sm font-medium">{row.name ?? row.id}</span>
              <span className="truncate text-xs text-destructive">
                {row.xphere_sync_error}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Run a full backfill by POSTing <code>/api/admin/xphere-backfill</code>{' '}
        (admin only).
      </p>
    </div>
  )
}
