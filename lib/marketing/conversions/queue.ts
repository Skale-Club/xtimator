import 'server-only'
import { inngest } from '@/lib/inngest/client'
import { EVENT_MARKETING_CONVERSION, type MarketingConversionPayload } from '@/lib/inngest/events'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Fire-and-forget: ask the marketing-conversion job to report a conversion.
 * The returned promise NEVER rejects; user flows and webhooks do not await it;
 * a queue hiccup must not break signup, generation or billing. Dedupe lives in
 * the job (marketing_conversions.event_id is unique) and in the Inngest event id.
 */
export function queueMarketingConversion(
  input: Omit<MarketingConversionPayload, 'occurredAt'> & { occurredAt?: string },
): Promise<void> {
  return (async () => {
    const denied = await assertCompanyWritable(input.companyId)
    if (denied) return
    await inngest.send({
      id: input.eventId,
      name: EVENT_MARKETING_CONVERSION,
      data: { ...input, occurredAt: input.occurredAt ?? new Date().toISOString() },
    })
  })().catch(() => undefined)
}

/**
 * The first AI estimate of a company, reported once. Checks the log first so
 * a busy account does not start a job run for every estimate it generates.
 */
export async function queueFirstEstimateConversion(companyId: string): Promise<void> {
  try {
    const eventId = `first_estimate:${companyId}`
    const svc = requireServiceClient()
    const { data } = await svc
      .from('marketing_conversions')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle()
    if (data) return
    await queueMarketingConversion({ companyId, name: 'first_estimate', eventId })
  } catch {
    /* never throws */
  }
}
