import 'server-only'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { formatMinorUnits } from '@/lib/money/currency'

/**
 * Plain-text branded payment notification emails for the Stripe Connect
 * customer-payments flow (Phase 70, plan 70-04).
 *
 * Design contract (per PLAN truths):
 *   - These functions NEVER throw. They log on failure and return so the
 *     webhook handler can never 5xx because of a transient Resend outage
 *     (Stripe must not retry forever for an email send error).
 *   - If the Resend integration key is unset, we log a warning and return
 *     without attempting to send.
 *
 * NOTE: Intentionally plain-text emails to ship the loop fast. Branded
 * HTML / MJML templates are a polish iteration deferred to a future seed
 * (see CONTEXT.md "Claude's Discretion").
 */

export interface PaymentEmailContext {
  amountCents: number
  currencyCode?: string | null
  projectName: string
  estimateShareUrl: string
  businessName: string
  businessEmail: string
  customerEmail: string | null
  customerName: string | null
}

/**
 * Notification to the business owner: "You received $X — [project]".
 * Fires on every successful Connect Checkout completion when the company
 * has an email on file and Resend is configured.
 */
export async function sendPaymentReceivedEmail(
  ctx: PaymentEmailContext
): Promise<void> {
  try {
    if (!ctx.businessEmail) {
      console.warn(
        '[payment-emails] No business email — skipping business notification'
      )
      return
    }
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn(
        '[payment-emails] No resend key — skipping business notification'
      )
      return
    }
    const branding = await getBranding()
    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const amount = formatMinorUnits(ctx.amountCents, ctx.currencyCode)
    await resend.emails.send({
      from: `${branding.appName} <notifications@xtimator.com>`,
      to: ctx.businessEmail,
      subject: `You received ${amount} — ${ctx.projectName}`,
      text: [
        `Great news!`,
        ``,
        `${ctx.customerEmail ?? 'A customer'} just paid ${amount} for "${ctx.projectName}".`,
        ``,
        `View the estimate: ${ctx.estimateShareUrl}`,
        ``,
        `Funds will settle to your Stripe account on Stripe's normal payout schedule.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[payment-emails] sendPaymentReceivedEmail failed:', e)
  }
}

/**
 * Receipt to the customer: "Payment confirmation — $X to [business]".
 * Only fires when Stripe Checkout collected a customer email (the default).
 * From-name is the business name (not the Xtimator app name) so the
 * customer sees the brand they paid.
 */
export async function sendPaymentReceiptEmail(
  ctx: PaymentEmailContext
): Promise<void> {
  if (!ctx.customerEmail) {
    console.warn(
      '[payment-emails] No customer email on session — skipping receipt'
    )
    return
  }
  try {
    const key = await getIntegrationKey('resend')
    if (!key) {
      console.warn('[payment-emails] No resend key — skipping customer receipt')
      return
    }
    // getBranding is invoked for consistency / future templating even though
    // the current plain-text body uses the business name in the from-line.
    await getBranding()
    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const amount = formatMinorUnits(ctx.amountCents, ctx.currencyCode)
    await resend.emails.send({
      from: `${ctx.businessName} <notifications@xtimator.com>`,
      to: ctx.customerEmail,
      subject: `Payment confirmation — ${amount} to ${ctx.businessName}`,
      text: [
        `Hi${ctx.customerName ? ' ' + ctx.customerName : ''},`,
        ``,
        `Thanks for your payment.`,
        ``,
        `Amount: ${amount}`,
        `For: ${ctx.projectName}`,
        `Paid to: ${ctx.businessName}`,
        ``,
        `Your estimate: ${ctx.estimateShareUrl}`,
        ``,
        `If you have any questions about your service, please reply to this email or contact ${ctx.businessName} directly.`,
      ].join('\n'),
    })
  } catch (e) {
    console.error('[payment-emails] sendPaymentReceiptEmail failed:', e)
  }
}
