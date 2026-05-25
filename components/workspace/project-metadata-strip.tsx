'use client'

import { StatusBadge } from '@/components/dashboard/status-badge'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { ProjectDetail } from '@/lib/queries/project'

interface ProjectMetadataStripProps {
  project: ProjectDetail
}

/**
 * R2 placement: thin chrome strip rendered ABOVE the Estimate document.
 * Read-only. Type/Target Budget are edited from project settings; status flips
 * when the client marks the Estimate completed.
 *
 * Mobile  (<sm): status pill always visible + native <details> accordion for the rest.
 * Desktop (sm+): single inline row, secondary text, status pill on the left.
 */
export function ProjectMetadataStrip({ project }: ProjectMetadataStripProps) {
  const { t } = useTranslation()

  const typeLabel = project.project_type
    ? project.project_type.replace(/_/g, ' ')
    : null
  const budgetLabel = project.target_budget
    ? `$${Number(project.target_budget).toLocaleString()}`
    : null
  const createdLabel = new Date(project.created_at).toLocaleDateString()

  return (
    <div className="px-1">
      {/* Desktop: inline strip */}
      <div className="hidden sm:flex sm:items-center sm:gap-3 sm:text-sm">
        <StatusBadge status={project.status} />
        {typeLabel && (
          <span className="text-muted-foreground capitalize">{typeLabel}</span>
        )}
        {budgetLabel && (
          <span className="text-muted-foreground">
            <span aria-hidden className="mx-1">·</span>
            {t('Target')} {budgetLabel}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {t('Created')} {createdLabel}
        </span>
      </div>

      {/* Mobile: status pill always visible + accordion for the rest */}
      <details className="sm:hidden group">
        <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          <StatusBadge status={project.status} />
          <span className="text-xs text-muted-foreground">
            {t('Project info')}
          </span>
          <span
            aria-hidden
            className="text-xs text-muted-foreground transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <dt>{t('Type')}</dt>
            <dd className="capitalize">{typeLabel ?? t('Not set')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t('Target Budget')}</dt>
            <dd>{budgetLabel ?? t('Not set')}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t('Created')}</dt>
            <dd>{createdLabel}</dd>
          </div>
        </dl>
      </details>
    </div>
  )
}
