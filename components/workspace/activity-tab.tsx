'use client'

import { ActivityTimeline } from './activity-timeline'
import type { ActivityEvent } from '@/lib/queries/project'

interface ActivityTabProps {
  events: ActivityEvent[]
}

export function ActivityTab({ events }: ActivityTabProps) {
  return <ActivityTimeline events={events} />
}
