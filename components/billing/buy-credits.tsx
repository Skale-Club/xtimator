'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, CheckCircle2, CreditCard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BottomSheetCloseButton, BottomSheetContent } from '@/components/ui/bottom-sheet'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useIsTwa } from '@/components/pwa/twa-provider'
import { formatCredits } from '@/lib/billing/format-usd'
import { formatBillingAmount, type BillingCurrency } from '@/lib/billing/billing-currency'
import { CAPTURE_PRIMARY_CLASS, CAPTURE_PRIMARY_STYLE } from '@/components/capture/capture-button-styles'

/**
 * Credits plan 2026-11-20 - one way to buy credits, everywhere.
 *
 * Any surface opens it with openBuyCredits() (banner, block toast, AI 402
 * modal, the New Xtimate block, the capture block, the billing page packs).
 * The packs show credits first, the range of estimates they usually cover, and
 * the price on the button; Buy charges the card the subscription already uses
 * (app/api/billing/buy-credits) and falls back to Stripe Checkout when there is
 * no saved card or the bank wants a confirmation. A successful buy fires
 * CREDITS_PURCHASED_EVENT so blocked surfaces can carry on without a reload.
 */

export const BUY_CREDITS_EVENT = 'xtm:buy-credits'
export const CREDITS_PURCHASED_EVENT = 'xtm:credits-purchased'

export type BuyCreditsRequest = {
  /** Preselect a pack (billing page buttons). */
  packIndex?: number
  /** Same-site path the Checkout fallback comes back to. */
  returnTo?: string
}

export type CreditsPurchasedDetail = { credits: number; balance: number }

export function openBuyCredits(detail: BuyCreditsRequest = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<BuyCreditsRequest>(BUY_CREDITS_EVENT, { detail }))
}

type PackView = {
  index: number
  credits: number
  priceCents: number
  currency: BillingCurrency
  estimates: { min: number; max: number }
  bestValue: boolean
}

type Offer =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'owner_required' }
  | { status: 'subscribe'; balance: number }
  | {
      status: 'ready'
      balance: number
      expiryMonths: number
      packs: PackView[]
      defaultIndex: number
      card: { brand: string; last4: string } | null
    }

function newRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/** Loads the offer and buys a pack. Shared by the dialog and inline pickers. */
export function useBuyCreditsOffer(active: boolean) {
  const { t } = useTranslation()
  const router = useRouter()
  const [offer, setOffer] = useState<Offer>({ status: 'loading' })
  const [buying, setBuying] = useState(false)
  const requestId = useRef(newRequestId())
  // Read through a ref: loading must run once per open, not again whenever the
  // translate function changes identity (that re-fetched in a loop).
  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    setOffer({ status: 'loading' })
    try {
      const res = await fetch('/api/billing/buy-credits', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 403 && data?.code === 'owner_required') return setOffer({ status: 'owner_required' })
      if (!res.ok) return setOffer({ status: 'error', message: tRef.current('Could not load the credit packs. Try again.') })
      if (!data.eligible) return setOffer({ status: 'subscribe', balance: Number(data.balance) || 0 })
      setOffer({ status: 'ready', ...data })
    } catch {
      setOffer({ status: 'error', message: tRef.current('Could not load the credit packs. Try again.') })
    }
  }, [])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const buy = useCallback(
    async (packIndex: number, opts: { useOtherCard?: boolean; returnTo?: string } = {}) => {
      setBuying(true)
      try {
        const res = await fetch('/api/billing/buy-credits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packIndex,
            requestId: requestId.current,
            returnTo: opts.returnTo ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
            useOtherCard: opts.useOtherCard === true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(data?.error ? t(data.error) : t('Could not start top-up. Please try again.'))
          return false
        }
        if (data.mode === 'checkout' && data.url) {
          if (data.reason === 'authentication_required') {
            toast(t('Your bank asked for a confirmation. Finish on the secure payment page.'))
          } else if (data.reason === 'declined') {
            toast(t('The card was declined. Try another card on the secure payment page.'))
          }
          window.location.href = data.url
          return false
        }
        // Charged: a new click must be a new charge.
        requestId.current = newRequestId()
        const detail: CreditsPurchasedDetail = { credits: Number(data.credits), balance: Number(data.balance) }
        toast.success(t('{credits} credits added').replace('{credits}', formatCredits(detail.credits)), {
          description: t('Balance: {balance} credits.').replace('{balance}', formatCredits(detail.balance)),
        })
        window.dispatchEvent(new CustomEvent<CreditsPurchasedDetail>(CREDITS_PURCHASED_EVENT, { detail }))
        router.refresh()
        return true
      } catch {
        toast.error(t('Could not start top-up. Please try again.'))
        return false
      } finally {
        setBuying(false)
      }
    },
    [router, t]
  )

  return { offer, buying, buy, reload: load }
}

