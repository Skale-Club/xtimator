import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { resolveRecipientZones } from '@/lib/notifications/timezone-derive'
import { isWithinQuietHours } from '@/lib/notifications/quiet-hours'

/**
 * Phase 176 Plan 04 (CUST-03 + CUST-04) — the ONE pre-send gate every
 * end-customer dispatch must call before hitting the send primitive.
 * Phase 177's sendCustomerEmail()/sendCustomerSms() and Phase 178's
 * agentic sendCustomerMessage() all call assertSendAllowed() and require
 * its success output (a SendPermit) as a typed argument to the actual
 * send call — so bypassing the gate becomes a TypeScript compile error,
 * not just a code-review convention.
 *
 * Composition order (LOAD-BEARING — do not reorder):
 *   1. clients row fetch, scoped by BOTH id AND company_id (explicit
 *      tenant-scope filter — this gate runs via service role, which
 *      bypasses RLS, so the company_id check must be in the query itself).
 *   2. Suppression (sms_opted_out_at) — cheapest, most legally decisive,
 *      checked first and unconditionally, for BOTH channels. A suppressed
 *      client is blocked no matter what consent/quiet-hours would
 *      otherwise say.
 *   3. channel === 'email' -> allowed immediately after suppression
 *      clears. Consent (isConsentSendable) and quiet-hours are SMS-only
 *      checks (see the channel branch below for the legal rationale) and
 *      are skipped entirely for email — no companies fetch, no timezone
 *      resolution.
 *   4. channel === 'sms' -> the pre-existing chain, unchanged:
 *      Consent (isConsentSendable) — checked before the timezone/quiet-
 *      hours work so a non-consented client never pays that cost — then
 *      Quiet hours — time-dependent, ordered LAST (a retry a few hours
 *      later could pass; no point resolving a timezone for a client
 *      already blocked by suppression/consent).
 *   5. All clear -> SendPermit.
 *
 * Never-throw discipline (mirrors lib/notifications/preferences.ts's
 * try/catch + console.warn-on-error shape): a DB read failure never
 * throws up to the caller and never defaults to allowed: true — it fails
 * closed.
 */

// Module-private brand key. NOT exported. TypeScript's structural typing
// means an external module can only produce a value with this exact
// property if it can reference this exact symbol — and it cannot, because
// the symbol itself is never exported. This is what makes "cannot be
// constructed outside this module" a real compile-time guarantee instead
// of a comment on a forgeable string-literal shape.
const SEND_PERMIT_TAG: unique symbol = Symbol('SendPermit')

export type SendChannel = 'sms' | 'email'

// Branded/opaque — cannot be constructed outside this module (no exported
// constructor other than assertSendAllowed itself). Phase 177's
// sendCustomerEmail()/sendCustomerSms() and Phase 178's agentic send path
// type their recipient parameter as SendPermit, not a bare clientId —
// calling the send primitive without first calling assertSendAllowed()
// becomes a TypeScript compile error.
export type SendPermit = {
  readonly [SEND_PERMIT_TAG]: true
  clientId: string
  channel: SendChannel
  grantedAt: string
}

function makePermit(clientId: string, channel: SendChannel): SendPermit {
  return {
    [SEND_PERMIT_TAG]: true,
    clientId,
    channel,
    grantedAt: new Date().toISOString(),
  }
}

export interface SendGateResult {
  allowed: boolean
  reason?:
    | 'suppressed'
    | 'no_consent'
    | 'quiet_hours'
    | 'unresolvable_timezone'
    | 'client_not_found'
  /** Present if and only if allowed === true. */
  permit?: SendPermit
}

/**
 * The ONE place Operational Decision #2 (whether consent-status 'unknown'
 * defaults to sendable) can be flipped after legal sign-off, without
 * touching assertSendAllowed's control flow.
 */
export const UNKNOWN_CONSENT_IS_SENDABLE = false

