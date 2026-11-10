import 'server-only'
import { getIntegrationKey } from '@/lib/platform-config'
import { customerEmailFrom } from '@/lib/email/sender'
import type { MessagingMeta } from '@/lib/billing/messaging-events'

/**
 * lib/email/customer-emails.ts
 *
 * The Resend-calling primitive for end-customer email (CUST-01) — the email-side
 * sibling to `lib/sms/client.ts`'s `sendCustomerSms()`. Deliberately isolated: no
 * template/audit logic here, just dispatch. The "honest sender identity" rule
 * (`{{business_name}} via Xtimator`) lives in exactly one function,
 * `customerEmailFrom()` (`lib/email/sender.ts`), which this always calls.
 *
 * Contract (never-throw, best-effort, mirrors `sendSms()`):
 *   - Empty `toEmail` -> `{ ok: false, error: 'no_recipient' }`, no Resend call.
 *   - No Resend key configured -> `{ ok: false, error: 'resend_unconfigured' }`,
 *     no Resend call, `console.warn`.
 *   - Resend responds with an error -> `{ ok: false, error: <message> }`.
 *   - Resend throws/rejects -> caught, `console.warn`, `{ ok: false, error: 'send_failed' }`.
 *   - Success -> `{ ok: true, id: data.id }`.
 */

export interface CustomerEmailAttachment {
  filename: string
  content: Buffer
}

export interface SendCustomerEmailParams {
  toEmail: string
  toName?: string | null
  businessName: string
  subject: string
  html: string
  text: string
  attachments?: CustomerEmailAttachment[]
  /**
   * Phase 2b: attribution for the per-message cost row (who pays, why, billable).
   * Omitted = recorded as an 'unclassified', non-billable platform send.
   */
  meta?: MessagingMeta
}

export interface SendCustomerEmailResult {
  ok: boolean
  id?: string
  error?: string
}

/**
 * @internal — call `sendCustomerMessage()` (177-06's orchestrator), never directly.
 * This primitive performs no consent/suppression/quiet-hours gating and no
 * compliance-audit logging; `sendCustomerMessage()` is the only caller that
 * requires a real `SendPermit` and unconditionally logs the attempt.
 */
export async function sendCustomerEmail(
  params: SendCustomerEmailParams
): Promise<SendCustomerEmailResult> {
  if (!params.toEmail) {
    return { ok: false, error: 'no_recipient' }
  }

  const key = await getIntegrationKey('resend')
  if (!key) {
    console.warn('[customer-emails] no resend key — refusing to send')
    return { ok: false, error: 'resend_unconfigured' }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send({
      from: customerEmailFrom(params.businessName),
      to: params.toEmail,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.attachments?.length ? { attachments: params.attachments } : {}),
    })

    if (error) {
      return { ok: false, error: error.message }
    }
    // Phase 2b: record the per-message cost (best-effort, never throws).
    try {
      const { recordEmailSent } = await import('@/lib/billing/messaging-cost')
      await recordEmailSent({
        id: data?.id ?? null,
        meta: params.meta ?? { companyId: null, purpose: 'unclassified', billable: false },
      })
    } catch (e) {
      console.warn('[customer-emails] cost record failed:', e instanceof Error ? e.message : String(e))
    }
    return { ok: true, id: data?.id }
  } catch (e) {
    console.warn(
      '[customer-emails] send failed:',
      e instanceof Error ? e.message : String(e)
    )
    return { ok: false, error: 'send_failed' }
  }
}
