import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompanySettings {
  id: string
  user_id: string
  name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  license_number: string | null
  insurance_info: string | null
  industry: string | null
  brand_primary_color: string | null
  logo_url: string | null
  default_tax_rate: number
  default_payment_terms: string | null
  default_warranty_terms: string | null
  default_validity_days: number
  notify_on_view: boolean
  notify_on_accept: boolean
  notify_on_decline: boolean
  digital_signature_enabled: boolean
  estimate_terms_enabled: boolean
  estimate_terms_text: string | null
  email_delivery_enabled: boolean
  sms_delivery_enabled: boolean
  created_at: string
  updated_at: string
  estimate_template_greeting: string | null
  estimate_template_opener: string | null
  estimate_template_closer: string | null
  estimate_template_signature: string | null
}

export async function getCompanySettings(
  supabase: SupabaseClient,
  userId: string
): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', userId)
    .single()

  return (data as CompanySettings) ?? null
}

/**
 * Fetch only the 4 estimate-template columns for a user's company.
 * Uses createClient() directly (NOT getCachedCompany) — see RESEARCH Pitfall 2.
 * Called by the /settings/estimate-templates server component page.
 */
export async function getEstimateTemplateSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  id: string
  estimate_template_greeting: string | null
  estimate_template_opener: string | null
  estimate_template_closer: string | null
  estimate_template_signature: string | null
} | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature')
    .eq('user_id', userId)
    .single()

  return data ?? null
}

/**
 * Fetch only the custom_domain column for a user's company.
 * Per STATE.md Phase 24: use focused query, not getCompanySettings / select('*').
 */
export async function getCustomDomainSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; custom_domain: string | null } | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, custom_domain')
    .eq('user_id', userId)
    .single()

  return data ?? null
}

/**
 * Fetch the tier and trial expiry for a user's company.
 * Used by Phase 56 checkQuota() and Phase 57 enforcement.
 * Focused query — does not pull all 25+ company columns (anti-pattern: select('*')).
 */
export async function getCompanyTier(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; tier: string; tier_trial_ends_at: string | null } | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, tier, tier_trial_ends_at')
    .eq('user_id', userId)
    .single()

  return data ?? null
}
