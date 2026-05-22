'use server'

import { createClient } from '@/lib/supabase/server'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/lib/money/currency'

interface CompanyFormData {
  companyName?: string
  ownerName?: string
  phone?: string
  email?: string
  website?: string
  industry?: string
  customIndustry?: string
  brandPrimaryColor?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  licenseNumber?: string
  insuranceInfo?: string
  defaultTaxRate?: number
  defaultPaymentTerms?: string
  defaultWarrantyTerms?: string
  defaultValidityDays?: number
  logoUrl?: string
  language?: string
  currencyCode?: string
}

export async function createOrUpdateCompany(data: CompanyFormData) {
  const supabase = await createClient()

  // Auth validation using getClaims() pattern (not getSession)
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  // Resolve industry: if "other", use customIndustry value
  const resolvedIndustry =
    data.industry === 'other' ? data.customIndustry : data.industry

  // Build the row object mapping form fields to DB columns
  const row = {
    user_id: claims.sub,
    name: data.companyName || 'My Company',
    owner_name: data.ownerName || null,
    phone: data.phone || null,
    email: data.email || null,
    website: data.website || null,
    industry: resolvedIndustry || null,
    brand_primary_color: data.brandPrimaryColor || SYSTEM_COLORS.primary,
    logo_url: data.logoUrl || null,
    address: data.address || null,
    city: data.city || null,
    state: data.state || null,
    zip: data.zip || null,
    license_number: data.licenseNumber || null,
    insurance_info: data.insuranceInfo || null,
    default_tax_rate: data.defaultTaxRate ?? 0,
    default_payment_terms: data.defaultPaymentTerms || 'Net 30',
    default_warranty_terms: data.defaultWarrantyTerms || '1 year',
    default_validity_days: data.defaultValidityDays ?? 30,
    default_estimate_language: data.language && data.language !== 'en' ? data.language : null,
    currency_code: normalizeCurrencyCode(data.currencyCode ?? DEFAULT_CURRENCY_CODE),
  }

  // SELECT-then-INSERT/UPDATE pattern (Pitfall 6: no UNIQUE constraint on user_id)
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (existing) {
    // Update existing company
    const { error } = await supabase
      .from('companies')
      .update(row)
      .eq('id', existing.id)

    if (error) {
      return {
        error:
          'Could not save your company details. Please check your connection and try again.',
      }
    }
  } else {
    // Insert new company
    // TIER-04: new companies start with a 14-day trial clock.
    // tier itself uses the DB DEFAULT 'free' — no need to pass it explicitly.
    // tier_trial_ends_at is set ONLY in INSERT, never in UPDATE, to avoid resetting on settings saves.
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    const { error } = await supabase.from('companies').insert({
      ...row,
      tier_trial_ends_at: trialEndsAt.toISOString(),
    })

    if (error) {
      return {
        error:
          'Could not save your company details. Please check your connection and try again.',
      }
    }
  }

  // Set a short-lived non-httpOnly cookie so TourProvider can detect onboarding completion client-side
  const cookieStore = await cookies()
  cookieStore.set('onboarding_complete', '1', {
    httpOnly: false,  // MUST be false — TourProvider reads via document.cookie
    maxAge: 60,       // 60s TTL — enough for the redirect + hydration
    path: '/',
    sameSite: 'lax',
  })

  redirect('/dashboard')
}
