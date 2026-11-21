'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Receipt, ExternalLink, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { voidInvoice } from '@/lib/actions/invoice-void'
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
  change_order: 'Change order',
}

const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  draft: 'Draft',
  open: 'Open',
  paid: 'Paid',
  void: 'Void',
  uncollectible: 'Uncollectible',
}

type VoidResult = { error: string } | { success: true }

/**
 * "Void" button + confirmation for one open invoice. Shared by the estimate
 * editor's panel and the change order invoice row. `onVoid` defaults to the real
 * server action so callers (and tests) can inject a fake.
 */
export function VoidInvoiceButton({
  invoiceId,
  onVoid = voidInvoice,
}: {
  invoiceId: string
  onVoid?: (invoiceId: string) => Promise<VoidResult>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      const result = await onVoid(invoiceId)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(t('Invoice voided'))
      setOpen(false)
      router.refresh()
    } catch {
      toast.error(t('Could not void the invoice. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="void-invoice"
        className="inline-flex items-center text-xs font-medium text-destructive hover:underline"
      >
        {t('Void')}
      </button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Void this invoice?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your client will no longer be able to pay it. This cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid="void-invoice-confirm"
              onClick={(e) => {
                e.preventDefault()
                void confirm()
              }}
            >
              {t('Void invoice')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
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
            const isVoid = inv.status === 'void'
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
                    {inv.kind === 'change_order' && inv.change_order_number != null
                      ? `${t('Change order')} #${inv.change_order_number}`
                      : t(KIND_LABELS[inv.kind])}
                    {' · '}
                    <span
                      className={
                        isPaid
                          ? 'font-medium text-[hsl(var(--success))]'
                          : isVoid
                            ? 'text-muted-foreground line-through'
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
                  {inv.status === 'open' && <VoidInvoiceButton invoiceId={inv.id} />}
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
