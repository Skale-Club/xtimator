'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ContractChangeOrderRow, ContractSummary } from '@/lib/change-orders/types'
import { changeOrderHref, realChangeOrderActions, type ChangeOrderActions } from './change-order-actions'
import { amountTone, formatSigned, shortDate } from './change-order-utils'

export interface CreateChangeOrderControl {
  create: () => void
  creating: boolean
}

/**
 * "New change order": creates the next draft and opens it. The spinner stays on
 * after success because the page is navigating away. Shared by the card's button
 * and the estimate editor's docked primary button so both show one busy state.
 */
export function useCreateChangeOrder(
  estimateId: string,
  projectId: string,
  actions: Pick<ChangeOrderActions, 'createChangeOrder'> = realChangeOrderActions,
): CreateChangeOrderControl {
  const router = useRouter()
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)

  const create = useCallback(() => {
    if (creating) return
    setCreating(true)
    void actions
      .createChangeOrder(estimateId)
      .then((result) => {
        if (result.error || !result.data) {
          toast.error(t('Could not create the change order. Try again.'))
          setCreating(false)
          return
        }
        router.push(changeOrderHref(projectId, result.data.id))
      })
      .catch(() => {
        toast.error(t('Could not create the change order. Try again.'))
        setCreating(false)
      })
  }, [actions, creating, estimateId, projectId, router, t])

  return { create, creating }
}

export interface ContractCardProps {
  estimateId: string
  projectId: string
  /** Changing it reloads the summary (e.g. after a save or a refresh). */
  refreshKey?: string | number
  /** Lets the parent own the "New change order" busy state. */
  createControl?: CreateChangeOrderControl
  actions?: Pick<ChangeOrderActions, 'createChangeOrder' | 'getContractSummary'>
}

function rowStatusLine(row: ContractChangeOrderRow, t: (s: string) => string): string {
  if (row.status === 'accepted') {
    const d = shortDate(row.responded_at)
    return d ? `${t('Approved')} · ${d}` : t('Approved')
  }
  if (row.status === 'declined') {
    const d = shortDate(row.responded_at)
    return d ? `${t('Declined')} · ${d}` : t('Declined')
  }
  if (row.status === 'sent') {
    return row.view_count > 0 ? `${t('Sent')} · ${t('viewed')} ${row.view_count}×` : t('Sent')
  }
  return t('Draft')
}

function joinNumbers(numbers: number[], t: (s: string) => string): string {
  const parts = numbers.map((n) => `#${n}`)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} ${t('and')} ${parts[parts.length - 1]}`
}

/**
 * The accepted estimate is the contract; every change order adds to or removes
 * from it. Sits above the paper in the estimate editor once the estimate is
 * accepted: the contract at a glance, plus the way to start a new change order.
 */
export function ContractCard({
  estimateId,
  projectId,
  refreshKey,
  createControl,
  actions = realChangeOrderActions,
}: ContractCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const own = useCreateChangeOrder(estimateId, projectId, actions)
  const { create, creating } = createControl ?? own

  const [summary, setSummary] = useState<ContractSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    void actions
      .getContractSummary(estimateId)
      .then((result) => {
        if (cancelled) return
        if (result.error) {
          setState('error')
          return
        }
        setSummary(result.data ?? null)
        setState('ready')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
    // `actions` is deliberately not a dependency: an inline object from a parent
    // would reload the summary on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId, refreshKey])

  if (state === 'loading') {
    return (
      <div
        data-testid="contract-card-loading"
        aria-hidden
        className="h-28 animate-pulse rounded-2xl border border-border bg-card"
      />
    )
  }
  if (state === 'error') {
    return (
      <div
        data-testid="contract-card-error"
        className="rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground"
      >
        {t('Could not load the contract.')}
      </div>
    )
  }
  // Not accepted (or nothing to show): no card.
  if (!summary) return null

  const currency = summary.currencyCode
  const pending = summary.changeOrders.filter((r) => r.status === 'sent')
  const accepted = shortDate(summary.acceptedAt)
  const baseMeta = [summary.estimateNumber, accepted ? `${summary.signedOnline ? t('signed') : t('accepted')} ${accepted}` : '']
    .filter(Boolean)
    .join(' · ')

  let note: string | null = null
  if (pending.length > 0) {
    const template =
      pending.length === 1
        ? t('If {numbers} is approved, the contract becomes {amount}.')
        : t('If {numbers} are approved, the contract becomes {amount}.')
    note = template
      .replace('{numbers}', joinNumbers(pending.map((r) => r.number), t))
      .replace('{amount}', formatCurrency(summary.contractTotal + summary.pendingTotal, currency))
  } else if (summary.changeOrders.length === 0) {
    note = t('No change orders yet. Change something in the work? Create a change order and the client approves it separately.')
  }

  return (
    <section
      data-testid="contract-card"
      aria-label={t('Contract')}
      className="rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('Contract')}</h2>
        <Button
          type="button"
          size="sm"
          onClick={create}
          disabled={creating}
          data-testid="contract-card-new"
          className="h-10 gap-1.5 rounded-full px-4 text-[13.5px] font-semibold"
        >
          {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {t('New change order')}
        </Button>
      </div>

      <ul className="mt-2 divide-y divide-border">
        <li className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[14.5px] font-medium">{t('Accepted estimate')}</p>
            {baseMeta && <p className="truncate text-[12.5px] text-muted-foreground">{baseMeta}</p>}
          </div>
          <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">{formatCurrency(summary.baseTotal, currency)}</span>
        </li>

        {summary.changeOrders.map((row) => {
          const isApproved = row.status === 'accepted'
          return (
            <li key={row.id}>
              <button
                type="button"
                data-testid={`contract-row-${row.number}`}
                onClick={() => router.push(changeOrderHref(projectId, row.id))}
                className={cn(
                  '-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted',
                  !isApproved && 'text-muted-foreground',
                )}
              >
                <span className="min-w-0">
                  <span className={cn('block text-[14.5px] font-medium', isApproved && 'text-foreground')}>
                    {t('Change order')} #{row.number} · {row.title || t('Untitled')}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">{rowStatusLine(row, t)}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[14.5px] font-semibold tabular-nums',
                    isApproved ? amountTone(row.total) : 'text-muted-foreground',
                  )}
                >
                  {formatSigned(row.total, currency)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-[14.5px] font-semibold">{t('Contract total')}</span>
        <span data-testid="contract-total" className="text-lg font-bold tabular-nums">
          {formatCurrency(summary.contractTotal, currency)}
        </span>
      </div>
      {note && (
        <p data-testid="contract-note" className="mt-2 text-[12.5px] text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  )
}
