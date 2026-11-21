'use client'

import { useState, useTransition } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { useTranslation } from '@/lib/i18n/use-translation'

export type ConnectState =
  | { kind: 'not_configured' }
  | { kind: 'not_connected' }
  | { kind: 'connected'; displayName: string; email: string | null }
  | {
      kind: 'restricted'
      displayName: string
      email: string | null
      disabledReason: string | null
    }

/**
 * Four-state card for the Client actions settings page. The `not_configured`
 * branch fires when the platform-level Connect Client ID is unset; the
 * `not_connected` branch shows the Connect CTA; the `connected` branch shows
 * the linked Stripe account + a Disconnect button (POST to disconnect API);
 * the `restricted` branch (CONNECT-HEALTH-01) shows the same linked-account
 * info PLUS a warning that Stripe has paused charges on the account (with the
 * reason, when Stripe supplied one) and a link to finish verification — a
 * restricted account is still "connected" (has a stripe_account_id) but
 * cannot currently be paid, so it keeps the Disconnect affordance too.
 */
export function StripeConnectCard({
  state,
  feePct,
  openInvoiceCount = 0,
  readOnly = false,
}: {
  state: ConnectState
  feePct: number
  /** Invoices still open; above zero, Disconnect asks for confirmation first. */
  openInvoiceCount?: number
  /** Non-owners see the state but cannot connect or disconnect. */
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Disclosed % is driven entirely by the live billing_config value passed in
  // (feePct × 100) — never a hard-coded literal, so it can never diverge from
  // the % actually charged (FEE-03). e.g. 0.02 → "2%", 0.005 → "0.5%".
  const feeWhole = feePct * 100
  const feeLabel = `${Number.isInteger(feeWhole) ? feeWhole : feeWhole.toFixed(2)}%`

  function handleDisconnect() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/stripe/connect/disconnect', {
          method: 'POST',
        })
        const json = (await res.json()) as { ok: boolean; message?: string }
        if (!json.ok) {
          setError(json.message ?? t('Disconnect failed'))
          return
        }
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : t('Disconnect failed'))
      }
    })
  }

  // Same gutters as SettingsCard (20px phone / 24px sm+); the old p-2 stacked on
  // the Card parts' px-6 and left the title hugging the top edge.
  return (
    <Card variant="glass" className="gap-4 py-5 sm:py-6">
      <CardHeader className="px-5 sm:px-6">
        <CardTitle>{t('Stripe payments')}</CardTitle>
        <CardDescription>
          {t('Accept card payments from customers directly on your shared estimates. Funds settle to your own Stripe account | Xtimator never holds your money.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        {state.kind === 'not_configured' && (
          <p className="text-sm text-muted-foreground">
            {t('Stripe Connect is not yet enabled on this platform. Please contact support.')}
          </p>
        )}
        {state.kind === 'not_connected' && (
          <p className="text-sm text-muted-foreground">
            {t('Connect your Stripe account in one click. Test mode works for setup.')}
          </p>
        )}
        {state.kind === 'connected' && (
          <div className="text-sm">
            <p className="break-words">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-2 align-middle" />
              {t('Connected as')} <strong className="ml-1">{state.displayName}</strong>
            </p>
            {state.email && (
              <p className="text-muted-foreground mt-1">{state.email}</p>
            )}
          </div>
        )}
        {state.kind === 'restricted' && (
          <div className="text-sm">
            <p className="break-words">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2 align-middle" />
              {t('Connected as')} <strong className="ml-1">{state.displayName}</strong>
            </p>
            {state.email && (
              <p className="text-muted-foreground mt-1">{state.email}</p>
            )}
            <p
              data-testid="restricted-warning"
              className="mt-3 rounded-md border-l-[3px] border-l-amber-500 bg-amber-500/5 p-3 text-sm text-muted-foreground"
            >
              {t('Stripe has paused payments on this account — your customers cannot pay invoices until this is resolved.')}
              {state.disabledReason && (
                <>
                  {' '}
                  {t('Reason')}: {state.disabledReason}.
                </>
              )}
              {' '}
              <a
                href="https://dashboard.stripe.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t('Finish verification in Stripe')}
              </a>
            </p>
          </div>
        )}
        {(state.kind === 'not_connected' || state.kind === 'connected' || state.kind === 'restricted') && (
          <p
            data-testid="fee-disclosure"
            className="mt-3 rounded-md border-l-[3px] border-l-amber-500 bg-amber-500/5 p-3 text-sm text-muted-foreground"
          >
            {t('Xtimator charges a {fee} fee on each payment you receive through the platform | this is separate from Stripe\'s processing fees.').replace('{fee}', feeLabel)}
            {' '}
            {t('If you refund a payment, the Xtimator fee is not returned.')}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive mt-3">{error}</p>
        )}
      </CardContent>
      <CardFooter className="px-5 sm:px-6">
        {state.kind === 'not_connected' && !readOnly && (
          <a href="/api/stripe/connect/initiate">
            <Button variant="primary">
              {t('Connect Stripe Account')}
            </Button>
          </a>
        )}
        {(state.kind === 'connected' || state.kind === 'restricted') && !readOnly && (
          <Button
            variant="outline"
            onClick={() => (openInvoiceCount > 0 ? setConfirmOpen(true) : handleDisconnect())}
            disabled={isPending}
          >
            {isPending ? t('Disconnecting…') : t('Disconnect')}
          </Button>
        )}
      </CardFooter>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Disconnect Stripe?')}</AlertDialogTitle>
            <AlertDialogDescription data-testid="disconnect-open-invoices">
              {t(
                'You have {count} open invoice(s). After you disconnect, Xtimator can no longer track their payment. Void them first if your client should not pay them.',
              ).replace('{count}', String(openInvoiceCount))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDisconnect}
            >
              {t('Disconnect')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
