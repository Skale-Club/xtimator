/**
 * Phase 70 — Stripe Connect customer payments (CONNECT-09).
 *
 * Post-redirect banners shown on the public estimate share page based on the
 * `?stripe=success|canceled` query param. The success banner is URL-driven;
 * the database-side "marked paid" state is the webhook handler's responsibility
 * (Plan 70-04). The banner may briefly appear before the webhook lands — that's
 * acceptable, since Stripe has already confirmed the payment.
 *
 * Phase 71-09 — styled as <Card variant="glass"> with status-colored 3px left
 * border (emerald for success, neutral for canceled). Behavior unchanged.
 */

import { CheckCircle2, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function PaymentSuccessBanner() {
  return (
    <Card
      variant="glass"
      role="status"
      aria-live="polite"
      className="border-l-[3px] border-l-emerald-500"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <CheckCircle2 className="size-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">
            Payment received — thank you!
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            A receipt has been sent to your email. You can close this page.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function PaymentCanceledNotice() {
  return (
    <Card variant="glass" role="status">
      <CardContent className="flex items-start gap-3 p-4">
        <Info className="size-5 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">
            Payment canceled — you can try again anytime.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
