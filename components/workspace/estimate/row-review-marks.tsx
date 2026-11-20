'use client'

// Review marks on an estimate row (notices review, stage 1, 2026-11-20). OWNER'S
// EDITOR ONLY: these are rendered by the editable rows (desktop table, phone
// list, page view in edit mode), never by the public page, the PDFs or any
// read-only render. One mark per problem, resolved in one tap, silence when the
// line is fine:
//
//   - a line with no price: an amber bar on the row + a dashed "+ Add price"
//     slot where the price goes (tap focuses the price field);
//   - a price the AI was unsure about: a small sparkle before the price that
//     opens "Suggested by the AI. Check it before sending." with Confirm / Adjust.
//
// Copy never explains HOW the AI priced the line (business rule): the mark only
// says "suggested by the AI, check it".

import { useRef, useState, type SyntheticEvent } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetContent } from '@/components/ui/bottom-sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

/** The 3px amber bar on the left edge of a row. Put it in a `relative` cell. */
export function RowReviewBar() {
  return (
    <span
      aria-hidden="true"
      data-testid="row-review-bar"
      className="pointer-events-none absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-amber-500"
    />
  )
}

/** The dashed amber "+ Add price" slot that stands where the price would be. */
export function UnpricedSlot({
  onClick,
  compact = false,
  asText = false,
  className,
}: {
  onClick?: () => void
  /** Phone list: the shorter "+ Price". */
  compact?: boolean
  /** Inside another button (the phone row): a look-alike span, the row's own tap applies. */
  asText?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const label = compact ? `+ ${t('Price')}` : `+ ${t('Add price')}`
  const cls = cn(
    'inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-amber-500 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    className,
  )
  if (asText) {
    return (
      <span data-testid="row-price-slot" className={cls}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      data-testid="row-price-slot"
      aria-label={t('Add price')}
      onClick={onClick}
      className={cn(cls, 'cursor-pointer hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-amber-500/20')}
    >
      {label}
    </button>
  )
}

/**
 * The sparkle before an AI price that still needs a look. `variant` picks the
 * surface: a popover anchored to the icon on desktop, a short bottom drawer on
 * phones (the caller knows which layout it is in: the phone list and the table
 * are different elements switched by CSS).
 */
export function AiPriceMark({
  description,
  price,
  currencyCode,
  variant,
  onConfirm,
  onAdjust,
  className,
}: {
  description: string
  price: number
  currencyCode: string
  variant: 'popover' | 'sheet'
  onConfirm: () => void
  onAdjust: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const adjustRef = useRef(false)
  const amount = formatMoney(price, currencyCode)

  const trigger = (
    <button
      type="button"
      data-testid="row-ai-price-mark"
      aria-label={t('Suggested by the AI. Check it before sending.')}
      onClick={variant === 'sheet' ? () => setOpen(true) : undefined}
      className={cn(
        'inline-flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25',
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden="true" />
    </button>
  )

  function confirm() {
    setOpen(false)
    onConfirm()
  }
  function adjust() {
    adjustRef.current = true
    setOpen(false)
  }
  // Radix hands focus back to the trigger on close; "Adjust" wants the price
  // field instead, so it takes over that moment.
  function onCloseAutoFocus(e: Event) {
    if (!adjustRef.current) return
    adjustRef.current = false
    e.preventDefault()
    onAdjust()
  }

  if (variant === 'sheet') {
    // React events bubble through the portal to the row, whose own tap opens
    // the item editor and whose pointer handlers start a drag: keep them here.
    const stop = (e: SyntheticEvent) => e.stopPropagation()
    return (
      <span
        className="contents"
        onClick={stop}
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
      >
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <BottomSheetContent
            data-testid="row-ai-price-sheet"
            desktopClassName="sm:max-w-[400px]"
            onCloseAutoFocus={onCloseAutoFocus}
          >
            <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
              <DialogTitle className="text-base font-semibold leading-snug">
                {description.trim()} · {amount}
              </DialogTitle>
              <DialogDescription className="text-sm text-foreground">
                <strong className="font-semibold">{t('Suggested by the AI.')}</strong>{' '}
                {t('Check it before sending.')}
              </DialogDescription>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="row-ai-price-confirm"
                  onClick={confirm}
                  className="flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-sm font-semibold text-background"
                >
                  <Check className="size-4" aria-hidden="true" />
                  {t('Confirm')} {amount}
                </button>
                <button
                  type="button"
                  data-testid="row-ai-price-adjust"
                  onClick={adjust}
                  className="flex h-11 w-full items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground hover:bg-muted/80"
                >
                  {t('Adjust price')}
                </button>
              </div>
            </div>
          </BottomSheetContent>
        </Dialog>
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-3"
        data-testid="row-ai-price-popover"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <p className="text-sm leading-snug">
          <strong className="font-semibold">{t('Suggested by the AI.')}</strong>{' '}
          {t('Check it before sending.')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            data-testid="row-ai-price-confirm"
            onClick={confirm}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-foreground px-3 text-xs font-semibold text-background"
          >
            <Check className="size-3.5" aria-hidden="true" />
            {t('Confirm')} {amount}
          </button>
          <button
            type="button"
            data-testid="row-ai-price-adjust"
            onClick={adjust}
            className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-semibold text-foreground hover:bg-muted/80"
          >
            {t('Adjust')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
