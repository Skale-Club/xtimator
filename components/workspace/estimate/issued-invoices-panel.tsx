'use client'

import { Receipt, ExternalLink, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatMinorUnits } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { InvoiceRow } from '@/lib/queries/invoice'

interface IssuedInvoicesPanelProps {
  invoices: InvoiceRow[]
}

const KIND_LABELS: Record<InvoiceRow['kind'], string> = {
  full: 'Full',
  deposit: 'Deposit',
  balance: 'Balance',
}

const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  uncollectible: 'Uncollectible',
}

/**
 * Phase 94 (D-19 / INVOICE-06) — inline issued-invoice display in the editor.
 *
 * Surfaces every issued invoice as "Invoice issued: $X · {kind} · {status}" so
 * that editing the estimate after issuing is never confusing. The amount is the
 * frozen snapshot (`amount_cents`) read back from the server (D-07) — NOT the
 * live editor total.
 */
export function IssuedInvoicesPanel({ invoices }: IssuedInvoicesPanelProps) {
  const { t } = useTranslation()

  if (invoices.length === 0) return null

  return (
    <Card variant="glass">
      <CardContent className="space-y-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="h-4 w-4 text-primary" />
          {t('Issued invoices')}
        </div>

        <ul className="space-y-2">
          {invoices.map((inv) => {
            const isPaid = inv.status === 'paid'
            return (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-background/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {t('Invoice issued')}: {formatMinorUnits(inv.amount_cents, inv.currency_code)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(KIND_LABELS[inv.kind])}
                    {' · '}
                    <span
                      className={
                        isPaid
                          ? 'font-medium text-[hsl(var(--success))]'
                          : 'text-muted-foreground'
                      }
                    >
                      {t(STATUS_LABELS[inv.status])}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('View invoice')}
                    </a>
                  )}
                  {inv.invoice_pdf_url && (
                    <a
                      href={inv.invoice_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t('PDF')}
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
