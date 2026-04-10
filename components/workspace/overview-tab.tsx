'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { QuickStats } from './quick-stats'
import { ActivityTimeline } from './activity-timeline'
import type { ProjectDetail, ActivityEvent, ProjectQuickStats } from '@/lib/queries/project'

interface OverviewTabProps {
  project: ProjectDetail
  activity: ActivityEvent[]
  stats: ProjectQuickStats
}

export function OverviewTab({ project, activity, stats }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Project Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Project Summary</CardTitle>
            <StatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Client</dt>
              <dd className="text-sm font-medium">
                {project.client?.name ?? 'No client'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Type</dt>
              <dd className="text-sm font-medium">
                {project.project_type ?? 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Target Budget</dt>
              <dd className="text-sm font-medium">
                {project.target_budget
                  ? `$${Number(project.target_budget).toLocaleString()}`
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Total</dt>
              <dd className="text-sm font-medium">
                ${Number(project.total).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="text-sm font-medium">
                {new Date(project.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <QuickStats stats={stats} />

      {/* Activity Timeline */}
      <ActivityTimeline events={activity} />
    </div>
  )
}
