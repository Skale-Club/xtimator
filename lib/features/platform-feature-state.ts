import 'server-only'
import { getBillingConfig } from '@/lib/billing/billing-config'
import type { PlatformFeatureState } from '@/lib/features/company-features'

/**
 * Platform-wide feature state for `resolveCompanyFeatures`, read from
 * billing_config (editable in the admin panel, no deploy). Server-only: the
 * pure resolver takes the result as an argument.
 */
export async function getPlatformFeatureState(): Promise<PlatformFeatureState> {
  const { connectPaymentsOpen } = await getBillingConfig()
  return { connectPaymentsOpen: connectPaymentsOpen !== false }
}