/**
 * Pure, independently-testable. 'granted' -> true always. 'revoked' ->
 * false ALWAYS, regardless of the flag (revocation is never silently
 * overridden). 'unknown' -> returns the flag's value (false by default =
 * blocked; true = sendable). Any other/unexpected status string -> false
 * (fail closed).
 */
export function isConsentSendable(
  status: string,
  unknownIsSendable: boolean = UNKNOWN_CONSENT_IS_SENDABLE,
): boolean {
  if (status === 'granted') return true
  if (status === 'revoked') return false
  if (status === 'unknown') return unknownIsSendable
  return false
}

interface ClientGateRow {
  sms_opted_out_at: string | null
  sms_consent_status: string
  state: string | null
  phone: string | null
}

interface CompanyGateRow {
  state: string | null
}

export async function assertSendAllowed(
  companyId: string,
  clientId: string,
  channel: SendChannel,
): Promise<SendGateResult> {
  try {
    const svc = requireServiceClient()

    // Tenant-scoped fetch — never trust a bare clientId without the
    // company_id filter explicit in the query (service role bypasses RLS).
    const { data: client, error: clientError } = await svc
      .from('clients')
      .select('sms_opted_out_at, sms_consent_status, state, phone')
      .eq('id', clientId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (clientError) {
      console.warn(
        '[notifications.customer-send-gate] clients read failed:',
        clientError.message,
      )
    }
    if (clientError || !client) {
      return { allowed: false, reason: 'client_not_found' }
    }
    const clientRow = client as unknown as ClientGateRow

    // 1. Suppression — cheapest, most legally decisive, checked first,
    // for BOTH channels. An opt-out is treated as a full contact opt-out
    // until a separate email-suppression signal exists (forward note: the
    // `clients.sms_*` columns are SMS-specific by name and schema intent
    // per the 176 migration header — a dedicated email-suppression column
    // should replace this read once email delivery events warrant one).
    if (clientRow.sms_opted_out_at) {
      return { allowed: false, reason: 'suppressed' }
    }

    // 2. Email branch: allowed immediately once suppression clears. The
    // SMS-specific consent check and quiet-hours resolution are
    // deliberately skipped — CAN-SPAM does not require prior opt-in for
    // transactional email, and there is no TCPA-style quiet-hours rule
    // for email. This is a documented interpretation, not a silent
    // assumption. Do NOT fetch `companies` here — that fetch exists only
    // to resolve a timezone for the SMS quiet-hours check below.
    if (channel === 'email') {
      return { allowed: true, permit: makePermit(clientId, channel) }
    }

    // 3. Consent (SMS only) — the wired isConsentSendable() branch, not a
    // hardcoded `!== 'granted'` comparison.
    if (!isConsentSendable(clientRow.sms_consent_status)) {
      return { allowed: false, reason: 'no_consent' }
    }

    // 4. Quiet hours (SMS only) — time-dependent, ordered last. Only
    // reached once suppression/consent have both cleared.
    const { data: company, error: companyError } = await svc
      .from('companies')
      .select('state')
      .eq('id', companyId)
      .maybeSingle()

    if (companyError) {
      // Non-fatal: companyState is just one of three resolution tiers —
      // fall through with null and let resolveRecipientZones() try the
      // client-state/area-code tiers before failing closed.
      console.warn(
        '[notifications.customer-send-gate] companies read failed:',
        companyError.message,
      )
    }
    const companyRow = company as unknown as CompanyGateRow | null

    const resolution = resolveRecipientZones({
      clientState: clientRow.state,
      clientPhone: clientRow.phone,
      companyState: companyRow?.state ?? null,
    })

    if (!resolution) {
      return { allowed: false, reason: 'unresolvable_timezone' }
    }

    if (!isWithinQuietHours(resolution.zones)) {
      return { allowed: false, reason: 'quiet_hours' }
    }

    // 5. All clear.
    return { allowed: true, permit: makePermit(clientId, channel) }
  } catch (e) {
    console.warn(
      '[notifications.customer-send-gate] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return { allowed: false, reason: 'client_not_found' }
  }
}
