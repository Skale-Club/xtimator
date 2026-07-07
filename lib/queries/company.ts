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
  industries: string[] | null
  brand_primary_color: string | null
  logo_url: string | null
  currency_code: string
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
  /** Phase 52: company-level default estimate language. Null means 'en' (English first). */
  default_estimate_language: string | null
  /** Visual design template for PDF/share rendering. See lib/estimate/templates/registry.ts. */
  estimate_template_style: string
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
  estimate_terms_enabled: boolean
  estimate_terms_text: string | null
} | null> {
  const { data } = await supabase
    .from('companies')
    .select('id, estimate_template_greeting, estimate_template_opener, estimate_template_closer, estimate_template_signature, estimate_terms_enabled, estimate_terms_text')
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

export interface TradeSuggestion {
  suggestedTrade: string
  occurrences: number
}

/**
 * QUICK-psh-03 — Settings -> Company one-tap primary-trade suggestion.
 *
 * Reads the last 5 (or fewer) `trade_mismatch_detected` estimate_activity rows
 * for the company (lib/services/generate-estimate.ts writes these — QUICK-mv1-01
 * — when a KEPT generation's AI-detected trade differs from companies.industry),
 * newer than any prior dismissal (`companies.trade_suggestion_dismissed_at` —
 * QUICK-psh-03's durable-dismiss fallback: no lightweight per-company settings
 * blob exists to reuse, and estimate_activity rows require a project_id so a
 * company-level dismissal marker doesn't fit there).
 *
 * Returns a suggestion only when >= 3 of those rows agree on the SAME detected
 * trade AND it still differs from the company's CURRENT industry (re-checked
 * here — industry may have changed since some of the rows were written).
 * Returns null on no-signal, a fresh dismissal, or any read failure (never
 * throws — a suggestion-read hiccup must never break the Settings page).
 */
export async function getTradeSuggestion(
  supabase: SupabaseClient,
  companyId: string
): Promise<TradeSuggestion | null> {
  try {
    const { data: companyRow } = await supabase
      .from('companies')
      .select('industry, trade_suggestion_dismissed_at')
      .eq('id', companyId)
      .maybeSingle()

    const industry =
      (companyRow as { industry?: string | null } | null)?.industry
        ?.trim()
        .toLowerCase() || null
    const dismissedAt =
      (companyRow as { trade_suggestion_dismissed_at?: string | null } | null)
        ?.trade_suggestion_dismissed_at ?? null

    let query = supabase
      .from('estimate_activity')
      .select('metadata, created_at')
      .eq('company_id', companyId)
      .eq('event_type', 'trade_mismatch_detected')
    if (dismissedAt) {
      // A prior dismissal silences the pattern that existed at dismiss time —
      // only rows recorded AFTER it count toward a fresh suggestion.
      query = query.gt('created_at', dismissedAt)
    }

    const { data: rows } = await query
      .order('created_at', { ascending: false })
      .limit(5)

    const mismatchRows = (rows ?? []) as {
      metadata: { detected?: string } | null
      created_at: string
    }[]
    if (mismatchRows.length < 3) return null

    const counts = new Map<string, number>()
    for (const row of mismatchRows) {
      const detected = row.metadata?.detected?.trim().toLowerCase()
      if (!detected) continue
      counts.set(detected, (counts.get(detected) ?? 0) + 1)
    }

    let topTrade: string | null = null
    let topCount = 0
    for (const [trade, count] of counts) {
      if (count > topCount) {
        topTrade = trade
        topCount = count
      }
    }

    if (!topTrade || topCount < 3) return null
    if (industry && topTrade === industry) return null

    return { suggestedTrade: topTrade, occurrences: topCount }
  } catch (err) {
    console.warn('[getTradeSuggestion] swallowed read failure:', err)
    return null
  }
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
