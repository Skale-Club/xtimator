/**
 * Owner-facing reply language for the WhatsApp bot: the company default
 * (companies.default_estimate_language) through the shared per-estimate
 * language cascade, English-first fallback. Same resolution the welcome sequence
 * uses. Best-effort: any failure falls back to English. Never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveEstimateLanguage,
  type EstimateLanguage,
} from '@/lib/i18n/resolve-estimate-language'

export async function resolveOwnerLanguage(
  serviceClient: SupabaseClient,
  companyId: string
): Promise<EstimateLanguage> {
  try {
    const { data } = await serviceClient
      .from('companies')
      .select('default_estimate_language')
      .eq('id', companyId)
      .single()
    return resolveEstimateLanguage({
      companyDefault: (data?.default_estimate_language as EstimateLanguage | null) ?? null,
    })
  } catch {
    return 'en'
  }
}
