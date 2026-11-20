'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, CreditCard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { saveAutoTopupSettings, disableAutoTopup } from '@/lib/actions/auto-topup'
import { useTranslation } from '@/lib/i18n/use-translation'
import { formatCredits } from '@/lib/billing/format-usd'
import { formatBillingAmount, type BillingCurrency } from '@/lib/billing/billing-currency'
import { packViews } from '@/lib/billing/pack-display'
import { CAPTURE_PRIMARY_CLASS, CAPTURE_PRIMARY_STYLE } from '@/components/capture/capture-button-styles'

/**
 * Manage auto top-up (credits plan 2026-11-20 redesign).
 *
 * A sheet of the New Xtimate family (bottom sheet on phones): the threshold
 * in CREDITS (it used to be typed in dollars and multiplied by 100, a leftover
 * of "1 credit = 1 cent" that no longer holds), the pack as credits + price, the card it charges (the subscription's card, or another one
 * via Stripe), and the whole rule in one sentence before saving.
 */

const THRESHOLD_PRESETS = [150, 300, 600]
const DEFAULT_THRESHOLD = 300

interface AutoTopupDialogLauncherProps {
  enabled: boolean
  packs: Array<{ priceCents: number; credits: number; priceCentsBrl?: number }>
  currentThresholdCredits: number | null
  currentPackIndex: number | null
  hasPaymentMethod: boolean
  /** "Visa •••• 4242" - the card the charge uses. */
  cardLabel?: string | null
  // False when the signed-in user is a company member, not the owner —
  // defaults to true so existing callers keep today's behavior.
  isOwner?: boolean
  currency?: BillingCurrency
}

