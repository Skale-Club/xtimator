'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Receipt } from 'lucide-react'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format'
import { useTranslation } from '@/lib/i18n/use-translation'
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
      <BottomSheetContent data-testid="change-order-invoice-sheet" className="nx-surface" desktopClassName="sm:max-w-[440px]">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-start justify-between gap-3 pl-5 pr-3 pt-1 pb-1 text-left sm:pl-6 sm:pr-4 sm:pt-5"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="inline-flex items-center gap-2 text-[19px] leading-tight font-semibold tracking-tight">
              <Receipt className="size-5 text-primary" aria-hidden />
              {t('Invoice')}
            </DialogTitle>
            <DialogDescription className="text-[13.5px]">
              {t('The client gets a Stripe invoice by email, due in 7 days.')}
            </DialogDescription>
          </div>
          {/* Disabled while sending: the sheet refuses to close then anyway. */}
          <BottomSheetCloseButton label={t('Close')} disabled={pending} />
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-3 pb-5 sm:px-6 sm:pb-6">
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
      </BottomSheetContent>
    </Dialog>
  )
}
