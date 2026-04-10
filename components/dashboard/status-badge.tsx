import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
  processing: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  ready: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  sent: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  accepted: 'bg-green-100 text-green-700 hover:bg-green-100',
  declined: 'bg-red-100 text-red-700 hover:bg-red-100',
  archived: 'bg-muted text-muted-foreground hover:bg-muted',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft

  return (
    <Badge
      variant="secondary"
      className={cn('capitalize', style)}
    >
      {status}
    </Badge>
  )
}
