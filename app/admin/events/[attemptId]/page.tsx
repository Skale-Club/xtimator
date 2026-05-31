import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { T } from '@/components/i18n/t'
import { EventStepTimeline } from '@/components/admin/event-step-timeline'

export const dynamic = 'force-dynamic'

export default async function AttemptDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  await requireAdmin()   // load-bearing authz — MUST run before any data read
  const svc = requireServiceClient()

  const { attemptId } = await params   // Next 14: params is a Promise

  // ADMINLOG-05: Explicit select list — ONLY the 15 safe columns.
  // never select('*') here; never add sensitive data fields.
  const { data: rows } = await svc
    .from('pipeline_events')
    .select('id,attempt_id,project_id,estimate_id,user_id,company_id,input_type,step,status,error_message,error_code,provider,duration_ms,retry_count,created_at')
    .eq('attempt_id', attemptId)
    .order('created_at', { ascending: true })   // ASC for chronological timeline (D-07)

  if (!rows || rows.length === 0) notFound()

  return (
    <div className="space-y-6">
      {/* Back link — mirrors companies/[id] pattern */}
      <Link
        href="/admin/events"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={14} />
        <T>All attempts</T>
      </Link>

      <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-tight font-mono">
        <T text={`Attempt ${attemptId.slice(0, 8)}…`} />
      </h1>

      <EventStepTimeline events={rows} attemptId={attemptId} />
    </div>
  )
}
