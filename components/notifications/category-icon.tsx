import { DollarSign, FileText, Wrench } from 'lucide-react'
import type { EventCategory } from '@/lib/notifications/event-types'

// Phase 104: reduced to the 3 visible categories. Legacy feed rows whose
// event_type maps to `_dropped` (or any unknown category) fall back to Wrench
// via the `?? Wrench` guard below — no crash.
const MAP: Partial<
  Record<EventCategory, React.ComponentType<{ className?: string }>>
> = {
  estimate: FileText,
  billing: DollarSign,
  system: Wrench,
}

export function CategoryIcon({
  category,
  className,
}: {
  category: EventCategory
  className?: string
}) {
  const Icon = MAP[category] ?? Wrench
  return <Icon className={className} />
}
