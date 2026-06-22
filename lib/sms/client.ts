import 'server-only'
import { getTwilioConfig } from '@/lib/platform-config'

/**
 * Phase 104 (NOTIF-04) — Twilio SMS send primitive.
 *
 * Extracted from the proven REST path in `app/api/estimates/[id]/send-sms/route.ts`
 * (URL + Basic auth + a From/To/Body urlencoded body). NO Twilio SDK — the
 * REST-over-`fetch` shape is the established repo convention.
 *
 * Contract (never-throw, best-effort):
 *   - Reads creds via `getTwilioConfig()`. If `null` (unconfigured) → returns
 *     `{ ok: false, error: 'twilio_unconfigured' }` WITHOUT calling fetch.
 *   - On a 2xx Twilio response → `{ ok: true, sid }`.
 *   - On a non-2xx response or a thrown fetch → `{ ok: false, error }`. Never throws.
 *
 * Secrets stay in `platform_integrations` (encrypted, admin-managed) — read only
 * via `getTwilioConfig()`. NO secret literals here.
 */

export interface SendSmsResult {
  ok: boolean
  sid?: string
  error?: string
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  const twilio = await getTwilioConfig()
  if (!twilio) {
    return { ok: false, error: 'twilio_unconfigured' }
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`
    const credentials = Buffer.from(
      `${twilio.accountSid}:${twilio.authToken}`,
    ).toString('base64')

    const formData = new URLSearchParams()
    formData.set('From', twilio.fromPhone)
    formData.set('To', to)
    formData.set('Body', body)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string
      message?: string
    }

    if (!res.ok) {
      return { ok: false, error: data.message ?? `twilio_${res.status}` }
    }
    return { ok: true, sid: data.sid }
  } catch (e) {
    console.warn(
      '[sms.client] send failed:',
      e instanceof Error ? e.message : String(e),
    )
    return { ok: false, error: 'send_failed' }
  }
}
