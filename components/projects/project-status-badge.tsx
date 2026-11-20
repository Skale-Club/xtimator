import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_STYLE =
  'bg-transparent text-blue-400 border border-blue-500/60'

const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
  // Credits plan 2026-11-20: a virtual status (lib/queries/credit-pauses.ts) -
  // the project's capture is paused waiting for a top-up.
  awaiting_credits: 'Paused: out of credits',
}

const STATUS_STYLES: Record<string, string> = {
  estimate_ready:
    'bg-green-500/15 text-green-400 border border-green-500/50',
  awaiting_credits:
    'bg-amber-500/10 text-amber-500 border border-amber-500/40',
}

interface ProjectStatusBadgeProps {
  status: string
}

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  const label = STATUS_LABEL[status] ?? IN_PROGRESS_LABEL
  const style = STATUS_STYLES[status] ?? IN_PROGRESS_STYLE

  return (
    <Badge variant="secondary" className={cn('hover:opacity-90', style)}>
      {label}
    </Badge>
  )
}
