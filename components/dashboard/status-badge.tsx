import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  draft:      'bg-muted text-muted-foreground',
  processing: 'bg-[hsl(var(--warning-muted))] text-[hsl(var(--warning))]',
  ready:      'bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]',
  sent:       'bg-accent text-accent-foreground',
  accepted:   'bg-[hsl(var(--success-muted))] text-[hsl(var(--success))]',
  declined:   'bg-[hsl(var(--danger-muted))] text-[hsl(var(--danger))]',
  archived:   'bg-muted text-muted-foreground',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft

  return (
    <Badge
      variant="secondary"
      className={cn('capitalize hover:opacity-90', style)}
    >
      {status}
    </Badge>
  )
}
