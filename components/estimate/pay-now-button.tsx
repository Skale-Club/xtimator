import { Button } from '@/components/ui/button'
import { formatUSD } from '@/lib/utils/format'

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
 */
export interface PayNowButtonProps {
  token: string
  totalAmountCents: number
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
        size="lg"
        className="w-full bg-[#406EF1] hover:bg-[#3558c2] text-white"
      >
        Pay {formatUSD(props.totalAmountCents)}
      </Button>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Powered by Stripe · Secure payment
      </p>
    </form>
  )
}
