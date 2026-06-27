'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { cookies } from 'next/headers'
import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } from '@/lib/money/currency'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
  getActiveCompanyId,
} from '@/lib/queries/active-company'
import { sendWelcomeEmail } from '@/lib/email/account-emails'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'
import { seedIndustryPriceBook } from '@/lib/price-book-seed'
import { getDefaultTaxRate } from '@/lib/tax-rates'
import { resolveIndustries } from '@/lib/industries'

interface CompanyFormData {
  companyName?: string
  subdomain?: string
  ownerName?: string
  phone?: string
  email?: string
  website?: string
  industries?: string[]
  customIndustries?: string[]
  prefillPriceBook?: boolean
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

export interface CreateOrUpdateCompanyOptions {
  /**
   * Phase 79 — D-12 / D-13:
   *  - 'first' (default) — Phase 2 onboarding flow. SELECT-then-INSERT/UPDATE. Preserved bit-for-bit.
   *  - 'add' — Phase 80 add-company flow. Always INSERT (no UPDATE). After insert:
   *      1. Write a company_members row (user_id, new_company_id, 'owner').
   *      2. Set the `active_company_id` cookie to the new company's id.
   *      3. Inherit `tier` and `tier_trial_ends_at` from the user's PREVIOUS active company
   *         (D-14, D-15) — no fresh trial for trial-farmers.
   */
  mode?: 'first' | 'add'
}

export async function createOrUpdateCompany(
  data: CompanyFormData,
  options?: CreateOrUpdateCompanyOptions
) {
  const mode = options?.mode ?? 'first'
  const supabase = await createClient()

  // T-79-03-01: re-verify auth.uid() at the top. user_id in INSERTs is sourced
  // from claims.sub — never from a parameter.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  // Resolve services: replace the 'other' sentinel with the custom text and
  // dedupe. `industry` (singular) keeps the primary (= industries[0]) for
  // backward-compat readers: tax-rate defaults + the AI prompt builder.
  const resolvedIndustries = resolveIndustries([
    ...(data.industries ?? []),
    ...(data.customIndustries ?? []),
  ])
  const primaryIndustry = resolvedIndustries[0] ?? null

  // Smart-fill the default tax rate from state + service type when the caller
  // didn't supply one (onboarding no longer asks for tax). Editable later in
  // Settings → Defaults.
  const autoTaxRate = getDefaultTaxRate(primaryIndustry, data.state)

  // Build the row object mapping form fields to DB columns
  const row = {
    user_id: claims.sub,
    name: data.companyName || 'My Company',
    subdomain: data.subdomain ? data.subdomain.toLowerCase() : null,
    owner_name: data.ownerName || null,
    phone: data.phone || null,
    email: data.email || null,
    website: data.website || null,
    industry: primaryIndustry,
    industries: resolvedIndustries,
    brand_primary_color: data.brandPrimaryColor || SYSTEM_COLORS.primary,
    logo_url: data.logoUrl || null,
    address: data.address || null,
    city: data.city || null,
    state: data.state || null,
    zip: data.zip || null,
    license_number: data.licenseNumber || null,
    insurance_info: data.insuranceInfo || null,
    default_tax_rate: data.defaultTaxRate ?? autoTaxRate ?? 0,
    default_payment_terms: data.defaultPaymentTerms || 'Net 30',
    default_warranty_terms: data.defaultWarrantyTerms || '1 year',
    default_validity_days: data.defaultValidityDays ?? 30,
    default_estimate_language: data.language && data.language !== 'en' ? data.language : null,
    currency_code: normalizeCurrencyCode(data.currencyCode ?? DEFAULT_CURRENCY_CODE),
  }

  if (mode === 'add') {
    // D-13: 'add' mode is unconditional INSERT. We do NOT SELECT first.
    // D-14 / D-15: resolve the "source" company for tier/trial inheritance.
    const sourceCompanyId = await getActiveCompanyId()
    let inheritedTier: string | undefined
    let inheritedTrialEndsAt: string | null | undefined

    if (sourceCompanyId) {
      const { data: source } = await supabase
        .from('companies')
        .select('tier, tier_trial_ends_at')
        .eq('id', sourceCompanyId)
        .single()

      if (source) {
        inheritedTier = source.tier as string
        // D-15: copy literal value — past, future, or null. Never fresh.
        inheritedTrialEndsAt = (source.tier_trial_ends_at as string | null) ?? null
      }
    }

    // Build INSERT row. If we resolved a source, spread inheritance.
    // Otherwise fall back to TIER-04 default (fresh 14-day trial) — degenerate path,
    // realistically only tests trigger this; Phase 80 UI requires a source company.
    //
    // Phase 85: companies.user_id stays NOT NULL until v5+ drops the column.
    // INSERT WITH CHECK still requires (user_id = auth.uid()). Set it explicitly to claims.sub.
    const insertRow: Record<string, unknown> = { ...row, user_id: claims.sub }
    if (inheritedTier !== undefined) {
      insertRow.tier = inheritedTier
      insertRow.tier_trial_ends_at = inheritedTrialEndsAt
    } else {
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 14)
      insertRow.tier_trial_ends_at = trialEndsAt.toISOString()
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('companies')
      .insert(insertRow)
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return {
        error:
          'Could not save your company details. Please check your connection and try again.',
      }
    }

    const newCompanyId = (inserted as { id: string }).id

    // T-79-03-02: RLS on company_members has no INSERT policy (D-03) → use service-role.
    // (user_id, company_id) values are derived from claims.sub (verified above) and the
    // just-inserted company.id (server-controlled), never from caller-supplied parameters.
    const service = requireServiceClient()
    const { error: memberErr } = await service
      .from('company_members')
      .insert({
        user_id: claims.sub,
        company_id: newCompanyId,
        role: 'owner',
      })

    if (memberErr) {
      return {
        error:
          'Could not finalize company membership. Please try again.',
      }
    }

    // Seed industry-specific price book defaults — ONLY when the user opted in
    // (fire-and-forget). Unchecked → the price book starts empty.
    if (data.prefillPriceBook) {
      seedIndustryPriceBook(service, newCompanyId, resolvedIndustries, row.currency_code).catch(() => undefined)
    }

    // Send welcome email to new account owner (fire-and-forget)
    const userEmail = (claims as Record<string, unknown>).email as string | undefined
    sendWelcomeEmail({
      toEmail: userEmail ?? data.email ?? '',
      ownerName: data.ownerName,
      companyName: data.companyName ?? 'My Company',
    }).catch(() => undefined)

    // Mirror the new company into Xphere CRM (fire-and-forget).
    dispatchXphereSync(newCompanyId, 'company.created')

    // D-12: set the active_company_id cookie to the new company's id.
    const cookieStore = await cookies()
    cookieStore.set(ACTIVE_COMPANY_COOKIE, newCompanyId, ACTIVE_COMPANY_COOKIE_OPTIONS)

    // Preserve the existing onboarding_complete cookie pattern (used by TourProvider).
    cookieStore.set('onboarding_complete', '1', {
      httpOnly: false,
      maxAge: 60,
      path: '/',
      sameSite: 'lax',
    })

    ;(revalidateTag as any)('company')
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  }

