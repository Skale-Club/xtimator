import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_STYLE =
  'bg-transparent text-blue-400 border border-blue-500/60'

const STATUS_LABEL: Record<string, string> = {
  estimate_ready: 'Estimate ready',
}

const STATUS_STYLES: Record<string, string> = {
  estimate_ready:
    'bg-green-500/15 text-green-400 border border-green-500/50',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABEL[status] ?? IN_PROGRESS_LABEL
  const style = STATUS_STYLES[status] ?? IN_PROGRESS_STYLE

  return (
    <Badge variant="secondary" className={cn('hover:opacity-90', style)}>
      {label}
    </Badge>
  )
}
