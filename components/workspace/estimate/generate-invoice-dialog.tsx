'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { generateInvoice } from '@/lib/actions/invoice'
import { formatMinorUnits } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

type InvoiceKind = 'full' | 'deposit' | 'balance'

const PRESET_PERCENTS = [10, 20, 30, 50] as const

interface GenerateInvoiceDialogProps {
  estimateId: string
  currencyCode: string
  /** Live editor total in minor units — preview only (the issued snapshot is computed server-side, D-07). */
  estimateTotalCents: number
  onIssued?: () => void
}

/**
 * Phase 94 (D-18 / D-16) — the owner-facing "Generate invoice" surface in the
 * estimate editor. Lets the owner issue a Full / Deposit / Balance invoice from
 * the current estimate, with preset-% chips + a free numeric input for the
 * deposit/balance split. Calls the `generateInvoice` server action (Plan 02).
 *
 * The live preview is approximate (it mirrors splitDepositBalance for display
 * only); the action computes the exact cents snapshot server-side.
 */
export function GenerateInvoiceDialog({
  estimateId,
  currencyCode,
  estimateTotalCents,
  onIssued,
}: GenerateInvoiceDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<InvoiceKind>('full')
  const [pct, setPct] = useState(30)
  const [pending, setPending] = useState(false)

  // Clamp the percent to the 1–99 range the action accepts.
  const safePct = Math.min(99, Math.max(1, Math.round(pct) || 1))

  const depositCents = Math.round((estimateTotalCents * safePct) / 100)
  const previewCents =
    kind === 'full'
      ? estimateTotalCents
      : kind === 'deposit'
        ? depositCents
        : estimateTotalCents - depositCents

  async function handleIssue() {
    setPending(true)
    const opts =
      kind === 'full'
        ? ({ kind: 'full' } as const)
        : ({ kind, depositPct: safePct } as const)

    const result = await generateInvoice(estimateId, opts)
    setPending(false)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    toast.success(t('Invoice issued'))
    // Pitfall 5 — close the dialog first, then refresh so the issued-invoice
    // panel re-renders from the server-fetched snapshot.
    setOpen(false)
    router.refresh()
    onIssued?.()
  }

  const segments: { value: InvoiceKind; label: string }[] = [
    { value: 'full', label: t('Full') },
    { value: 'deposit', label: t('Deposit') },
    { value: 'balance', label: t('Balance') },
  ]

  const showPercent = kind === 'deposit' || kind === 'balance'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" className="rounded-full gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          {t('Generate invoice')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            {t('Generate invoice')}
          </DialogTitle>
          <DialogDescription>
            {t('Issue a real invoice for this estimate. The amount is frozen at the moment you issue it.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Segmented control: Full | Deposit | Balance */}
          <div
            role="group"
            aria-label={t('Invoice type')}
            className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-border bg-muted/40 p-1"
          >
            {segments.map((seg) => (
              <button
                key={seg.value}
                type="button"
                onClick={() => setKind(seg.value)}
                aria-pressed={kind === seg.value}
                className={[
                  'min-h-[40px] rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                  kind === seg.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {seg.label}
              </button>
            ))}
          </div>

          {/* Percent picker (deposit / balance only) */}
          {showPercent && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {kind === 'deposit' ? t('Deposit percentage') : t('Balance after deposit of')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_PERCENTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPct(preset)}
                    aria-pressed={safePct === preset}
                    className={[
                      'min-h-[36px] rounded-full border px-3 text-sm font-medium transition-colors',
                      safePct === preset
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-accent hover:text-foreground',
                    ].join(' ')}
                  >
                    {preset}%
                  </button>
                ))}
                <div className="inline-flex items-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={pct}
                    onChange={(e) => setPct(Number(e.target.value))}
                    aria-label={t('Custom percentage')}
                    className="h-9 w-16 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-sm outline-none focus-visible:shadow-[var(--focus-shadow)]"
                  />
                  <span className="ml-1 text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          )}

          {/* Live preview */}
          <div className="flex items-baseline justify-between rounded-[var(--radius-md)] border border-border bg-muted/30 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {kind === 'full'
                ? t('Invoice amount')
                : kind === 'deposit'
                  ? t('Deposit amount')
                  : t('Balance amount')}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMinorUnits(previewCents, currencyCode)}
            </span>
          </div>

          <Button
            variant="primary"
            className="w-full gap-1.5"
            onClick={handleIssue}
            disabled={pending || previewCents <= 0}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {t('Issue invoice')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
