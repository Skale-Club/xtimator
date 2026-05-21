'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { ActivityTimeline } from './activity-timeline'
import { LinkClientCard } from './link-client-card'
import type { ProjectDetail, ActivityEvent } from '@/lib/queries/project'
import { useTranslation } from '@/lib/i18n/use-translation'

interface OverviewTabProps {
  project: ProjectDetail
  activity: ActivityEvent[]
}

export function OverviewTab({ project, activity }: OverviewTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      {/* Link Client Card — shown only when no client linked */}
      {!project.client && (
        <LinkClientCard projectId={project.id} />
      )}
      {/* Project Summary Card */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Project Summary')}</CardTitle>
            <StatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">{t('Client')}</dt>
              <dd className="text-sm font-medium">
                {project.client?.name ?? t('No client')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('Type')}</dt>
              <dd className="text-sm font-medium">
                {project.project_type ?? t('Not set')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('Target Budget')}</dt>
              <dd className="text-sm font-medium">
                {project.target_budget
                  ? `$${Number(project.target_budget).toLocaleString()}`
                  : t('Not set')}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('Total')}</dt>
              <dd className="text-sm font-medium">
                ${Number(project.total).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t('Created')}</dt>
              <dd className="text-sm font-medium">
                {new Date(project.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <ActivityTimeline events={activity} />
    </div>
  )
}
