'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { serverStorage } from '@/lib/storage/server'
import { storageProxyPath } from '@/lib/storage/asset-url'
import { convertImageToWebp } from '@/lib/image/webp'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { redirect } from 'next/navigation'
import { revalidatePath, updateTag } from 'next/cache'
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
import { captureBackgroundError } from '@/lib/observability/capture'
import { grantSignupCredits, grantMonthlyCredits } from '@/lib/billing/credit-ledger'
import { notifyOps } from '@/lib/observability/ops-alert'
import { assertWritable } from '@/lib/demo/guard'
import { attributeReferralFromCookie } from '@/lib/affiliates/attribution-server'

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

const MAX_ONBOARDING_LOGO_SIZE = 2 * 1024 * 1024
const ACCEPTED_ONBOARDING_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

/**
 * Server-side logo upload for the onboarding survey — replaces the previous
 * client-side direct-to-storage upload (sharp only runs server-side, so
 * WebP conversion requires this round-trip).
 *
 * Returns a SAME-ORIGIN `/storage/logos/...` path (Phase 190, URL-01) — a URL
 * this app serves itself via the Phase 187 asset proxy. Do not confuse that
 * with the original bug this function was written to fix: the old client-side
 * code persisted the bare storage KEY (`{userId}/logo.webp`, no `/storage/`
 * prefix), which no browser could resolve. A relative value is only correct
 * when it is a path the app actually routes.
 */
