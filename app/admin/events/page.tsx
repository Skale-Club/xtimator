import Link from 'next/link'
import { ScrollText, Search } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { Card } from '@/components/ui/card'
import { T } from '@/components/i18n/t'
import { EmptyState } from '@/components/dashboard/empty-state'
import { EventsControls } from './events-controls'
import { buildSearchOr } from '@/lib/admin/events-helpers'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// Status pill helper — UI-SPEC status color map
function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>
  const map: Record<string, string> = {
    succeeded: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]',
    failed:    'bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]',
    started:   'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]',
  }
  const cls = map[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default async function EventLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()   // load-bearing authz — MUST run before any data read
  const svc = requireServiceClient()
  const sp = await searchParams   // Next 14: searchParams is a Promise

  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const search = sp.q ?? ''
  const statusFilter = sp.status ?? ''
  const inputTypeFilter = sp.input_type ?? ''
  const stepFilter = sp.step ?? ''

  // Email → user_id resolution (ADMINLOG-02): only when term looks like an email
  let resolvedUserId: string | null = null
  if (search.includes('@')) {
    const { data: { users } } = await svc.auth.admin.listUsers({ perPage: 1000 })
    const match = users.find((u) => u.email === search)
    if (match) resolvedUserId = match.id
  }

  // ── Main paginated query ───────────────────────────────────────────────────
  const from = (page - 1) * PAGE_SIZE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mainQ: any = svc.from('pipeline_attempts').select('*', { count: 'exact' })
  if (statusFilter)    mainQ = mainQ.eq('terminal_status', statusFilter)
  if (inputTypeFilter) mainQ = mainQ.eq('input_type', inputTypeFilter)
  if (stepFilter)      mainQ = mainQ.eq('step_reached', stepFilter)
  if (search) {
    if (resolvedUserId) {
      mainQ = mainQ.eq('user_id', resolvedUserId)
    } else {
      mainQ = mainQ.or(buildSearchOr(search))
    }
  }
  const { data, count } = await mainQ
    .order('last_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const attempts = (data ?? []) as Record<string, unknown>[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Filter-scoped counts (ADMINLOG-03) ────────────────────────────────────
  // Count queries reflect current search + input_type + step but NOT status filter
  // so all three numbers always show
  function countBase() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = svc.from('pipeline_attempts').select('attempt_id', { count: 'exact', head: true })
    if (inputTypeFilter) q = q.eq('input_type', inputTypeFilter)
    if (stepFilter)      q = q.eq('step_reached', stepFilter)
    if (search && resolvedUserId) q = q.eq('user_id', resolvedUserId)
    else if (search) q = q.or(buildSearchOr(search))
    return q
  }
  const [succeededResult, failedResult, startedResult] = await Promise.all([
    countBase().eq('terminal_status', 'succeeded'),
    countBase().eq('terminal_status', 'failed'),
    countBase().eq('terminal_status', 'started'),
  ])
  const succeededCount = succeededResult.count ?? 0
  const failedCount = failedResult.count ?? 0
  const startedCount = startedResult.count ?? 0

  // ── Prev/Next page URLs ────────────────────────────────────────────────────
  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter) params.set('status', statusFilter)
    if (inputTypeFilter) params.set('input_type', inputTypeFilter)
    if (stepFilter) params.set('step', stepFilter)
    params.set('page', String(p))
    return `/admin/events?${params.toString()}`
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="space-y-2">
        <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight">
          <T>Event Log</T>
        </h1>
        <p className="text-sm text-muted-foreground">
          <T>Diagnose any recording → estimate attempt. One row per attempt, newest first. Read-only.</T>
        </p>
        {/* Filter-scoped counts */}
        <p className="text-xs">
          <span className="text-[hsl(var(--success))] font-medium">{succeededCount}</span>
          <span className="text-muted-foreground"> <T>succeeded</T> · </span>
          <span className="text-[hsl(var(--danger))] font-medium">{failedCount}</span>
          <span className="text-muted-foreground"> <T>failed</T> · </span>
          <span className="text-[hsl(var(--warning))] font-medium">{startedCount}</span>
          <span className="text-muted-foreground"> <T>in progress</T></span>
        </p>
      </div>

      {/* Controls (client component) */}
      <EventsControls
        search={search}
        status={statusFilter}
        inputType={inputTypeFilter}
        step={stepFilter}
      />

      {/* Attempts table */}
      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium"><T>Attempt ID</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>When</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Input</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Step reached</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Status</T></th>
                <th className="text-left px-4 py-3 font-medium"><T>Duration</T></th>
                <th className="text-right px-4 py-3 font-medium"><T>Actions</T></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {attempts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
                    {search || statusFilter || inputTypeFilter || stepFilter ? (
                      <EmptyState
                        icon={Search}
                        title="No attempts match your filters"
                        description="Try a different search term, or clear the active filters to see all recent attempts."
                        actionLabel="Clear filters"
                        actionHref="/admin/events"
                      />
                    ) : (
                      <EmptyState
                        icon={ScrollText}
                        title="No pipeline events yet"
                        description="Recording and estimate attempts will appear here as they run. This log is read-only."
                      />
                    )}
                  </td>
                </tr>
              ) : (
                attempts.map((a) => (
                  <tr key={a.attempt_id as string} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">
                      {((a.attempt_id as string) ?? '').slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.last_at ? new Date(a.last_at as string).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{(a.input_type as string) ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono">{(a.step_reached as string) ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.terminal_status as string | null} />
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {a.total_duration_ms != null ? `${a.total_duration_ms} ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/events/${a.attempt_id as string}`}
                        className="text-[hsl(var(--primary))] hover:underline text-xs font-medium"
                      >
                        <T>View →</T>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          {page > 1 ? (
            <Link href={pageUrl(page - 1)} className="text-[hsl(var(--primary))] hover:underline">
              <T>Previous</T>
            </Link>
          ) : (
            <span className="text-muted-foreground"><T>Previous</T></span>
          )}
          <span className="text-muted-foreground">
            <T text={`Page ${page} of ${totalPages}`} />
          </span>
          {page < totalPages ? (
            <Link href={pageUrl(page + 1)} className="text-[hsl(var(--primary))] hover:underline">
              <T>Next</T>
            </Link>
          ) : (
            <span className="text-muted-foreground"><T>Next</T></span>
          )}
        </div>
      )}
    </div>
  )
}
