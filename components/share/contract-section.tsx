'use client'

import { ChevronRight } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatCurrency } from '@/lib/utils/format'
import type { ChangeOrderStatus, ContractSummary } from '@/lib/change-orders/types'

interface ContractSectionProps {
  contract: ContractSummary
  /** change order id -> public path (/change-order/<token>), resolved server-side. */
  links: Record<string, string>
}

const MINUS = '−'

function signedMoney(value: number, currency: string): string {
  return value < 0 ? `${MINUS}${formatCurrency(Math.abs(value), currency)}` : formatCurrency(value, currency)
}

const CHIP: Record<Exclude<ChangeOrderStatus, 'draft'>, { label: string; className: string }> = {
  sent: { label: 'Sent', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  accepted: { label: 'Approved', className: 'bg-green-50 text-green-800 border-green-200' },
  declined: { label: 'Declined', className: 'bg-red-50 text-red-700 border-red-200' },
}

/**
 * "Change orders" block of the accepted estimate's public page: one row per
 * change order (status, amount, link to its own page), then the contract total
 * (accepted estimate + approved change orders). Renders nothing without rows.
 */
export function ContractSection({ contract, links }: ContractSectionProps) {
  const { t } = useTranslation()
  // The public page never receives drafts; guard anyway so a draft can't leak.
  const rows = contract.changeOrders.filter((row) => row.status !== 'draft')
  if (rows.length === 0) return null

  const currency = contract.currencyCode || 'USD'
  const awaiting = rows.filter((row) => row.status === 'sent').length

  return (
    <section
      data-testid="contract-section"
      className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-6"
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t('Change orders')}
      </h2>

      <ul className="mt-3 divide-y divide-border">
        {rows.map((row) => {
          const chip = CHIP[row.status as Exclude<ChangeOrderStatus, 'draft'>]
          const href = links[row.id]
          const label = t('Change order #{n}').replace('{n}', String(row.number))
          const body = (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{row.title || label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{label}</span>
                  <span
                    data-testid="co-status"
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${chip.className}`}
                  >
                    {t(chip.label)}
                  </span>
                </div>
              </div>
              <p
                data-testid="co-amount"
                className={`shrink-0 text-sm font-medium tabular-nums ${row.total < 0 ? 'text-red-600' : 'text-foreground'}`}
              >
                {signedMoney(row.total, currency)}
              </p>
              {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          )
          return (
            <li key={row.id}>
              {href ? (
                <a
                  href={href}
                  data-testid="co-row"
                  className="flex min-h-12 items-center gap-3 py-3 hover:bg-muted/40"
                >
                  {body}
                </a>
              ) : (
                <div data-testid="co-row" className="flex min-h-12 items-center gap-3 py-3">
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-4 border-t-2 border-foreground/80 pt-3">
        <p className="text-base font-semibold">{t('Contract total')}</p>
        <p data-testid="contract-total" className="text-base font-semibold tabular-nums">
          {formatCurrency(contract.contractTotal, currency)}
        </p>
      </div>
      {awaiting > 0 && (
        <p data-testid="contract-awaiting" className="mt-1 text-right text-sm text-amber-800">
          {t('Awaiting your approval: {n}').replace('{n}', String(awaiting))}
        </p>
      )}
    </section>
  )
}
