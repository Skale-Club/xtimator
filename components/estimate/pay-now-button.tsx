import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/utils/format'
import { T } from '@/components/i18n/t'

/**
 * Phase 70 — Stripe Connect customer payments (CONNECT-06).
 *
 * Public-share-page "Pay $X" button. Server-compatible (no JS required):
 * renders a plain <form method="POST"> that posts to /api/estimate/[token]/pay,
 * which 303-redirects the customer to Stripe Checkout on the connected account.
 *
 * Visibility — the button renders ONLY when ALL of:
 *   - props.stripeAccountId is non-null (tenant has connected Stripe)
 *   - props.stripeConnectStatus === 'active'
 *   - props.paymentStatus !== 'paid'
 *   - props.totalAmountCents > 0
 *
 * Any failure of these returns null (no broken UI, no upsell — Phase 70 hard
 * constraint: zero new Stripe surface for non-connected tenants).
 *
 * Phase 71-09 — styled with <Button variant="primary"> (gradient-brand +
 * shimmer sweep) + shadow-glow-brand. Brand gradient cascades tenant
 * --platform-primary on /estimate/* (RESEARCH G6). Behavior unchanged.
 */
export interface PayNowButtonProps {
  token: string
  totalAmountCents: number
  currencyCode?: string | null
  stripeAccountId: string | null
  stripeConnectStatus: string | null
  paymentStatus: string
}

export function PayNowButton(props: PayNowButtonProps) {
  const visible =
    props.stripeAccountId != null &&
    props.stripeConnectStatus === 'active' &&
    props.paymentStatus !== 'paid' &&
    props.totalAmountCents > 0

  if (!visible) return null

  return (
    <form
      action={`/api/estimate/${props.token}/pay`}
      method="POST"
      className="w-full"
    >
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full shadow-glow-brand"
      >
        <T text={`Pay ${formatUSD(props.totalAmountCents, props.currencyCode)}`} />
      </Button>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        <T>Powered by Stripe · Secure payment</T>
      </p>
    </form>
  )
}
