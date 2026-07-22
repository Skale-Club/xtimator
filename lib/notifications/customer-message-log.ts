import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Phase 177 Plan 02 (CUST-05) — the ONE writer every end-customer send path
 * calls after every dispatch attempt (success or provider-level failure).
 * Modeled on `customer_messages` (supabase/migrations/20260721000004_...),
 * itself modeled on `estimate_deliveries`'s dual-recipient-column
 * convention (`recipientEmail`/`recipientPhone`, exactly one populated
 * depending on `channel`).
 *
 * Best-effort, never-throw (mirrors lib/admin/audit-log.ts /
 * lib/billing/record-ai-cost.ts's try/catch + console.warn-on-failure
 * discipline): a failure to write the audit row must never fail the actual
 * customer send. Every optional field defaults to `null` — never left as
 * `undefined` in the insert payload.
 *
 * This module is pure schema-adjacent plumbing. It is NOT called from
 * anywhere yet — 177-06's sendCustomerMessage() wires it in.
 */
export interface LogCustomerMessageParams {
  companyId: string | null
  clientId: string | null
  channel: 'email' | 'sms'
  recipientEmail?: string | null
  recipientPhone?: string | null
  provider: 'resend' | 'twilio'
  providerMessageId?: string | null
  isTemplate: boolean
  templateEventType?: string | null
  triggerSource: 'manual' | 'agentic-whatsapp' | 'agentic-mcp'
  subject?: string | null
  body: string
  status: 'sent' | 'failed'
  errorMessage?: string | null
}

export async function logCustomerMessage(params: LogCustomerMessageParams): Promise<void> {
  try {
    const svc = requireServiceClient()
    const { error } = await svc.from('customer_messages').insert({
      company_id: params.companyId,
      client_id: params.clientId,
      channel: params.channel,
      recipient_email: params.recipientEmail ?? null,
      recipient_phone: params.recipientPhone ?? null,
      provider: params.provider,
      provider_message_id: params.providerMessageId ?? null,
      is_template: params.isTemplate,
      template_event_type: params.templateEventType ?? null,
      trigger_source: params.triggerSource,
      subject: params.subject ?? null,
      body: params.body,
      status: params.status,
      error_message: params.errorMessage ?? null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    })

    if (error) {
      console.warn('[logCustomerMessage] insert failed:', error)
    }
  } catch (err) {
    // Best-effort: swallow — an audit-write failure must never fail the
    // actual customer send.
    console.warn('[logCustomerMessage] swallowed write failure:', err)
  }
}
