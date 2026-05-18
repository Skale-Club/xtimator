'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FolderPlus,
  Mic,
  Camera,
  Sparkles,
  Send,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { relativeTime } from '@/lib/utils/relative-time'
import type { ActivityEvent } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'

const EVENT_CONFIG: Record<string, { icon: LucideIcon; label: string }> = {
  project_created: { icon: FolderPlus, label: 'Project created' },
  recording_added: { icon: Mic, label: 'Recording added' },
  photos_uploaded: { icon: Camera, label: 'Photos uploaded' },
  estimate_generated: { icon: Sparkles, label: 'Estimate generated' },
  estimate_sent: { icon: Send, label: 'Estimate sent' },
  estimate_accepted: { icon: CheckCircle, label: 'Estimate accepted' },
  estimate_declined: { icon: XCircle, label: 'Estimate declined' },
}

interface ActivityTimelineProps {
  events: ActivityEvent[]
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const { t } = useTranslation()
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-base">{t('Activity')}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('No activity yet')}
          </p>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              const config = EVENT_CONFIG[event.event_type] ?? {
                icon: Clock,
                label: event.event_type,
              }
              const Icon = config.icon
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-muted p-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{t(config.label)}</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(event.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
