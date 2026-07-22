import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import type { SendChannel, SendPermit } from '@/lib/notifications/customer-send-gate'
import { sendCustomerEmail } from '@/lib/email/customer-emails'
import { sendCustomerSms } from '@/lib/sms/client'
import { resolveCustomerCopy } from '@/lib/notifications/customer-template-resolver'
import { logCustomerMessage } from '@/lib/notifications/customer-message-log'
import type { CustomerEventType, CustomerCopyContext } from '@/lib/notifications/customer-copy'

/**
 * Phase 177 Plan 06 (CUST-01/02/05) — the ONE neutral orchestrator every
 * end-customer send funnels through: 177-07's legacy send-sms route
 * migration (this milestone) and Phase 178's agentic WhatsApp/MCP paths
 * (next milestone) both call this and only this function.
 *
 * `params.permit` is typed as `SendPermit` (customer-send-gate.ts's
 * unconstructable-outside-that-module branded type) — a caller cannot
 * reach dispatch without first calling assertSendAllowed() and obtaining
 * a real permit. This module imports SendChannel/SendPermit as TYPES ONLY;
 * it has no business calling assertSendAllowed() itself.
 *
 * LOAD-BEARING flow order (mirrors the plan's interfaces block exactly):
 *   1. permit.clientId !== params.clientId -> permit_client_mismatch.
 *      Caller bug, not a customer send attempt — no DB fetch, no dispatch,
 *      no audit log.
 *   2. Neither template nor freeform supplied -> no_content. Same
 *      no-log discipline as step 1.
 *   3. Fetch the client's email/phone/name, tenant-scoped by
 *      (id = clientId AND company_id = companyId) — service client,
 *      mirrors the tenant-scope defense-in-depth already established in
 *      customer-send-gate.ts (service role bypasses RLS, so the
 *      company_id filter must live in the query itself).
 *   4. Missing the channel-appropriate recipient field (email for
 *      'email', phone for 'sms') -> no_recipient_email / no_recipient_phone.
 *      Neither of these logs — no dispatch was attempted.
 *   5. Resolve subject/body: template mode calls resolveCustomerCopy();
 *      freeform mode uses the caller-supplied subject/body as-is, WITH
 *      ONE adopted deviation from the plan's literal text (Wave-2
 *      decision, applied here): an SMS freeform body gets the business
 *      name PREPENDED (`${businessName}: ${body}`) so CUST-02's "the
 *      tenant's business name leads the body" holds on BOTH the
 *      templated path (buildCustomerCopy's 'estimate.sent' SMS copy
 *      already opens with the business name) and the freeform path —
 *      a tenant typing a custom SMS today has no other channel-native way
 *      to identify themselves to the recipient. Freeform EMAIL is left
 *      untouched: the friendly-from (`{{business}} via Xtimator`,
 *      177-04) already carries that identity in the one place email
 *      recipients actually see it (the From line), so prepending the
 *      body there would just duplicate it.
 *   6. Dispatch: 'email' -> sendCustomerEmail() (html = resolved body,
 *      text = stripHtmlTags(body) so Resend always gets a sane
 *      plain-text alternative even when body is 177-05's HTML fallback
 *      copy). 'sms' -> sendCustomerSms(client.phone, body).
 *   7. logCustomerMessage() runs for EVERY step-6 dispatch attempt,
 *      success or failure. Steps 1/2/4 never reach this line.
 *   8. Return { ok, channel, providerMessageId, error }.
 *
 * Never throws — the whole function is wrapped in try/catch; an
 * unexpected exception anywhere in the flow resolves
 * { ok: false, channel: permit.channel, error: 'unexpected_error' }.
 */

export type TriggerSource = 'manual' | 'agentic-whatsapp' | 'agentic-mcp'

export interface SendCustomerMessageParams {
  permit: SendPermit
  companyId: string
  /** MUST equal permit.clientId — checked, not assumed (defense-in-depth
   * against a caller passing a permit granted for a different client). */
  clientId: string
  businessName: string
  triggerSource: TriggerSource
  /** Exactly one of template | freeform must be provided. */
  template?: { eventType: CustomerEventType; vars: CustomerCopyContext }
  freeform?: { subject?: string; body: string }
}

