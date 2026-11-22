import 'server-only'
import { cookies, headers } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { buildAcquisition } from '@/lib/marketing/signals'
import { queueMarketingConversion } from '@/lib/marketing/conversions/queue'

/**
 * Called from the FIRST-company signup path only (lib/actions/company.ts), like
 * the affiliate attribution: copies the visitor's marketing cookies onto the new
 * company (companies.acquisition) and queues the sign_up conversion, which stays
 * dormant until ads tracking is enabled in the admin panel.
 *
 * NEVER THROWS: attribution is a side effect and must not break onboarding.
 */
export async function recordSignupAcquisition(companyId: string): Promise<void> {
  try {
    const cookieStore = await cookies()
    const headerStore = await headers()
    const acquisition = buildAcquisition((name) => cookieStore.get(name)?.value, new Date(), {
      gpcHeader: headerStore.get('sec-gpc') === '1',
    })
    const svc = requireServiceClient()
    await svc.from('companies').update({ acquisition }).eq('id', companyId).is('acquisition', null)
    void queueMarketingConversion({ companyId, name: 'sign_up', eventId: `sign_up:${companyId}` })
  } catch (err) {
    console.warn(
      `[acquisition] could not record signup acquisition for ${companyId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
