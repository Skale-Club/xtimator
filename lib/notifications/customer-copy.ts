/**
 * lib/notifications/customer-copy.ts
 *
 * Phase 177 plan 05 (CUST-01) — built-in fallback copy for END-CUSTOMER
 * (client-facing) notification channels: email + sms. Deliberately kept
 * SEPARATE from `lib/notifications/copy.ts` / `buildNotificationCopy`,
 * which are switch-exhaustive against the tenant-scoped `EventType` union
 * and consumed by unrelated tenant-facing call sites (Phase 172/174) — this
 * module targets `CustomerEventType`, a small, purpose-built union for
 * messages sent TO a business's end customer, not to the tenant/business
 * owner themselves.
 *
 * Conventions mirror copy.ts: every ctx field is optional and defaulted
 * defensively with `??` (never trust the caller populated everything), and
 * the switch uses a `default: never` exhaustiveness guard so a future added
 * `CustomerEventType` case that's forgotten here is a compile error.
 *
 * Exactly one case exists today ('estimate.sent') — the legacy send-sms
 * route (177-07) is the first and only real caller. Future end-customer
 * event types (e.g. reminders, approvals) extend this union as needed.
 */

export type CustomerEventType = 'estimate.sent'

export interface CustomerCopyContext {
  businessName?: string
  clientName?: string
  shareUrl?: string
}

export interface CustomerCopy {
  /** email only — sms has no subject line */
  subject?: string
  body: string
}

export function buildCustomerCopy(
  eventType: CustomerEventType,
  channel: 'email' | 'sms',
  ctx: CustomerCopyContext,
): CustomerCopy {
  switch (eventType) {
    case 'estimate.sent': {
      const business = ctx.businessName ?? 'Your contractor'
      const link = ctx.shareUrl ?? ''

      if (channel === 'sms') {
        return {
          body: `${business} sent you an estimate. Review and approve it here: ${link}`.trim(),
        }
      }

      const greeting = ctx.clientName ? `Hi ${ctx.clientName},` : 'Hi,'
      return {
        subject: `${business} sent you an estimate`,
        body: `<p>${greeting}</p><p>${business} sent you an estimate. Review and approve it here: ${link}</p>`,
      }
    }
    default: {
      const _exhaustive: never = eventType
      throw new Error(`Unhandled CustomerEventType: ${String(_exhaustive)}`)
    }
  }
}
