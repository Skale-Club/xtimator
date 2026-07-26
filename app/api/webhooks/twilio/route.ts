import { requireServiceClient } from '@/lib/supabase/service'
import { getTwilioConfig } from '@/lib/platform-config'
import { verifyTwilioSignature } from '@/lib/sms/verify-webhook'
import { classifyInboundKeyword } from '@/lib/sms/inbound-keywords'
import { resolveBaseUrl } from '@/lib/utils/site-url'
import { assertCompanyWritable } from '@/lib/demo/guard'

/**
 * Inbound Twilio SMS webhook (CUST-03) — the ONLY mechanism by which a real
 * STOP/START/HELP reply from an end customer ever reaches Xtimator's own
 * suppression state (clients.sms_opted_out_at / sms_consent_status). Twilio's
 * own carrier-level Advanced Opt-Out block is real but NOT queryable by this
 * app (176-RESEARCH.md Pitfall 10) — without this route, the pre-send
 * suppression gate (176-04) would have no data to ever return suppressed.
 *
 * No GET handler — unlike the WhatsApp webhook's hub.challenge dance, Twilio
 * has no verification handshake for a plain "A Message Comes In" webhook.
 *
 * Twilio POSTs application/x-www-form-urlencoded, NOT JSON.
 *
 * OPERATIONAL RUNBOOK NOTE: whatever URL is configured in the Twilio Console
 * as the number's/Messaging Service's "A Message Comes In" webhook MUST
 * byte-match `resolveBaseUrl(request) + '/api/webhooks/twilio'` in
 * production. If APP_ORIGIN/NEXT_PUBLIC_SITE_URL ever changes, the Twilio
 * Console webhook URL must be updated to match, or signature verification
 * silently fails 100% of the time from that point on (see 176-05-SUMMARY.md).
 */
export async function POST(request: Request) {
  // Step 1: raw body FIRST — needed byte-exact to build the signing string.
  const rawBody = await request.text()
  const signature = request.headers.get('x-twilio-signature')

  // Step 3: the Coolify reverse-proxy URL fix. `request.url` resolves to the
  // internal bind address (https://0.0.0.0:3000) behind Coolify, never the
  // public domain Twilio actually signed against — see lib/utils/site-url.ts's
  // own documented incident. Do NOT use request.url/request.nextUrl here.
  const url = `${resolveBaseUrl(request)}/api/webhooks/twilio`

  // Step 4: fail closed if Twilio isn't configured at all — can't validate a
  // signature without an auth token. Distinct branch from a bad signature,
  // same outcome (401, logged, never silent).
  const twilio = await getTwilioConfig()
  if (!twilio) {
    console.warn('[Twilio] webhook rejected: Twilio not configured')
    return new Response('Unauthorized', { status: 401 })
  }

  // Step 5: form-decoded params — Twilio signs the exact key/value pairs it
  // POSTed, not JSON.
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  // Step 6: signature verification — the security boundary. A forged POST is
  // rejected here, before any DB access is attempted, and the rejection is
  // logged (never the raw signature or auth token — just presence/absence).
  if (!verifyTwilioSignature(url, params, signature, twilio.authToken)) {
    console.warn('[Twilio] webhook signature rejected', { hasSignature: Boolean(signature) })
    return new Response('Unauthorized', { status: 401 })
  }

  // Steps 7-12: DB mutation phase. Never-throw — an internal error here must
  // still return 200 so Twilio doesn't retry-storm us on our own logic bugs
  // (Twilio retries non-2xx responses at-least-once).
  try {
    const svc = requireServiceClient()

    const body = params.Body ?? ''
    const from = params.From ?? ''
    const messageSid = params.MessageSid ?? ''

    // Idempotency: Twilio delivers at-least-once, so the same MessageSid can
    // arrive twice. Check-then-insert has a benign TOCTOU race under
    // concurrent redelivery of the same MessageSid (two overlapping requests
    // could both pass this check before either insert lands) — accepted
    // because the downstream `clients` mutations below are themselves
    // idempotent (re-applying sms_opted_out_at = now() / sms_consent_status
    // = 'revoked' is a no-op in effect), so the only consequence of the race
    // is an occasional duplicate client_message_events audit row, never
    // incorrect suppression/consent state. Not closed with a DB unique
    // constraint per 176-01's documented NULLs-are-distinct limitation for
    // unresolved (company_id IS NULL) rows.
    const { data: existingEvent } = await svc
      .from('client_message_events')
      .select('id')
      .eq('twilio_message_sid', messageSid)
      .limit(1)
    if (existingEvent && existingEvent.length > 0) {
      return new Response('OK', { status: 200 })
    }

    const keyword = classifyInboundKeyword(body)

    // Phone matching via the STORED phone_normalized generated column
    // (176-01) — a single indexed last-10-digit equality, not a fragile
    // 3-candidate exact-string match. Sender-agnostic: matches EVERY client
    // row across EVERY company, since the dedicated Messaging Service is
    // shared platform-wide.
    const digits = from.replace(/\D/g, '')
    const last10 = digits.slice(-10)
    const { data: matchRows } = await svc
      .from('clients')
      .select('id, company_id, sms_consent_status')
      .eq('phone_normalized', last10)
    const matches = matchRows ?? []
    const writableMatches: typeof matches = []
    for (const match of matches) {
      const demoBlocked = await assertCompanyWritable(match.company_id as string)
      if (!demoBlocked) writableMatches.push(match)
    }
    if (matches.length > 0 && writableMatches.length === 0) {
      return new Response('OK', { status: 200 })
    }

    if (keyword === 'stop') {
      // Unconditional per-row suppression across every matched company.
      for (const match of writableMatches) {
        await svc
          .from('clients')
          .update({
            sms_opted_out_at: new Date().toISOString(),
            sms_consent_status: 'revoked',
          })
          .eq('id', match.id)
      }
    } else if (keyword === 'start') {
      for (const match of writableMatches) {
        // Always clear suppression. Only restore 'granted' when the prior
        // status was 'revoked' (a true re-opt-in) — a bare START keyword is
        // NOT itself an affirmative consent event for a relationship that
        // never had consent recorded, so an 'unknown' row stays 'unknown'
        // (never manufacture consent). Already-'granted' rows (defensive,
        // shouldn't normally co-occur with sms_opted_out_at set) are left
        // untouched aside from clearing suppression.
        const payload: Record<string, unknown> = { sms_opted_out_at: null }
        if (match.sms_consent_status === 'revoked') {
          payload.sms_consent_status = 'granted'
          payload.sms_consent_method = 'explicit_opt_in'
          payload.sms_consent_recorded_at = new Date().toISOString()
        }
        await svc.from('clients').update(payload).eq('id', match.id)
      }
    }
    // 'help' | 'other': no clients mutation at all (Operational Decision #4).

    // Never-drop: every inbound event is logged, fanned out one row per
    // matched company, or a single unresolved row (client_id/company_id
    // null) when the phone matches no client anywhere — never silently
    // dropped, regardless of keyword type.
    const events =
      writableMatches.length > 0
        ? writableMatches.map((match) => ({
            company_id: match.company_id,
            client_id: match.id,
            from_phone: from,
            keyword_type: keyword,
            raw_body: body,
            twilio_message_sid: messageSid,
          }))
        : [
            {
              company_id: null,
              client_id: null,
              from_phone: from,
              keyword_type: keyword,
              raw_body: body,
              twilio_message_sid: messageSid,
            },
          ]
    await svc.from('client_message_events').insert(events)

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[Twilio] webhook processing error:', err)
    return new Response('OK', { status: 200 })
  }
}
