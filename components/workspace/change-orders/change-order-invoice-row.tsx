'use client'

import { ExternalLink, Receipt } from 'lucide-react'
import { formatMinorUnits } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ChangeOrderInvoice } from '@/lib/change-orders/types'

/**
 * Compact row for the change order's own invoice in the owner editor. Same
 * visual family as the issued invoices panel of the estimate editor.
 */
export function ChangeOrderInvoiceRow({ invoice }: { invoice: ChangeOrderInvoice }) {
  const { t } = useTranslation()
  const paid = invoice.status === 'paid'
  return (
    <div
      data-testid="change-order-invoice-row"
      className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Receipt className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 text-sm font-medium text-foreground">
          {t('Invoice')}: {formatMinorUnits(invoice.amount_cents, invoice.currency_code)}
          {' · '}
          <span className={cn('text-xs', paid ? 'font-medium text-[hsl(var(--success))]' : 'text-muted-foreground')}>
            {paid ? t('Paid') : t('Open')}
          </span>
        </p>
      </div>
      {invoice.hosted_invoice_url && (
        <a
          href={invoice.hosted_invoice_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('View invoice')}
        </a>
      )}
    </div>
  )
}