/** Pack list + card + buy button. `compact` drops the header copy (inline use). */
export function BuyCreditsPicker({
  offer,
  buying,
  onBuy,
  onRetry,
  initialIndex,
  compact = false,
  ctaVerb = 'buy',
}: {
  offer: Offer
  buying: boolean
  onBuy: (packIndex: number, opts?: { useOtherCard?: boolean }) => void
  onRetry: () => void
  initialIndex?: number
  compact?: boolean
  /** 'continue' reads "Buy … and continue" (a paused estimate). */
  ctaVerb?: 'buy' | 'continue'
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<number | null>(initialIndex ?? null)

  useEffect(() => {
    if (offer.status === 'ready' && selected === null) setSelected(offer.defaultIndex)
  }, [offer, selected])

  if (offer.status === 'loading') {
    return (
      <div className="flex min-h-40 items-center justify-center" data-testid="buy-credits-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  if (offer.status === 'error') {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">{offer.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>{t('Try again')}</Button>
      </div>
    )
  }
  if (offer.status === 'owner_required') {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('Only the company owner can buy credits.')}</p>
  }
  if (offer.status === 'subscribe') {
    return (
      <div className="space-y-3 py-4 text-center">
        <p className="text-sm text-muted-foreground">{t('Subscribe to Pro to buy extra credits')}</p>
        <Link
          href="/settings/billing#choose-plan"
          className={cn(CAPTURE_PRIMARY_CLASS, 'w-full')}
          style={CAPTURE_PRIMARY_STYLE}
        >
          {t('Subscribe to Pro')}
        </Link>
      </div>
    )
  }

  const pack = offer.packs.find((p) => p.index === selected) ?? offer.packs[offer.defaultIndex]
  const price = pack ? formatBillingAmount(pack.priceCents, pack.currency) : ''
  const credits = pack ? formatCredits(pack.credits) : ''
  const label = offer.card
    ? (ctaVerb === 'continue' ? t('Buy {credits} credits and continue — {price}') : t('Buy {credits} credits — {price}'))
    : t('Continue to payment — {price}')

  return (
    <div className="space-y-3" data-testid="buy-credits-picker">
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {t('Balance: {balance} credits.').replace('{balance}', formatCredits(offer.balance))}{' '}
          {t('Purchased credits last {months} months.').replace('{months}', String(offer.expiryMonths))}
        </p>
      )}
      {compact && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('Choose a credit pack')}
        </p>
      )}
      <div role="radiogroup" aria-label={t('Credit packs')} className="space-y-2">
        {offer.packs.map((p) => {
          const isSel = p.index === pack?.index
          return (
            <button
              key={p.index}
              type="button"
              role="radio"
              aria-checked={isSel}
              data-testid="buy-credits-pack"
              onClick={() => setSelected(p.index)}
              disabled={buying}
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
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  isSel ? 'border-primary bg-primary' : 'border-muted-foreground/35'
                )}
              >
                {isSel && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {t('{credits} credits').replace('{credits}', formatCredits(p.credits))}
                  {p.bestValue && <Badge variant="brand">{t('Best value')}</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t('{min} to {max} estimates').replace('{min}', String(p.estimates.min)).replace('{max}', String(p.estimates.max))}
                </span>
              </span>
              <span className="text-[17px] font-bold tracking-tight [font-variant-numeric:tabular-nums]">
                {formatBillingAmount(p.priceCents, p.currency)}
              </span>
            </button>
          )
        })}
      </div>

      {offer.card ? (
        <div className="flex items-center gap-2.5 px-1 text-sm">
          <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">{offer.card.brand} •••• {offer.card.last4}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{t('your subscription card')}</span>
          <button
            type="button"
            onClick={() => pack && onBuy(pack.index, { useOtherCard: true })}
            disabled={buying}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t('Use another card')}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('No saved card — you will finish on the secure payment page.')}</p>
      )}

      <button
        type="button"
        className={cn(CAPTURE_PRIMARY_CLASS, 'w-full')}
        style={CAPTURE_PRIMARY_STYLE}
        disabled={buying || !pack}
        onClick={() => pack && onBuy(pack.index)}
        data-testid="buy-credits-submit"
      >
        {buying ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('Buying…')}
          </>
        ) : (
          label.replace('{credits}', credits).replace('{price}', price)
        )}
      </button>
      {offer.card && (
        <p className="text-center text-xs text-muted-foreground">{t('One-time charge to the card above. No renewal.')}</p>
      )}
    </div>
  )
}

