'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Download,
  Eye,
  Flame,
  Inbox,
  PenLine,
  Printer,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useRelativeLabel } from '@/components/projects/estimate-list-status'
import { cn } from '@/lib/utils'
import type { ClientActivityKind, ClientActivityRow } from '@/lib/queries/client-activity'

/** Rows shown inline: the phone shows PHONE_ROWS, from sm up DESKTOP_ROWS. */
export const CLIENT_ACTIVITY_PHONE_ROWS = 4
export const CLIENT_ACTIVITY_DESKTOP_ROWS = 8

const SENTENCE: Record<ClientActivityKind, string> = {
  opened: '{who} opened {project}',
  pdf_download: '{who} downloaded the PDF of {project}',
  sign_start: '{who} started signing {project}',
  print: '{who} printed {project}',
  accepted: '{who} accepted {project}',
  declined: '{who} declined {project}',
}

/** Folded repeat opens ("opened 4 times"); {n} is filled after translation. */
const OPENED_MANY = '{who} opened {project} {n} times'

const ICON: Record<ClientActivityKind, { Icon: LucideIcon; tone: string }> = {
  opened: { Icon: Eye, tone: 'bg-primary/10 text-primary' },
  pdf_download: { Icon: Download, tone: 'bg-primary/10 text-primary' },
  sign_start: { Icon: PenLine, tone: 'bg-amber-500/15 text-amber-500' },
  print: { Icon: Printer, tone: 'bg-primary/10 text-primary' },
  accepted: { Icon: CheckCircle2, tone: 'bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]' },
  declined: { Icon: XCircle, tone: 'bg-[hsl(var(--destructive-text)/0.12)] text-[hsl(var(--destructive-text))]' },
}

export function clientActivityHref(projectId: string): string {
  return `/projects/${projectId}?analytics=1`
}

/** Renders the translated sentence with the client and project names in bold. */
function Sentence({ template, who, project, n }: { template: string; who: string; project: string; n?: number }) {
  const parts = template.replace('{n}', String(n ?? '')).split(/(\{who\}|\{project\})/g)
  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (part === '{who}') return <strong key={i} className="font-semibold">{who}</strong>
        if (part === '{project}') return <strong key={i} className="font-semibold">{project}</strong>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function ActivityRow({ row, className }: { row: ClientActivityRow; className?: string }) {
  const { t } = useTranslation()
  const relative = useRelativeLabel()
  const { Icon, tone } = ICON[row.kind]
  const device = row.device === 'mobile' ? t('phone') : row.device === 'desktop' ? t('computer') : ''
  return (
    <li className={className}>
      <Link
        href={clientActivityHref(row.projectId)}
        data-testid="client-activity-row"
        className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', tone)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm leading-snug [overflow-wrap:anywhere]">
            <Sentence
              template={row.kind === 'opened' && row.count > 1 ? t(OPENED_MANY) : t(SENTENCE[row.kind])}
              who={row.clientName ?? t('A client')}
              project={row.projectName}
              n={row.count}
            />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground" suppressHydrationWarning>
            {[relative(row.at), device].filter(Boolean).join(' · ')}
          </span>
        </span>
        {row.hot && (
          <span
            title={t('Hot')}
            data-testid="client-activity-hot"
            className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-full bg-orange-500/15 px-2 text-xs font-semibold text-orange-500"
          >
            <Flame className="size-3.5" aria-hidden />
            {t('Hot')}
          </span>
        )}
      </Link>
    </li>
  )
}

export function ClientActivityCard({ rows }: { rows: ClientActivityRow[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // The "See all" button shows once the inline list is cut: from 5 rows on a
  // phone, from 9 rows on a wider screen.
  const hiddenOnPhone = rows.length > CLIENT_ACTIVITY_PHONE_ROWS
  const hiddenOnDesktop = rows.length > CLIENT_ACTIVITY_DESKTOP_ROWS

  return (
    <div data-testid="client-activity-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{t('Client activity')}</h2>
        {hiddenOnPhone && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              'inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10',
              !hiddenOnDesktop && 'sm:hidden',
            )}
          >
            {t('See all')}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
          <Inbox className="size-6 text-muted-foreground" aria-hidden />
          <p className="max-w-[260px] text-sm text-muted-foreground">
            {t("When a client opens an estimate, you'll see it here.")}
          </p>
        </div>
      ) : (
        <ul className="mt-3 -mx-2 flex flex-col">
          {rows.slice(0, CLIENT_ACTIVITY_DESKTOP_ROWS).map((row, i) => (
            <ActivityRow key={row.id} row={row} className={i >= CLIENT_ACTIVITY_PHONE_ROWS ? 'hidden sm:block' : undefined} />
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[520px]" data-testid="client-activity-sheet">
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 flex-row items-start justify-between gap-4 pb-3 pl-6 pr-4 pt-2 text-left touch-none sm:pl-7 sm:pr-5 sm:pt-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">
                {t('Client activity')}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t('What clients did with your estimates lately.')}
              </DialogDescription>
            </div>
            <BottomSheetCloseButton label={t('Close')} />
          </DialogHeader>
          <ul className="flex flex-col overflow-y-auto px-4 pb-6 sm:px-5 sm:pb-7">
            {rows.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ul>
        </BottomSheetContent>
      </Dialog>
    </div>
  )
}
