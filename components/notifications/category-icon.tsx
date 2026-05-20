import {
  MessageSquare,
  DollarSign,
  FileText,
  Clock,
  Activity,
  ShieldCheck,
  Cpu,
  Wrench,
} from 'lucide-react'
import type { EventCategory } from '@/lib/notifications/event-types'

const MAP: Record<EventCategory, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageSquare,
  payment: DollarSign,
  estimate: FileText,
  trial: Clock,
  quota: Activity,
  admin: ShieldCheck,
  ai_job: Cpu,
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