export async function uploadOnboardingLogoAction(formData: FormData) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return { error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return denied

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file provided.' }
  if (!ACCEPTED_ONBOARDING_LOGO_TYPES.includes(file.type)) return { error: 'Unsupported image format. Please upload a PNG, JPG, or WebP file.' }
  if (file.size > MAX_ONBOARDING_LOGO_SIZE) return { error: 'Logo must be under 2MB.' }

  // Phase 188 (PROV-01): serverStorage() honors the server-wide provider
  // selection. In Supabase mode this is byte-identical to the prior Supabase-only factory call
  // — same user-scoped client, same storage.objects RLS. In R2 mode the client
  // is ignored and that RLS layer does not exist, so the supabase.auth.getUser()
  // check + assertWritable() above are the sole authorization gate for this
  // object.
  const storage = serverStorage(supabase)
  const path = `${userData.user.id}/logo.webp`
  try {
    const webpBuffer = await convertImageToWebp(file)
    await storage.upload('logos', path, webpBuffer, { contentType: 'image/webp', upsert: true })
    return { data: { url: storageProxyPath('logos', path) } }
  } catch (err) {
    console.error('[uploadOnboardingLogoAction] upload error:', err)
    return { error: 'Logo upload failed.' }
  }
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

  const denied = await assertWritable()
  if (denied) return denied

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
    // D-14: resolve the "source" company for TIER inheritance — an added company
    // by the same user inherits the tier and gets NO fresh signup credit grant
    // (Billing v2 anti credit-farming: fresh free allowances come only from a
    // genuinely new account's first company).
    const sourceCompanyId = await getActiveCompanyId()
    let inheritedTier: string | undefined

    if (sourceCompanyId) {
      const { data: source } = await supabase
        .from('companies')
        .select('tier')
        .eq('id', sourceCompanyId)
        .single()

      if (source) {
        inheritedTier = source.tier as string
      }
    }

    // Build INSERT row. If we resolved a source, inherit its tier; otherwise the
    // DB DEFAULT 'free' applies (degenerate path — Phase 80 UI requires a source).
    //
    // Phase 85: companies.user_id stays NOT NULL until v5+ drops the column.
    // INSERT WITH CHECK still requires (user_id = auth.uid()). Set it explicitly to claims.sub.
    const insertRow: Record<string, unknown> = { ...row, user_id: claims.sub }
    if (inheritedTier !== undefined) {
      insertRow.tier = inheritedTier
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

    // Billing v2: an added company on an inherited PAID tier gets this month's
    // credit grant immediately (keyed on the SAME company-month key the monthly
    // cron uses, so the cron later no-ops — never a double grant). Inherited
    // free tier gets NOTHING (anti credit-farming). Fire-and-forget.
    if (inheritedTier === 'pro' || inheritedTier === 'business') {
      grantMonthlyCredits(newCompanyId, inheritedTier, 'company-added').catch(
        captureBackgroundError('company.addedCompanyGrant'),
      )
    }

    // Seed industry-specific price book defaults — ONLY when the user opted in
    // (fire-and-forget). Unchecked → the price book starts empty.
    if (data.prefillPriceBook) {
      seedIndustryPriceBook(service, newCompanyId, resolvedIndustries, row.currency_code).catch(
        captureBackgroundError('company.seedPriceBook'),
      )
    }

    // Send welcome email to new account owner (fire-and-forget)
    const userEmail = (claims as Record<string, unknown>).email as string | undefined
    sendWelcomeEmail({
      toEmail: userEmail ?? data.email ?? '',
      ownerName: data.ownerName,
      companyName: data.companyName ?? 'My Company',
    }).catch(captureBackgroundError('company.welcomeEmail'))

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

    updateTag('company')
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

    // Self-healing (pre-launch audit fix B6): a PRIOR onboarding attempt may
    // have created this `companies` row but failed to insert the matching
    // company_members row (that insert's error used to be silently ignored —
    // see the 'else' branch below). getActiveCompany() resolves exclusively
    // via company_members, so that failure mode permanently locked the user
    // in a dashboard<->onboarding redirect loop. Re-submitting onboarding
    // lands in THIS branch (a `companies` row already exists for the user),
    // so repair the missing membership here rather than requiring a manual
    // DB fix.
    const healService = requireServiceClient()
    const { data: existingMember } = await healService
      .from('company_members')
      .select('user_id')
      .eq('user_id', claims.sub)
      .eq('company_id', existing.id)
      .maybeSingle()
    if (!existingMember) {
      const { error: healErr } = await healService.from('company_members').insert({
        user_id: claims.sub,
        company_id: existing.id,
        role: 'owner',
      })
      if (healErr) {
        return {
          error: 'Could not finalize company membership. Please try again.',
        }
      }
    }

    // Mirror the company update into Xphere CRM (fire-and-forget).
    dispatchXphereSync(existing.id, 'company.updated')
  } else {
    // Insert new company.
    // Billing v2: the free tier IS the trial — no 14-day clock. tier uses the DB
    // DEFAULT 'free'; the one-time signup credit grant (below) is the entire
    // free allowance, and the credit gate is the wall once it's spent.
    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert(row)
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
    const { error: memberErr } = await service.from('company_members').insert({
      user_id: claims.sub,
      company_id: newCompany.id,
      role: 'owner',
    })
    if (memberErr) {
      // Pre-launch audit fix (B6): this insert's error was previously
      // unchecked. A failure here left a `companies` row with NO matching
      // company_members row — and getActiveCompany() resolves EXCLUSIVELY via
      // company_members, so the user would be stuck in a permanent
      // dashboard<->onboarding redirect loop with no self-service recovery
      // (re-submitting hit the `existing` branch below, which didn't retry
      // this insert either — now self-healing, see that branch).
      return {
        error: 'Could not finalize company membership. Please try again.',
      }
    }

    // Phase 175 (PLAT-01) — a brand-new tenant signing up is a platform event.
    // Sibling call — never routes through notify() (that pipe is company-scoped).
    void notifyOps({
      kind: 'tenant_signup',
      title: 'New tenant signup',
      message: `${row.name} (${newCompany.id}) - industries: ${resolvedIndustries.join(', ') || 'none'}`,
      severity: 'warning',
    })

    // Billing v2: one-time signup credit grant — the free tier's allowance.
    // Idempotent (ledger key `signup:{companyId}`); fire-and-forget so a grant
    // hiccup never breaks onboarding, but observable via Sentry.
    grantSignupCredits(newCompany.id).catch(
      captureBackgroundError('company.signupCreditGrant'),
    )

    // SEED-054: credit the affiliate whose link brought this signup, if any.
    // FIRST-company mode ONLY — the 'add' branch above deliberately skips it,
    // exactly like the signup credit grant: a user who already has a tenant must
    // not be able to mint a fresh commission stream by adding companies.
    // Fire-and-forget and itself never-throw; a growth-accounting side effect
    // must never break onboarding.
    attributeReferralFromCookie(newCompany.id).catch(
      captureBackgroundError('company.affiliateAttribution'),
    )

    // Seed industry-specific price book defaults — ONLY when the user opted in
    // (fire-and-forget). Unchecked → the price book starts empty.
    if (data.prefillPriceBook) {
      seedIndustryPriceBook(service, newCompany.id, resolvedIndustries, row.currency_code).catch(
        captureBackgroundError('company.seedPriceBook'),
      )
    }

    // Send welcome email (fire-and-forget)
    const userEmail2 = (claims as Record<string, unknown>).email as string | undefined
    sendWelcomeEmail({
      toEmail: userEmail2 ?? data.email ?? '',
      ownerName: data.ownerName,
      companyName: data.companyName ?? 'My Company',
    }).catch(captureBackgroundError('company.welcomeEmail'))

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

  updateTag('company')
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