  // mode === 'first' — UNCHANGED behavior from before Phase 79.
  // SELECT-then-INSERT/UPDATE pattern (Pitfall 6: no UNIQUE constraint on user_id).
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

    // Mirror the company update into Xphere CRM (fire-and-forget).
    dispatchXphereSync(existing.id, 'company.updated')
  } else {
    // Insert new company
    // TIER-04: new companies start with a 14-day trial clock.
    // tier itself uses the DB DEFAULT 'free' — no need to pass it explicitly.
    // tier_trial_ends_at is set ONLY in INSERT, never in UPDATE, to avoid resetting on settings saves.
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert({ ...row, tier_trial_ends_at: trialEndsAt.toISOString() })
      .select('id')
      .single()

    if (error || !newCompany) {
      return {
        error:
          'Could not save your company details. Please check your connection and try again.',
      }
    }

    // 'first' mode must also register company_members so RLS on projects/estimates passes.
    const service = requireServiceClient()
    await service.from('company_members').insert({
      user_id: claims.sub,
      company_id: newCompany.id,
      role: 'owner',
    })

    // Seed industry-specific price book defaults — ONLY when the user opted in
    // (fire-and-forget). Unchecked → the price book starts empty.
    if (data.prefillPriceBook) {
      seedIndustryPriceBook(service, newCompany.id, resolvedIndustries, row.currency_code).catch(() => undefined)
    }

    // Send welcome email (fire-and-forget)
    const userEmail2 = (claims as Record<string, unknown>).email as string | undefined
    sendWelcomeEmail({
      toEmail: userEmail2 ?? data.email ?? '',
      ownerName: data.ownerName,
      companyName: data.companyName ?? 'My Company',
    }).catch(() => undefined)

    // Mirror the new company into Xphere CRM (fire-and-forget).
    dispatchXphereSync(newCompany.id, 'company.created')

    const cookieStore2 = await cookies()
    cookieStore2.set(ACTIVE_COMPANY_COOKIE, newCompany.id, ACTIVE_COMPANY_COOKIE_OPTIONS)
  }

  // Set a short-lived non-httpOnly cookie so TourProvider can detect onboarding completion client-side
  const cookieStore = await cookies()
  cookieStore.set('onboarding_complete', '1', {
    httpOnly: false,  // MUST be false — TourProvider reads via document.cookie
    maxAge: 60,       // 60s TTL — enough for the redirect + hydration
    path: '/',
    sameSite: 'lax',
  })

  ;(revalidateTag as any)('company')
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