/** Mounted once in the (app) layout; opens on openBuyCredits(). */
export function BuyCreditsProvider() {
  const { t } = useTranslation()
  const isTwa = useIsTwa()
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState<BuyCreditsRequest>({})
  const [session, setSession] = useState(0)
  const { offer, buying, buy, reload } = useBuyCreditsOffer(open)

  useEffect(() => {
    const onOpen = (e: Event) => {
      setRequest((e as CustomEvent<BuyCreditsRequest>).detail ?? {})
      setSession((n) => n + 1)
      setOpen(true)
    }
    window.addEventListener(BUY_CREDITS_EVENT, onOpen)
    return () => window.removeEventListener(BUY_CREDITS_EVENT, onOpen)
  }, [])

  // Google Play: no purchase flow in the Android app.
  if (isTwa) return null

  return (
    <Dialog open={open} onOpenChange={(next) => !buying && setOpen(next)}>
      <BottomSheetContent className="nx-surface" desktopClassName="sm:max-w-[520px]" data-testid="buy-credits-dialog">
        <DialogHeader data-sheet-drag="" className="flex shrink-0 flex-row items-start justify-between gap-4 pb-3 pl-6 pr-4 pt-2 text-left touch-none sm:pl-7 sm:pr-5 sm:pt-6">
          <div className="min-w-0">
            <DialogTitle className="text-[19px] font-semibold leading-tight tracking-tight">{t('Buy credits')}</DialogTitle>
            <DialogDescription className="sr-only">{t('Choose a credit pack')}</DialogDescription>
          </div>
          <BottomSheetCloseButton label={t('Close')} disabled={buying} />
        </DialogHeader>
        <div className="overflow-y-auto px-6 pb-6 pt-1 sm:px-7 sm:pb-7">
          <BuyCreditsPicker
            key={session}
            offer={offer}
            buying={buying}
            initialIndex={request.packIndex}
            onRetry={reload}
            onBuy={async (packIndex, opts) => {
              const ok = await buy(packIndex, { ...opts, returnTo: request.returnTo })
              if (ok) setOpen(false)
            }}
          />
        </div>
      </BottomSheetContent>
    </Dialog>
  )
}

/**
 * The picker without a dialog, for blocks that already explain the situation
 * (New Xtimate, the capture screen, a paused estimate). Calls `onPurchased`
 * after a successful one-click buy so the block can carry on.
 */
export function BuyCreditsInline({
  onPurchased,
  ctaVerb = 'buy',
  returnTo,
}: {
  onPurchased?: (detail: CreditsPurchasedDetail) => void
  ctaVerb?: 'buy' | 'continue'
  returnTo?: string
}) {
  const isTwa = useIsTwa()
  const { offer, buying, buy, reload } = useBuyCreditsOffer(!isTwa)

  useEffect(() => {
    if (!onPurchased) return
    const handler = (e: Event) => onPurchased((e as CustomEvent<CreditsPurchasedDetail>).detail)
    window.addEventListener(CREDITS_PURCHASED_EVENT, handler)
    return () => window.removeEventListener(CREDITS_PURCHASED_EVENT, handler)
  }, [onPurchased])

  if (isTwa) return null
  return (
    <div className="w-full text-left">
      <BuyCreditsPicker
        compact
        ctaVerb={ctaVerb}
        offer={offer}
        buying={buying}
        onRetry={reload}
        onBuy={(packIndex, opts) => void buy(packIndex, { ...opts, returnTo })}
      />
    </div>
  )
}

/** Small success mark reused by inline surfaces after a purchase. */
export function PurchasedNote({ credits }: { credits: number }) {
  const { t } = useTranslation()
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-[hsl(var(--success))]">
      <CheckCircle2 className="h-4 w-4" aria-hidden />
      {t('{credits} credits added').replace('{credits}', formatCredits(credits))}
    </p>
  )
}
