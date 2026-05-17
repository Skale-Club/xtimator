/**
 * Phase 70 — Stripe Connect customer payments (CONNECT-09).
 *
 * Post-redirect banners shown on the public estimate share page based on the
 * `?stripe=success|canceled` query param. The success banner is URL-driven;
 * the database-side "marked paid" state is the webhook handler's responsibility
 * (Plan 70-04). The banner may briefly appear before the webhook lands — that's
 * acceptable, since Stripe has already confirmed the payment.
 */

export function PaymentSuccessBanner() {
  return (
    <div
      role="status"
      className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
    >
      <p className="font-medium">✓ Payment received — thank you!</p>
      <p className="text-sm mt-1">
        A receipt has been sent to your email. You can close this page.
      </p>
    </div>
  )
}

export function PaymentCanceledNotice() {
  return (
    <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      Payment canceled — you can try again anytime.
    </div>
  )
}
