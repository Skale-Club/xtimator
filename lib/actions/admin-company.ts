'use server'

import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { serverStorage } from '@/lib/storage/server'
import { convertImageToWebp } from '@/lib/image/webp'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { cookies } from 'next/headers'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
} from '@/lib/queries/active-company'
import { revalidatePath, updateTag } from 'next/cache'
import { dispatchXphereSync } from '@/lib/integrations/xphere/dispatch'

/**
 * Phase 147 — Admin quick-create company for street-sales demos.
 *
 * Gated by requireAdmin(). Creates a company with demo_estimate_quota = 3
 * (Phase 148 column), sets it as the active company, and returns success/error.
 * The caller is responsible for client-side navigation after success.
 */
export async function createAdminCompany(formData: FormData) {
  await requireAdmin()

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const companyName = (formData.get('companyName') as string | null)?.trim()
  if (!companyName) return { error: 'Company name is required' }

  const industry = (formData.get('industry') as string | null) || null
  const brandPrimaryColor =
    (formData.get('brandPrimaryColor') as string | null) || SYSTEM_COLORS.primary

  const service = requireServiceClient()

  // INSERT company first to get the ID, then upload logo (if any) to correct path.
  const { data: inserted, error: insertErr } = await service
    .from('companies')
    .insert({
      user_id: claims.sub,
      name: companyName,
      industry: industry,
      industries: industry ? [industry] : [],
      brand_primary_color: brandPrimaryColor,
      logo_url: null,
      demo_estimate_quota: 3,
      default_tax_rate: 0,
      default_payment_terms: 'Net 30',
      default_warranty_terms: '1 year',
      default_validity_days: 30,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return { error: 'Could not create company. Please try again.' }
  }

  const newCompanyId = (inserted as { id: string }).id

  // INSERT company_members owner row (RLS requires service role)
  const { error: memberErr } = await service
    .from('company_members')
    .insert({
      user_id: claims.sub,
      company_id: newCompanyId,
      role: 'owner',
    })

  if (memberErr) {
    return { error: 'Could not finalize company membership. Please try again.' }
  }

  // Optional logo upload — runs after INSERT so we have the company ID for the path.
  const logoFile = formData.get('logo') as File | null
  if (logoFile && logoFile.size > 0) {
    const storagePath = `${newCompanyId}/logo.webp`
    // Phase 188 (PROV-01): serverStorage() honors the server-wide provider
    // selection. In Supabase mode this is byte-identical to the prior Supabase-only factory call
    // — same user-scoped client, same storage.objects RLS. In R2 mode the client
    // is ignored and that RLS layer does not exist, so requireAdmin() above is the
    // sole authorization gate for this object.
    const storage = serverStorage(supabase)
    try {
      const webpBuffer = await convertImageToWebp(logoFile)
      await storage.upload('logos', storagePath, webpBuffer, { contentType: 'image/webp', upsert: true })
      const logoUrl = storage.getPublicUrl('logos', storagePath)
      await service
        .from('companies')
        .update({ logo_url: logoUrl })
        .eq('id', newCompanyId)
    } catch {
      // Non-fatal: company is created, logo just won't be set
    }
  }

  // Mirror into Xphere CRM (fire-and-forget)
  dispatchXphereSync(newCompanyId, 'company.created')

  // Switch active company
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_COMPANY_COOKIE, newCompanyId, ACTIVE_COMPANY_COOKIE_OPTIONS)

  updateTag('company')
  revalidatePath('/', 'layout')

  return { success: true, companyId: newCompanyId }
}
