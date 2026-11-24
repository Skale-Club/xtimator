'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Receipt, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { generateInvoice, getInvoicingPreview } from '@/lib/actions/invoice'
import {
  hasLiveDepositInvoice,
  invoiceAmountCents,
  summarizeInvoicing,
  type InvoicingInput,
} from '@/lib/change-orders/invoicing'
import { formatMinorUnits, toMinorUnits } from '@/lib/money/currency'
import { useTranslation } from '@/lib/i18n/use-translation'

type InvoiceKind = 'full' | 'deposit' | 'balance'

type InvoicingPreview = Extract<Awaited<ReturnType<typeof getInvoicingPreview>>, { data: unknown }>['data']

const PRESET_PERCENTS = [10, 20, 30, 50] as const

interface GenerateInvoiceDialogProps {
  estimateId: string
  currencyCode: string
  /** Live editor total in minor units — preview only (the issued snapshot is computed server-side, D-07). */
  estimateTotalCents: number
  onIssued?: () => void
  /**
   * DEP-03: when the estimate has a server-configured deposit, the percent
   * picker is replaced by the configured deposit amount so the preview can
   * never drift from what the server actually charges (see
   * lib/actions/invoice.ts's `hasConfiguredDeposit` branch). Optional with
   * safe defaults ('none' / null) so older call sites degrade to the legacy
   * percent picker; estimate-editor.tsx passes the estimate's deposit config.
   */
  depositType?: 'none' | 'percent' | 'amount' | null
  depositValue?: number | null
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
  depositType = null,
  depositValue = null,
}: GenerateInvoiceDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<InvoiceKind>('full')
  const [pct, setPct] = useState(30)
  const [pending, setPending] = useState(false)

  // Clamp the percent to the 1–99 range the action accepts.
  const safePct = Math.min(99, Math.max(1, Math.round(pct) || 1))

  // DEP-03: when the estimate has a server-configured deposit, the preview
  // (and the amount actually charged server-side, see lib/actions/invoice.ts's
  // `hasConfiguredDeposit` branch) is derived from it instead of the free-form
  // percent — mirrors lib/billing/charge-amount.ts's resolveChargeAmount so this
  // preview never drifts from what the server will charge.
  const hasConfiguredDeposit = depositType === 'percent' || depositType === 'amount'
  const configuredDepositCents = hasConfiguredDeposit
    ? Math.max(
        0,
        Math.min(
          depositType === 'percent'
            ? Math.round((estimateTotalCents * (depositValue ?? 0)) / 100)
            : toMinorUnits(depositValue ?? 0, currencyCode),
          estimateTotalCents,
        ),
      )
    : null

  // Contract-aware preview (accepted estimate + approved change orders): loaded
  // when the dialog opens and computed with the same pure math the server uses.
  // While loading or on error the live-total fallback below applies unchanged.
  const [preview, setPreview] = useState<InvoicingPreview | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getInvoicingPreview(estimateId)
      .then((result) => {
        if (cancelled) return
        setPreview(result && 'data' in result ? result.data : null)
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, estimateId])

  const contractInput: InvoicingInput | null = preview
    ? {
        estimateTotalCents: preview.estimateTotalCents,
        depositCents:
          preview.configuredDepositCents ?? Math.round((preview.estimateTotalCents * safePct) / 100),
        approvedChangeOrders: preview.approvedChangeOrders,
        liveInvoices: preview.liveInvoices,
      }
    : null
  const contractSummary = contractInput ? summarizeInvoicing(contractInput) : null
  const withChangeOrders = !!contractInput && !!contractSummary && contractSummary.changeOrdersCents !== 0
  // A live deposit invoice: the balance is whatever remains of the contract (the
  // server uses the same pure math), so the percent picker is meaningless there.
  const liveDeposit = !!contractInput && hasLiveDepositInvoice(contractInput)

  const depositCents = hasConfiguredDeposit
    ? (configuredDepositCents ?? 0)
    : Math.round((estimateTotalCents * safePct) / 100)
  const shownDepositCents =
    withChangeOrders && contractInput ? contractInput.depositCents : depositCents
  const previewCents =
    (withChangeOrders || (liveDeposit && kind === 'balance')) && contractInput
      ? invoiceAmountCents(contractInput, { kind })
      : kind === 'full'
        ? estimateTotalCents
        : kind === 'deposit'
          ? depositCents
          : estimateTotalCents - depositCents
  // A credit reads "− $100.00", never "+ -$100.00".
  const signed = (cents: number) => (cents < 0 ? '−' : '+')
  const breakdown =
    liveDeposit && kind === 'balance' && contractInput && contractSummary
      ? `${t('Contract')} ${formatMinorUnits(contractSummary.contractCents, currencyCode)} − ${t('Already invoiced')} ${formatMinorUnits(contractSummary.alreadyInvoicedCents, currencyCode)}`
      : withChangeOrders && contractInput && contractSummary
      ? kind === 'balance'
        ? `${t('Estimate')} ${formatMinorUnits(contractInput.estimateTotalCents, currencyCode)} − ${t('Deposit')} ${formatMinorUnits(shownDepositCents, currencyCode)} ${signed(contractSummary.changeOrdersInBalanceCents)} ${t('Change orders')} ${formatMinorUnits(Math.abs(contractSummary.changeOrdersInBalanceCents), currencyCode)}`
        : kind === 'full'
          ? `${t('Estimate + change orders')}: ${formatMinorUnits(contractInput.estimateTotalCents, currencyCode)} ${signed(contractSummary.changeOrdersCents)} ${formatMinorUnits(Math.abs(contractSummary.changeOrdersCents), currencyCode)}`
          : null
      : null

  async function handleIssue() {
    if (pending) return
    setPending(true)
    const opts =
      kind === 'full'
        ? ({ kind: 'full' } as const)
        : ({ kind, depositPct: safePct } as const)

    try {
      const result = await generateInvoice(estimateId, opts)
      if ('error' in result) {
        toast.error(t(result.error))
        return
      }

      toast.success(t('Invoice issued'))
      // Close first, then refresh the persisted invoice snapshot.
      setOpen(false)
      router.refresh()
      onIssued?.()
    } catch {
      toast.error(t('Could not confirm the invoice. Please try again.'))
    } finally {
      setPending(false)
    }
  }

  const segments: { value: InvoiceKind; label: string }[] = [
    { value: 'full', label: t('Full') },
    { value: 'deposit', label: t('Deposit') },
    { value: 'balance', label: t('Balance') },
  ]

  // DEP-03: when the estimate has a server-configured deposit, the percent
  // picker is meaningless (the server ignores depositPct entirely in that
  // case) — show the configured deposit amount instead.
  const balanceIsRemainder = kind === 'balance' && liveDeposit
  const showPercent = (kind === 'deposit' || kind === 'balance') && !hasConfiguredDeposit && !balanceIsRemainder
  const showConfiguredDeposit = (kind === 'deposit' || kind === 'balance') && hasConfiguredDeposit && !balanceIsRemainder

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm" className="rounded-full gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          {t('Generate invoice')}
        </Button>
      </DialogTrigger>

      <BottomSheetContent data-testid="generate-invoice-sheet" desktopClassName="sm:max-w-md">
        <DialogHeader
          data-sheet-drag=""
          className="flex shrink-0 touch-none flex-row items-start justify-between gap-3 pl-5 pr-3 pt-1 pb-2 text-left sm:pt-5"
        >
          <div className="min-w-0 space-y-1.5">
            <DialogTitle className="inline-flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              {t('Generate invoice')}
            </DialogTitle>
            <DialogDescription>
              {t('Issue a real invoice for this estimate. The amount is frozen at the moment you issue it.')}
            </DialogDescription>
          </div>
          <BottomSheetCloseButton label={t('Close')} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 px-5 pt-2 pb-6">
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

          {/* Balance after an issued deposit: the remainder, no percent to pick. */}
          {balanceIsRemainder && (
            <div
              data-testid="balance-remainder-note"
              className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
            >
              {t('Balance is what remains after the deposit invoice already issued.')}
            </div>
          )}

          {/* Configured-deposit readout (deposit / balance, when the estimate
              already has a deposit_type/deposit_value — replaces the percent
              picker so the preview can't drift from the server-charged amount). */}
          {showConfiguredDeposit && (
            <div className="rounded-[var(--radius-md)] border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {kind === 'deposit'
                ? t('This estimate has a configured deposit of {amount}.').replace(
                    '{amount}',
                    formatMinorUnits(configuredDepositCents ?? 0, currencyCode),
                  )
                : t('Balance after the configured deposit of {amount}.').replace(
                    '{amount}',
                    formatMinorUnits(configuredDepositCents ?? 0, currencyCode),
                  )}
            </div>
          )}

          {/* Percent picker (deposit / balance only, no configured deposit) */}
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
          {breakdown && (
            <p data-testid="invoice-breakdown" className="-mt-3 px-1 text-xs text-muted-foreground">
              {breakdown}
            </p>
          )}

          {preview?.accepted === false && (
            <p data-testid="not-accepted-note" className="px-1 text-xs text-muted-foreground">
              {t('Your client has not accepted this estimate yet.')}
            </p>
          )}

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
      </BottomSheetContent>
    </Dialog>
  )
}