export interface SendCustomerMessageResult {
  ok: boolean
  channel: SendChannel
  providerMessageId?: string
  error?: string
}

interface ClientContactRow {
  email: string | null
  phone: string | null
  name: string | null
}

interface DispatchResult {
  ok: boolean
  id?: string
  sid?: string
  error?: string
}

/** Module-private. `html.replace(...)` — strips tags, collapses whitespace,
 * trims — so Resend always gets a non-empty plain-text alternative even
 * when `body` is 177-05's HTML fallback copy. */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function sendCustomerMessage(
  params: SendCustomerMessageParams,
): Promise<SendCustomerMessageResult> {
  const channel = params.permit.channel

  try {
    // 1. Defense-in-depth: the permit must have been granted for THIS call's
    // declared client, not merely some client.
    if (params.permit.clientId !== params.clientId) {
      return { ok: false, channel, error: 'permit_client_mismatch' }
    }

    // 2. Exactly one content source is required.
    if (!params.template && !params.freeform) {
      return { ok: false, channel, error: 'no_content' }
    }

    // 3. Tenant-scoped client contact fetch.
    const svc = requireServiceClient()
    const { data: client, error: clientError } = await svc
      .from('clients')
      .select('email, phone, name')
      .eq('id', params.clientId)
      .eq('company_id', params.companyId)
      .maybeSingle()

    if (clientError) {
      console.warn('[customer-send] clients read failed:', clientError.message)
    }
    const clientRow = client as unknown as ClientContactRow | null

    // 4. Channel-appropriate recipient must be on file.
    if (channel === 'email' && !clientRow?.email) {
      return { ok: false, channel, error: 'no_recipient_email' }
    }
    if (channel === 'sms' && !clientRow?.phone) {
      return { ok: false, channel, error: 'no_recipient_phone' }
    }

    // 5. Resolve subject/body.
    let subject: string | undefined
    let body: string

    if (params.template) {
      const resolved = await resolveCustomerCopy(params.template.eventType, channel, {
        ...params.template.vars,
        businessName: params.template.vars.businessName ?? params.businessName,
        clientName: params.template.vars.clientName ?? clientRow?.name ?? undefined,
      })
      subject = resolved.subject
      body = resolved.body
    } else {
      subject = params.freeform!.subject
      body =
        channel === 'sms'
          ? `${params.businessName}: ${params.freeform!.body}`
          : params.freeform!.body
    }

    // 6. Dispatch.
    let dispatchResult: DispatchResult
    if (channel === 'email') {
      dispatchResult = await sendCustomerEmail({
        toEmail: clientRow!.email!,
        toName: clientRow?.name ?? null,
        businessName: params.businessName,
        subject: subject ?? `A message from ${params.businessName}`,
        html: body,
        text: stripHtmlTags(body),
      })
    } else {
      dispatchResult = await sendCustomerSms(clientRow!.phone!, body)
    }

    // 7. Unconditional audit log — every real dispatch attempt, success or
    // failure.
    await logCustomerMessage({
      companyId: params.companyId,
      clientId: params.clientId,
      channel,
      recipientEmail: channel === 'email' ? (clientRow?.email ?? null) : null,
      recipientPhone: channel === 'sms' ? (clientRow?.phone ?? null) : null,
      provider: channel === 'email' ? 'resend' : 'twilio',
      providerMessageId: dispatchResult.id ?? dispatchResult.sid ?? null,
      isTemplate: Boolean(params.template),
      templateEventType: params.template?.eventType ?? null,
      triggerSource: params.triggerSource,
      subject: subject ?? null,
      body,
      status: dispatchResult.ok ? 'sent' : 'failed',
      errorMessage: dispatchResult.ok ? null : (dispatchResult.error ?? null),
    })

    // 8. Result.
    return {
      ok: dispatchResult.ok,
      channel,
      providerMessageId: dispatchResult.id ?? dispatchResult.sid,
      error: dispatchResult.error,
    }
  } catch (e) {
    console.warn(
      '[customer-send] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return { ok: false, channel, error: 'unexpected_error' }
  }
}
