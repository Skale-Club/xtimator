'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Receipt } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
import { cn } from '@/lib/utils'
import type { ChangeOrderActions } from './change-order-actions'

const PRIMARY_STYLE = {
  backgroundImage: 'linear-gradient(135deg, hsl(219 92% 65%), hsl(228 84% 54%))',
} as const

export interface ChangeOrderInvoiceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  changeOrderId: string
  number: number
  /** Positive total of the approved change order. */
  total: number
  currencyCode: string
  invoiceChangeOrder: ChangeOrderActions['invoiceChangeOrder']
  /** Called after the invoice was created (the editor refreshes). */
  onSent: () => void
}

/**
 * Confirm surface for invoicing an approved change order on its own: a bottom
 * sheet on phones, a centred dialog from sm up (same shell as the share sheet).
 * Sending creates a Stripe invoice and emails it to the client.
 */
export function ChangeOrderInvoiceSheet({
  open,
  onOpenChange,
  changeOrderId,
  number,
  total,
  currencyCode,
  invoiceChangeOrder,
  onSent,
}: ChangeOrderInvoiceSheetProps) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)

  async function handleSend() {
    setPending(true)
    try {
      const result = await invoiceChangeOrder(changeOrderId)
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('Invoice sent'))
      onOpenChange(false)
      onSent()
    } catch {
      toast.error(t('Could not send the invoice. Try again.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent
        showCloseButton={false}
        data-testid="change-order-invoice-sheet"
        className={cn(
          'nx-surface flex flex-col gap-0 overflow-hidden border-border bg-background p-0 backdrop-blur-none',
          'top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[28px] rounded-b-none pb-[env(safe-area-inset-bottom)]',
          'sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:max-h-[85dvh] sm:max-w-[440px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-[28px] sm:pb-0',
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border sm:hidden" />
        <DialogHeader className="shrink-0 px-5 pt-3 pb-1 text-left sm:px-6 sm:pt-5">
          <DialogTitle className="inline-flex items-center gap-2 text-[19px] leading-tight font-semibold tracking-tight">
            <Receipt className="size-5 text-primary" aria-hidden />
            {t('Invoice')}
          </DialogTitle>
          <DialogDescription className="text-[13.5px]">
            {t('The client gets a Stripe invoice by email, due in 7 days.')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 pt-3 pb-5 sm:px-6 sm:pb-6">
          <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-border bg-muted px-4 py-3.5">
            <span className="min-w-0 text-sm text-muted-foreground">
              {t('Invoice for change order #{number}').replace('{number}', String(number))}
            </span>
            <span data-testid="change-order-invoice-amount" className="shrink-0 text-xl font-semibold tabular-nums">
              {formatCurrency(total, currencyCode)}
            </span>
          </div>
          <Button
            onClick={() => void handleSend()}
            disabled={pending}
            data-testid="change-order-invoice-send"
            style={PRIMARY_STYLE}
            className="h-[50px] w-full gap-2 rounded-full px-5 text-[15px] font-semibold text-white shadow-none hover:text-white"
          >
            {pending ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <Receipt className="size-[18px]" aria-hidden />}
            {t('Send invoice')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
