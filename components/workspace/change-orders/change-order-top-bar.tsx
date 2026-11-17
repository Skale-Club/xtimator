'use client'

import Link from 'next/link'
import { AlertCircle, ChevronLeft, Lock, XCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ChangeOrderStatus } from '@/lib/change-orders/types'
import { amountTone, formatSigned, shortDate, STATUS_TONE } from './change-order-utils'

/** Same horizontal padding as the editor frame's top bar and content column. */
export const CO_GUTTER = 'px-3 sm:px-5 md:px-6'

export type CoSaveStatus = 'idle' | 'saving' | 'error'

function SaveState({ status, onRetry }: { status: CoSaveStatus; onRetry?: () => void }) {
  const { t } = useTranslation()
  if (status === 'idle') return null
  return (
    <span aria-live="polite" className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] font-medium">
      {status === 'saving' ? (
        <span className="text-muted-foreground">{t('Saving…')}</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 text-[hsl(var(--destructive-text))]">
            <AlertCircle className="size-[15px]" aria-hidden />
            {t('Not saved')}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="relative h-7 rounded-full bg-[hsl(var(--destructive-text)/0.12)] px-2.5 font-semibold text-[hsl(var(--destructive-text))] after:absolute after:-inset-1.5 after:content-['']"
            >
              {t('Try again')}
            </button>
          )}
        </>
      )}
    </span>
  )
}

export interface ChangeOrderChipProps {
  status: ChangeOrderStatus
  viewCount: number
  respondedAt: string | null
  onClick?: () => void
}

/** Drafts show no chip at all. */
export function ChangeOrderStatusChip({ status, viewCount, respondedAt, onClick }: ChangeOrderChipProps) {
  const { t } = useTranslation()
  if (status === 'draft') return null
  const date = shortDate(respondedAt)
  let label: string
  if (status === 'accepted') label = date ? `${t('Approved')} · ${date}` : t('Approved')
  else if (status === 'declined') label = date ? `${t('Declined')} · ${date}` : t('Declined')
  else label = viewCount > 0 ? `${t('Sent')} · ${t('viewed')} ${viewCount}×` : t('Sent')

  const tone = STATUS_TONE[status]
  const className = cn(
    'relative inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium',
    tone.pill,
  )
  const content = (
    <>
      <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', tone.dot)} />
      {label}
    </>
  )
  if (!onClick) return <span className={className}>{content}</span>
  return (
    <button
      type="button"
      data-testid="change-order-status-chip"
      onClick={onClick}
      aria-label={`${t('Change order status')}: ${label}`}
      className={cn(className, "after:absolute after:-inset-2 after:content-['']")}
    >
      {content}
    </button>
  )
}

const BANNER_BUTTON =
  'min-h-10 shrink-0 whitespace-nowrap rounded-full bg-background px-3.5 text-[13px] font-semibold text-primary disabled:opacity-50'

export interface ChangeOrderTopBarProps {
  projectId: string
  projectName: string
  /** "SK-1045-CO2" or null when the estimate number is unknown. */
  documentNumber: string | null
  number: number
  total: number
  currencyCode: string
  status: ChangeOrderStatus
  viewCount: number
  respondedAt: string | null
  saveStatus: CoSaveStatus
  onRetrySave?: () => void
  onOpenStatus: () => void
  /** Who signed and when, when the client approved online. */
  signature: { name: string; at: string } | null
  onReopen?: () => void
  reopening?: boolean
}

/**
 * Change order editor top bar. Same look and gutters as the estimate editor's
 * v2 bar: row A back link + save state + status chip, row B title + signed
 * amount, row C project and number. The "Contract" link stays visible on
 * desktop too because the global breadcrumb does not know change orders.
 */
export function ChangeOrderTopBar({
  projectId,
  projectName,
  documentNumber,
  number,
  total,
  currencyCode,
  status,
  viewCount,
  respondedAt,
  saveStatus,
  onRetrySave,
  onOpenStatus,
  signature,
  onReopen,
  reopening,
}: ChangeOrderTopBarProps) {
  const { t } = useTranslation()
  const subtitle = [projectName, documentNumber].filter(Boolean).join(' · ')
  const accepted = status === 'accepted'
  const declined = status === 'declined'

  const signedLine = signature
    ? `${t('Signed by')} ${signature.name}${shortDate(signature.at) ? ` · ${shortDate(signature.at)}` : ''}`
    : null

  return (
    <header
      data-testid="change-order-top-bar"
      className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] md:pt-0"
    >
      {/* Row A: back to the contract, save state, status chip */}
      <div className={cn('flex min-h-[34px] items-center justify-between', CO_GUTTER)}>
        <Link
          href={`/projects/${projectId}`}
          aria-label={t('Back to contract')}
          className="-ml-[5px] inline-flex min-h-[34px] items-center pr-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft size={18} aria-hidden />
          {t('Contract')}
        </Link>
        <div className="flex items-center gap-2">
          <SaveState status={saveStatus} onRetry={onRetrySave} />
          <ChangeOrderStatusChip status={status} viewCount={viewCount} respondedAt={respondedAt} onClick={onOpenStatus} />
        </div>
      </div>

      {/* Row B: title and signed amount */}
      <div className={cn('flex items-center justify-between gap-3 pb-0.5 pt-1 md:py-1.5', CO_GUTTER)}>
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold leading-tight tracking-tight md:text-xl">
          {t('Change order')} #{number}
        </h1>
        <span
          data-testid="change-order-top-bar-total"
          className={cn('shrink-0 text-[17px] font-bold leading-tight tracking-tight tabular-nums md:text-xl', amountTone(total))}
        >
          {formatSigned(total, currencyCode)}
        </span>
      </div>

      {/* Row C: project and number, label */}
      <div className={cn('mt-0.5 flex justify-between gap-3 pb-2', CO_GUTTER)}>
        <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">{subtitle}</p>
        <span className="whitespace-nowrap text-[10.5px] font-medium uppercase leading-[1.6] tracking-[0.06em] text-muted-foreground">
          {t('Change order')}
        </span>
      </div>

      {(accepted || declined) && (
        <div
          data-testid="change-order-lock-banner"
          className={cn(
            'flex items-center gap-2.5 py-2.5 text-[13px] text-muted-foreground',
            CO_GUTTER,
            accepted ? 'bg-[hsl(var(--success)/0.15)]' : 'bg-[hsl(var(--destructive-text)/0.12)]',
          )}
        >
          {accepted ? <Lock className="size-4 shrink-0" aria-hidden /> : <XCircle className="size-4 shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-foreground">{accepted ? t('Approved.') : t('Declined.')}</b>{' '}
            {accepted ? t('It’s part of the contract and can’t be edited.') : t('Revise it and reopen it so the client can answer again.')}
            {accepted && signedLine ? ` ${signedLine}.` : ''}
          </span>
          {declined && onReopen && (
            <button type="button" onClick={onReopen} disabled={reopening} className={BANNER_BUTTON}>
              {t('Revise and reopen')}
            </button>
          )}
        </div>
      )}
    </header>
  )
}