export function AutoTopupDialogLauncher({
  enabled,
  packs,
  currentThresholdCredits,
  currentPackIndex,
  hasPaymentMethod,
  cardLabel = null,
  isOwner = true,
  currency = 'usd',
}: AutoTopupDialogLauncherProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [threshold, setThreshold] = useState<number>(currentThresholdCredits ?? DEFAULT_THRESHOLD)
  const [packIndex, setPackIndex] = useState(currentPackIndex ?? (packs.length >= 3 ? 1 : 0))
  const [isPending, startTransition] = useTransition()

  const views = packViews(packs, currency)
  const pack = views.find((v) => v.index === packIndex) ?? views[0]
  // Mirrors the server: positive, at most 5x the pack's credits and 100,000.
  const maxThreshold = pack ? Math.min(pack.credits * 5, 100_000) : 100_000
  const thresholdValid = Number.isInteger(threshold) && threshold > 0 && threshold <= maxThreshold

  function handleSave() {
    startTransition(async () => {
      const result = await saveAutoTopupSettings({ thresholdCredits: threshold, packIndex })
      if ('error' in result) {
        toast.error(t(result.error))
        return
      }
      toast.success(t('Auto top-up settings saved.'))
      setOpen(false)
    })
  }

  function handleTurnOff() {
    startTransition(async () => {
      const result = await disableAutoTopup()
      if ('error' in result) {
        toast.error(t(result.error))
        return
      }
      toast.success(t('Auto top-up turned off.'))
      setOpen(false)
    })
  }

  const summary =
    pack && thresholdValid
      ? t('When your balance drops below {threshold} credits, we buy {credits} credits ({price}){card}.')
          .replace('{threshold}', formatCredits(threshold))
          .replace('{credits}', formatCredits(pack.credits))
          .replace('{price}', formatBillingAmount(pack.priceCents, pack.currency))
          .replace('{card}', cardLabel ? t(' on {card}').replace('{card}', cardLabel) : '')
      : null

  return (
    <>
      <Button variant={enabled ? 'outline' : 'primary'} size="sm" onClick={() => setOpen(true)} disabled={!isOwner}>
        {enabled ? t('Change') : t('Turn on')}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[520px]" data-testid="auto-topup-dialog">
          <DialogHeader
            data-sheet-drag=""
            className="flex shrink-0 flex-row items-start justify-between gap-4 pb-3 pl-6 pr-4 pt-2 text-left touch-none sm:pl-7 sm:pr-5 sm:pt-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">{t('Auto top-up')}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t('Buys credits by itself when your balance runs low, so an estimate never pauses.')}
              </DialogDescription>
            </div>
            <BottomSheetCloseButton label={t('Close')} disabled={isPending} />
          </DialogHeader>

          <div className="space-y-6 overflow-y-auto px-6 pb-6 pt-1 sm:px-7 sm:pb-7">
            <section className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('When the balance drops below')}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {THRESHOLD_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setThreshold(v)}
                    disabled={isPending}
                    aria-pressed={threshold === v}
                    className={cn(
                      'h-10 rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors',
                      threshold === v
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/40 text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    {formatCredits(v)}
                  </button>
                ))}
                <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-background/40 pl-4 pr-3 text-sm focus-within:border-primary">
                  <input
                    id="autotopup-threshold"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={Number.isFinite(threshold) ? threshold : ''}
                    onChange={(e) => setThreshold(Math.round(Number(e.target.value)))}
                    disabled={isPending}
                    aria-label={t('Credits')}
                    className="w-20 bg-transparent font-semibold tabular-nums outline-none"
                  />
                  <span className="text-muted-foreground">{t('credits')}</span>
                </label>
              </div>
              <p className={cn('text-xs', thresholdValid ? 'text-muted-foreground' : 'text-destructive')}>
                {thresholdValid
                  ? t('Checked every time credits are used.')
                  : t('Enter between 1 and {max} credits for this pack.').replace('{max}', formatCredits(maxThreshold))}
              </p>
            </section>

            <section className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Buy this pack')}</p>
              <div role="radiogroup" aria-label={t('Credit packs')} className="space-y-2">
                {views.map((v) => {
                  const isSel = v.index === pack?.index
                  return (
                    <button
                      key={v.index}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      data-testid="autotopup-pack"
                      onClick={() => setPackIndex(v.index)}
                      disabled={isPending}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all',
                        isSel
                          ? 'border-primary bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]'
                          : 'border-border bg-background/40 hover:border-primary/40 hover:bg-primary/5'
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                          isSel ? 'border-primary bg-primary' : 'border-muted-foreground/35'
                        )}
                      >
                        {isSel && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                          {t('{credits} credits').replace('{credits}', formatCredits(v.credits))}
                          {v.bestValue && <Badge variant="brand">{t('Best value')}</Badge>}
                        </span>
                      </span>
                      <span className="text-[17px] font-bold tracking-tight tabular-nums">
                        {formatBillingAmount(v.priceCents, v.currency)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('Card')}</p>
              <div className="flex items-center gap-2.5 text-sm">
                <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {hasPaymentMethod ? (
                  <>
                    <span className="font-medium">{cardLabel ?? t('Payment method on file.')}</span>
                    {cardLabel && <span className="hidden text-xs text-muted-foreground sm:inline">{t('your subscription card')}</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">{t('No payment method on file. Add one to enable auto top-up.')}</span>
                )}
                <PaymentMethodSetupButton hasPaymentMethod={hasPaymentMethod} />
              </div>
            </section>

            {summary && (
              <p data-testid="autotopup-summary" className="rounded-2xl bg-primary/5 px-4 py-3 text-sm leading-relaxed">
                {summary}
              </p>
            )}

            <div className="space-y-3">
              <button
                type="button"
                className={cn(CAPTURE_PRIMARY_CLASS, 'w-full')}
                style={CAPTURE_PRIMARY_STYLE}
                onClick={handleSave}
                disabled={isPending || !hasPaymentMethod || !thresholdValid || !isOwner}
                data-testid="autotopup-save"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {enabled ? t('Save changes') : t('Turn on auto top-up')}
              </button>
              {enabled && (
                <button
                  type="button"
                  onClick={handleTurnOff}
                  disabled={isPending}
                  className="w-full text-center text-sm font-medium text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                >
                  {t('Turn off auto top-up')}
                </button>
              )}
            </div>
          </div>
        </BottomSheetContent>
      </Dialog>
    </>
  )
}

function PaymentMethodSetupButton({ hasPaymentMethod }: { hasPaymentMethod: boolean }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  async function handleAdd() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/create-autotopup-setup-session', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        toast.error(data.error ? t(data.error) : t('Could not start payment method setup. Please try again.'))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t('Could not start payment method setup. Please try again.'))
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={loading}
      className="ml-auto shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {loading ? t('Redirecting…') : hasPaymentMethod ? t('Use another card') : t('Add payment method')}
    </button>
  )
}
