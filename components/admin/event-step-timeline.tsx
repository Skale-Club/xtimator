import { SAFE_EVENT_COLUMNS, SafeEvent, formatDuration, terminalStatus } from '@/lib/admin/events-helpers'
import { T } from '@/components/i18n/t'
import { Card } from '@/components/ui/card'

// Exported for type-checking by tests
export { SAFE_EVENT_COLUMNS }

// Status color map — UI-SPEC status color map
function statusClasses(status: string | null) {
  const map: Record<string, { pill: string; dot: string }> = {
    succeeded: {
      pill: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]',
      dot:  'bg-[hsl(var(--success))]',
    },
    failed: {
      pill: 'bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]',
      dot:  'bg-[hsl(var(--danger))]',
    },
    started: {
      pill: 'bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]',
      dot:  'bg-[hsl(var(--warning))]',
    },
  }
  return map[status ?? ''] ?? {
    pill: 'bg-muted text-muted-foreground',
    dot:  'bg-muted-foreground',
  }
}

interface EventStepTimelineProps {
  // ADMINLOG-05: ONLY SafeEvent fields accepted — no sensitive data fields
  events: SafeEvent[]
  attemptId: string
}

export function EventStepTimeline({ events, attemptId }: EventStepTimelineProps) {
  const terminal = terminalStatus(events)
  const { pill: terminalPill } = statusClasses(terminal)
  // Name the step that actually failed (events are created_at ASC), not the last row —
  // a later step may still be 'started' while a middle step is the real failure.
  const failedStep = terminal === 'failed' ? events.find((e) => e.status === 'failed')?.step : null

  return (
    <div className="space-y-8">
      {/* Attempt header */}
      <Card variant="glass" className="p-6 space-y-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground"><T>Attempt ID</T></p>
          <p className="font-mono text-sm font-semibold">{attemptId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {events[0]?.user_id && (
            <span className="font-mono">{events[0].user_id.slice(0, 8)}…</span>
          )}
          {events[0]?.company_id && (
            <span className="font-mono">{events[0].company_id.slice(0, 8)}…</span>
          )}
          {events[0]?.project_id && (
            <span>
              <T>Project</T>:{' '}
              <span className="font-mono">{events[0].project_id.slice(0, 8)}…</span>
            </span>
          )}
          {events[0]?.estimate_id && (
            <span>
              <T>Estimate</T>:{' '}
              <span className="font-mono">{events[0].estimate_id.slice(0, 8)}…</span>
            </span>
          )}
          {events[0]?.input_type && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {events[0].input_type}
            </span>
          )}
          {/* Terminal status pill */}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${terminalPill}`}>
            {terminal}
          </span>
        </div>
        {failedStep && (
          <p className="text-xs text-[hsl(var(--danger))]">
            <T text={`Failed at step: ${failedStep}`} />
          </p>
        )}
      </Card>

      {/* Step timeline section heading */}
      <h2 className="text-lg font-medium">
        <T>Step timeline</T>
      </h2>

      {/* Timeline — flex col, one item per pipeline_events row (created_at ASC) */}
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <T>No step events recorded for this attempt.</T>
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {events.map((ev, idx) => {
            const { pill, dot } = statusClasses(ev.status)
            const isLast = idx === events.length - 1
            return (
              <div key={ev.id} className="flex gap-4">
                {/* Left rail: dot + connector */}
                <div className="flex flex-col items-center gap-0">
                  <div
                    className={`h-2.5 w-2.5 rounded-full flex-shrink-0 mt-1.5 ${dot}`}
                    aria-hidden="true"
                  />
                  {!isLast && (
                    <div className="flex-1 w-px bg-border mt-1" aria-hidden="true" />
                  )}
                </div>

                {/* Step card */}
                <Card variant="glass" className="flex-1 p-4 space-y-2">
                  {/* Row 1: step name + status pill + timestamp */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{ev.step ?? '—'}</span>
                    <div className="flex items-center gap-2">
                      {/* Status pill — conveys status by BOTH color AND text (WCAG 1.4.1) */}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}>
                        {ev.status ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: meta (provider, duration, retry_count) — only non-null values */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                    {ev.provider && <span><T>Provider</T> {ev.provider}</span>}
                    <span><T>Duration</T> {formatDuration(ev.duration_ms)}</span>
                    {ev.retry_count != null && ev.retry_count > 0 && (
                      <span><T>Retries</T> ×{ev.retry_count}</span>
                    )}
                  </div>

                  {/* Row 3: error block — only when status=failed */}
                  {ev.status === 'failed' && (ev.error_code || ev.error_message) && (
                    <div className="rounded-md border bg-[hsl(var(--danger)/0.08)] px-3 py-2 space-y-1">
                      {ev.error_code && (
                        <p className="text-xs font-mono font-semibold text-[hsl(var(--danger))]">
                          {ev.error_code}
                        </p>
                      )}
                      {ev.error_message && (
                        <p className="text-sm text-[hsl(var(--danger)/0.9)]">
                          {ev.error_message}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
