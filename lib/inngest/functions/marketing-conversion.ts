/**
 * Ads tracking (2026-11-21) — report one conversion server-side to GA4
 * (Measurement Protocol) and Meta (Conversions API).
 *
 * DORMANT until an admin saves the keys AND turns on "Send conversions" in
 * /admin/integrations → Ads & Analytics. Until then every request is still
 * recorded in marketing_conversions (status 'disabled'), which also keeps the
 * "first estimate" check cheap and stops any conversion being counted twice.
 *
 * Consent: decided per conversion from companies.acquisition (captured at
 * signup) under the admin consent policy; rejection and GPC always win
 * (lib/marketing/signals.ts consentAllows).
 *
 * Secrets never leave a step: each step reads the config itself and returns
 * only a status string, so Inngest's step history never stores a key.
 */
import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'
import { EVENT_MARKETING_CONVERSION, type MarketingConversionPayload } from '@/lib/inngest/events'
import { getAdsTrackingConfig } from '@/lib/marketing/conversions/config'
import {
  buildGa4Payload,
  buildMetaPayload,
  type ConversionInput,
} from '@/lib/marketing/conversions/payloads'
import { readAcquisition } from '@/lib/marketing/signals'

const SITE = 'https://xtimator.com'
const SOURCE_PATH: Record<MarketingConversionPayload['name'], string> = {
  sign_up: '/onboarding',
  first_estimate: '/projects',
  purchase: '/settings/billing',
}

type Status = 'sent' | 'disabled' | 'no_consent' | 'no_browser_id' | 'error'

/** Retryable failure (network, 5xx, 429): Inngest retries the step. */
class RetryableSendError extends Error {}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; text: string }> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    throw new RetryableSendError(`network: ${err instanceof Error ? err.message : String(err)}`)
  }
  const text = (await res.text().catch(() => '')).slice(0, 300)
  if (res.status >= 500 || res.status === 429) throw new RetryableSendError(`http ${res.status}`)
  return { ok: res.ok, status: res.status, text }
}

async function loadInput(data: MarketingConversionPayload) {
  const svc = requireServiceClient()
  const { data: company } = await svc
    .from('companies')
    .select('id, email, phone, acquisition')
    .eq('id', data.companyId)
    .maybeSingle()
  const row = company as { email?: string | null; phone?: string | null; acquisition?: unknown } | null
  const input: ConversionInput = {
    name: data.name,
    eventId: data.eventId,
    companyId: data.companyId,
    occurredAt: new Date(Date.parse(data.occurredAt) || Date.now()),
    value: data.value ?? null,
    currency: data.currency ?? null,
    sourceUrl: SITE + SOURCE_PATH[data.name],
    email: row?.email ?? null,
    phone: row?.phone ?? null,
  }
  return { input, acquisition: readAcquisition(row?.acquisition) }
}

export const marketingConversionJob = inngest.createFunction(
  {
    id: 'marketing-conversion',
    retries: 4,
    triggers: [{ event: EVENT_MARKETING_CONVERSION }],
  },
  async ({ event, step }) => {
    const data = event.data as MarketingConversionPayload
    if (!data?.companyId || !data.eventId || !data.name) return { skipped: true, reason: 'bad_payload' as const }
    const denied = await assertCompanyWritable(data.companyId)
    if (denied) return { skipped: true, reason: 'demo_readonly' as const }

    // 1. Record the request. An already-processed event_id is a duplicate.
    const fresh = await step.run('record', async () => {
      const svc = requireServiceClient()
      const { data: existing } = await svc
        .from('marketing_conversions')
        .select('processed_at')
        .eq('event_id', data.eventId)
        .maybeSingle()
      if (existing?.processed_at) return false
      if (!existing) {
        const { error } = await svc.from('marketing_conversions').insert({
          company_id: data.companyId,
          event_name: data.name,
          event_id: data.eventId,
          value: data.value ?? null,
          currency: data.currency ?? null,
        })
        // 23505: a concurrent run inserted it first; let that run own it.
        if (error) return error.code === '23505' ? false : Promise.reject(new Error(error.message))
      }
      return true
    })
    if (!fresh) return { skipped: true, reason: 'duplicate' as const }

    // 2. GA4 Measurement Protocol.
    const ga4 = await step.run('send-ga4', async (): Promise<{ status: Status; error?: string }> => {
      const config = await getAdsTrackingConfig()
      if (!config.ga4) return { status: 'disabled' }
      const { input, acquisition } = await loadInput(data)
      const built = buildGa4Payload(input, acquisition, config.consentPolicy)
      if ('skip' in built) return { status: built.skip }
      const url =
        `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(config.ga4.measurementId)}` +
        `&api_secret=${encodeURIComponent(config.ga4.apiSecret)}`
      const res = await postJson(url, built.body)
      return res.ok ? { status: 'sent' } : { status: 'error', error: `ga4 http ${res.status}` }
    })

    // 3. Meta Conversions API.
    const meta = await step.run('send-meta', async (): Promise<{ status: Status; error?: string }> => {
      const config = await getAdsTrackingConfig()
      if (!config.meta) return { status: 'disabled' }
      const { input, acquisition } = await loadInput(data)
      const built = buildMetaPayload(input, acquisition, config.consentPolicy, {
        testEventCode: config.meta.testEventCode,
      })
      if ('skip' in built) return { status: built.skip }
      const url =
        `https://graph.facebook.com/${config.meta.graphVersion}/${encodeURIComponent(config.meta.datasetId)}/events` +
        `?access_token=${encodeURIComponent(config.meta.accessToken)}`
      const res = await postJson(url, built.body)
      // The response body may echo request details, never the token: keep a short excerpt.
      return res.ok ? { status: 'sent' } : { status: 'error', error: `meta http ${res.status}: ${res.text.slice(0, 200)}` }
    })

    // 4. Store the outcome.
    await step.run('finish', async () => {
      const svc = requireServiceClient()
      const error = [ga4.error, meta.error].filter(Boolean).join(' | ') || null
      await svc
        .from('marketing_conversions')
        .update({
          ga4_status: ga4.status,
          meta_status: meta.status,
          error,
          processed_at: new Date().toISOString(),
        })
        .eq('event_id', data.eventId)
    })

    return { ga4: ga4.status, meta: meta.status }
  },
)
