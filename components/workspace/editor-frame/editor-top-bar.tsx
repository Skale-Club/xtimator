'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronLeft, Eye, Lock, XCircle } from 'lucide-react'
import { ProjectTitle } from '@/components/workspace/project-title'
import type { ProjectDetail } from '@/lib/queries/project'
import { useEstimateVersionSlot, type VersionSlot } from '@/components/workspace/estimate-version-context'
import { useBreadcrumb } from '@/components/app-shell/breadcrumb-context'
import { formatCurrency } from '@/lib/utils/format'
import { useAppTranslation, useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import { PausedChip } from '@/components/billing/paused-chip'
import { EstimateStatusChip, deriveEstimateStatus } from './estimate-status'

/** Same horizontal padding as the workspace content column below the bar. */
const GUTTER = 'px-3 sm:px-5 md:px-6'

/** Only while saving or when a save failed; idle/saved/dirty render nothing. */
function SaveState({ slot }: { slot: VersionSlot }) {
  const { t } = useTranslation()
  if (slot.isReadOnly) return null

  let body: ReactNode = null
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
  }
  if (!body) return null

  return (
    <span aria-live="polite" className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] font-medium">
      {body}
    </span>
  )
}

/** Drafts show no chip at all. */
function StatusChip({ slot }: { slot: VersionSlot }) {
  const status = deriveEstimateStatus({
    sentAt: slot.sentAt,
    viewCount: slot.viewCount,
    clientResponse: slot.clientResponse,
  })
  if (status === 'draft') return null
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

const BANNER_BUTTON =
  'min-h-8 shrink-0 whitespace-nowrap rounded-full bg-background px-3 text-[13px] font-semibold text-primary'

function SentNotice() {
  const { t } = useTranslation()
  return (
    <div
      data-testid="editor-sent-notice"
      className={cn('flex items-center gap-2.5 bg-primary/10 py-2 text-[12.5px] text-muted-foreground sm:text-[13px]', GUTTER)}
    >
      <Eye className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-foreground">{t('Shared with the client.')}</b>{' '}
        {t('Changes you make show up on their link.')}
      </span>
    </div>
  )
}

function LockBanner({ slot }: { slot: VersionSlot }) {
  const { t } = useTranslation()
  const accepted = slot.clientResponse === 'accepted'
  const declined = slot.clientResponse === 'declined'

  const Icon = declined ? XCircle : Lock
  const tone = accepted
    ? 'bg-[hsl(var(--success)/0.15)]'
    : declined
      ? 'bg-[hsl(var(--destructive-text)/0.12)]'
      : 'bg-muted/60'
  const lead = accepted ? t('Estimate accepted.') : declined ? t('Estimate declined.') : t('Estimate locked.')
  const rest = accepted
    ? t('This is the contract and it can’t be edited.')
    : declined
      ? t('Revise it and reopen it so the client can answer again.')
      : null

  const showReopen = declined && !!slot.onReopen
  const action = showReopen ? slot.onReopen : slot.onOpenStatus
  const actionLabel = showReopen ? t('Revise and reopen') : t('See status')

  return (
    <div
      data-testid="editor-lock-banner"
      className={cn('flex items-center gap-2.5 py-2.5 text-[13px] text-muted-foreground', GUTTER, tone)}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="font-semibold text-foreground">{lead}</b>
        {rest ? <> {rest}</> : null}
      </span>
      {action && (
        <button type="button" onClick={action} className={BANNER_BUTTON}>
          {actionLabel}
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
 *
 * Every row uses the workspace content gutter so title, client line and chip
 * share one left edge with the document below. On phones the back link is a
 * text row above the title; on desktop the global breadcrumb replaces it.
 */
export function EditorTopBar({ project }: { project: ProjectDetail }) {
  const { slot } = useEstimateVersionSlot()
  const { t } = useTranslation()
  // The breadcrumb is app chrome: app language, never the estimate's (QA 2026-11-20).
  const { t: tApp } = useAppTranslation()
  const projectsLabel = tApp('Projects')
  const breadcrumbItems = useMemo(
    () => [
      { label: projectsLabel, href: '/projects' },
      { label: project.name },
    ],
    [project.name, projectsLabel],
  )

  // Feeds the global breadcrumb for the desktop top bar (same as ProjectHeader).
  useBreadcrumb(breadcrumbItems)

  const subtitle = [project.client?.name, slot?.estimateNumber].filter(Boolean).join(' · ')
  // Credits plan 2026-11-20: the capture is paused for credits (set by the page).
  const pausedChip = project.paused_attempt_id ? (
    <PausedChip projectId={project.id} attemptId={project.paused_attempt_id} />
  ) : null
  const hasTotal = typeof slot?.total === 'number'

  const sentNotice =
    !!slot &&
    !slot.isLocked &&
    deriveEstimateStatus({ sentAt: slot.sentAt, viewCount: slot.viewCount, clientResponse: slot.clientResponse }) === 'sent'

  return (
    <header
      data-testid="editor-top-bar"
      className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] pt-[env(safe-area-inset-top,0px)] md:pt-0"
    >
      {/* Row A (phones): back link, save state, status chip */}
      <div className={cn('flex min-h-[34px] items-center justify-between md:hidden', GUTTER)}>
        <Link
          href="/projects"
          aria-label={t('Back to projects')}
          className="-ml-[5px] inline-flex min-h-[34px] items-center pr-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={18} aria-hidden />
          {t('Projects')}
        </Link>
        {(slot || pausedChip) && (
          <div data-testid="editor-top-bar-row-a" className="flex items-center gap-2">
            {pausedChip}
            {slot && <SaveState slot={slot} />}
            {slot && <StatusChip slot={slot} />}
          </div>
        )}
      </div>

      {/* Row B: title, (desktop) save state + chip, total */}
      <div className={cn('flex items-center justify-between gap-3 pb-0.5 pt-1 md:py-2.5', GUTTER)}>
        <div className="min-w-0 flex-1">
          <ProjectTitle
            size="compact"
            projectId={project.id}
            initialName={project.name}
            onRenameSuccess={slot?.onProjectRenamed}
          />
        </div>
        {(slot || pausedChip) && (
          <div data-testid="editor-top-bar-inline" className="ml-auto mr-4 hidden shrink-0 items-center gap-2.5 md:flex">
            {pausedChip}
            {slot && <SaveState slot={slot} />}
            {slot && <StatusChip slot={slot} />}
          </div>
        )}
        {hasTotal && slot && (
          <span
            data-testid="editor-top-bar-total"
            className="shrink-0 text-[17px] font-bold leading-tight tracking-tight tabular-nums md:text-xl"
          >
            {formatCurrency(slot.total as number, slot.currencyCode)}
          </span>
        )}
      </div>

      {/* Row C: client and number, total label */}
      {(subtitle || hasTotal) && (
        <div className={cn('mt-0.5 flex justify-between gap-3 pb-2', GUTTER)}>
          <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">{subtitle}</p>
          {hasTotal && (
            <span className="whitespace-nowrap text-[10.5px] font-medium uppercase leading-[1.6] tracking-[0.06em] text-muted-foreground">
              {t('Total')}
            </span>
          )}
        </div>
      )}

      {sentNotice && <SentNotice />}
      {slot?.isLocked && <LockBanner slot={slot} />}
    </header>
  )
}
