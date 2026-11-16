'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, ChevronLeft, Lock } from 'lucide-react'
import { ProjectTitle } from '@/components/workspace/project-title'
import type { ProjectDetail } from '@/lib/queries/project'
import { useEstimateVersionSlot, type VersionSlot } from '@/components/workspace/estimate-version-context'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { EstimateStatusChip } from './estimate-status'

function SaveState({ slot }: { slot: VersionSlot }) {
  const { t } = useTranslation()
  if (slot.isReadOnly) return null

  let body: ReactNode
  if (slot.saveStatus === 'saving') {
    body = <span className="text-muted-foreground">{t('Saving…')}</span>
  } else if (slot.saveStatus === 'error') {
    body = (
      <>
        <span className="inline-flex items-center gap-1 text-[hsl(var(--destructive-text))]">
          <AlertCircle className="size-[15px]" aria-hidden />
          {t('Not saved')}
        </span>
        {slot.onRetrySave && (
          <button
            type="button"
            onClick={slot.onRetrySave}
            className="relative h-7 rounded-full bg-[hsl(var(--destructive-text)/0.12)] px-2.5 font-semibold text-[hsl(var(--destructive-text))] after:absolute after:-inset-1.5 after:content-['']"
          >
            {t('Try again')}
          </button>
        )}
      </>
    )
  } else if (slot.isDirty) {
    body = <span className="text-muted-foreground">{t('Unsaved changes')}</span>
  } else {
    body = (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Check className="size-[15px]" aria-hidden />
        {t('Saved')}
      </span>
    )
  }

  return (
    <span aria-live="polite" className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] font-medium">
      {body}
    </span>
  )
}

function StatusChip({ slot }: { slot: VersionSlot }) {
  return (
    <EstimateStatusChip
      sentAt={slot.sentAt}
      viewCount={slot.viewCount}
      clientResponse={slot.clientResponse}
      respondedAt={slot.respondedAt}
      onClick={slot.onOpenStatus}
    />
  )
}

function LockBanner({ slot }: { slot: VersionSlot }) {
  const { t } = useTranslation()
  const lead =
    slot.clientResponse === 'accepted'
      ? t('Estimate accepted.')
      : slot.clientResponse === 'declined'
        ? t('Estimate declined.')
        : t('Shared with the client.')
  return (
    <div
      data-testid="editor-lock-banner"
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-muted-foreground md:px-5',
        slot.clientResponse === 'accepted' ? 'bg-[hsl(var(--success)/0.15)]' : 'bg-muted/60',
      )}
    >
      <Lock className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-foreground">{lead}</b> {t('The content is locked.')}
      </span>
      {slot.onOpenStatus && (
        <button
          type="button"
          onClick={slot.onOpenStatus}
          className="h-8 shrink-0 whitespace-nowrap rounded-full bg-background px-3 text-[13px] font-semibold text-primary"
        >
          {t('See status')}
        </button>
      )}
    </div>
  )
}

/**
 * Editor frame v2 top bar: back, project name, client, live total, status and
 * save state. Drop-in replacement for ProjectHeader. `slot` is null while no
 * estimate is on screen (loading skeleton, client tab): then only back + name
 * + client render.
 */
export function EditorTopBar({ project }: { project: ProjectDetail }) {
  const { slot } = useEstimateVersionSlot()
  const { t } = useTranslation()
  const breadcrumbItems = useMemo(
    () => [
      { label: 'Projects', href: '/projects' },
      { label: project.name },
    ],
    [project.name],
  )

  // Feeds the global breadcrumb for the desktop top bar (same as ProjectHeader).
  useBreadcrumb(breadcrumbItems)

  const subtitle = [project.client?.name, slot?.estimateNumber].filter(Boolean).join(' · ')

  return (
    <header
      data-testid="editor-top-bar"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] pt-[env(safe-area-inset-top,0px)] md:pt-0"
    >
      <div className="flex items-center gap-1.5 py-2 pl-1.5 pr-3 md:py-2.5 md:pl-3 md:pr-5">
        <Link
          href="/projects"
          aria-label={t('Back to projects')}
          className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft size={22} aria-hidden />
        </Link>

        <div className="min-w-0 flex-1">
          <ProjectTitle
            size="compact"
            projectId={project.id}
            initialName={project.name}
            onRenameSuccess={slot?.onProjectRenamed}
          />
          {subtitle && <p className="truncate text-[12.5px] text-muted-foreground">{subtitle}</p>}
        </div>

        {slot && (
          <div data-testid="editor-top-bar-inline" className="mr-4 hidden shrink-0 items-center gap-2.5 md:flex">
            <StatusChip slot={slot} />
            <SaveState slot={slot} />
          </div>
        )}

        {typeof slot?.total === 'number' && (
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-[10.5px] font-medium uppercase leading-none tracking-[0.06em] text-muted-foreground">
              {t('Total')}
            </span>
            <span
              data-testid="editor-top-bar-total"
              className="text-[17px] font-bold leading-tight tracking-tight tabular-nums md:text-xl"
            >
              {formatCurrency(slot.total, slot.currencyCode)}
            </span>
          </div>
        )}
      </div>

      {slot && (
        <div
          data-testid="editor-top-bar-row2"
          className="flex min-h-7 items-center gap-2 pb-2 pl-[52px] pr-3 md:hidden"
        >
          <StatusChip slot={slot} />
          <span className="ml-auto">
            <SaveState slot={slot} />
          </span>
        </div>
      )}

      {slot?.isLocked && <LockBanner slot={slot} />}
    </header>
  )
}
