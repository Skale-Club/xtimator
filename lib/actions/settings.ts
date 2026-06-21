'use server'

import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { createStorage } from '@/lib/storage'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { revalidatePath, revalidateTag } from 'next/cache'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'
import { syncOwnerPhone } from '@/lib/whatsapp/sync-owner-phone'
import { sendProfileUpdatedEmail, diffProfileFields } from '@/lib/email/account-emails'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company, claims }
}

export async function updateCompanySettings(formData: FormData) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company, claims } = ctx

  // Extract fields from FormData
  const name = formData.get('name') as string
  const ownerName = formData.get('ownerName') as string | null
  const phone = formData.get('phone') as string | null
  const email = formData.get('email') as string | null
  const website = formData.get('website') as string | null
  const address = formData.get('address') as string | null
  const city = formData.get('city') as string | null
  const state = formData.get('state') as string | null
  const zip = formData.get('zip') as string | null
  const licenseNumber = formData.get('licenseNumber') as string | null
  const insuranceInfo = formData.get('insuranceInfo') as string | null
  const industry = formData.get('industry') as string | null
  const brandPrimaryColor = formData.get('brandPrimaryColor') as string | null
  const existingLogoUrl = formData.get('existingLogoUrl') as string | null
  const defaultEstimateLanguage = formData.get('defaultEstimateLanguage') as string | null
  const currencyCode = normalizeCurrencyCode(formData.get('currencyCode'))

  // Handle logo upload
  let logoUrl = existingLogoUrl
  const logoFile = formData.get('logo') as File | null
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split('.').pop() ?? 'png'
    const storagePath = `${company.id}/logo.${ext}`

    const storage = createStorage(supabase)
    try {
      await storage.upload('logos', storagePath, logoFile, { upsert: true })
    } catch (err) {
      console.error('[settings] logo upload error:', err)
      return { error: 'Failed to upload logo. Please try again.' }
    }

    logoUrl = storage.getPublicUrl('logos', storagePath)
  }

  // Fetch current values before update so we can detect which fields changed
  const { data: currentCompany } = await supabase
    .from('companies')
    .select('name, owner_name, phone, email, website')
    .eq('id', company.id)
    .single()

  const { error } = await supabase
    .from('companies')
    .update({
      name: name || 'My Company',
      owner_name: ownerName || null,
      phone: phone || null,
      email: email || null,
      website: website || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      license_number: licenseNumber || null,
      insurance_info: insuranceInfo || null,
      industry: industry || null,
      brand_primary_color: brandPrimaryColor || SYSTEM_COLORS.primary,
      logo_url: logoUrl || null,
      currency_code: currencyCode,
      default_estimate_language:
        defaultEstimateLanguage && defaultEstimateLanguage !== ''
          ? defaultEstimateLanguage
          : null,
    })
    .eq('id', company.id)

  if (error) {
    return { error: 'Failed to save company settings. Please try again.' }
  }

  // Note: the company business phone is intentionally NOT synced to company_whatsapp
  // anymore. WhatsApp routing numbers are per-user and managed in Profile settings
  // (saveWhatsAppNumber). The company phone seeds a user's WhatsApp number only once,
  // at account creation (see lib/actions/company.ts), and is independent thereafter.

  // Detect changed fields and send a profile-update notification email
  if (currentCompany) {
    const changes = diffProfileFields(
      {
        name: currentCompany.name,
        ownerName: currentCompany.owner_name,
        phone: currentCompany.phone,
        email: currentCompany.email,
        website: currentCompany.website,
      },
      {
        name: name || 'My Company',
        ownerName,
        phone,
        email,
        website,
      }
    )

    if (changes.length > 0) {
      const userEmail = (claims as Record<string, unknown>).email as string | undefined
      sendProfileUpdatedEmail({
        toEmail: userEmail ?? '',
        ownerName: ownerName ?? undefined,
        changes,
      }).catch(() => undefined)
    }
  }

  await supabase
    .from('company_price_book')
    .update({ currency_code: currencyCode })
    .eq('company_id', company.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(revalidateTag as any)('company')
  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateDefaults(data: {
  defaultTaxRate: number
  defaultPaymentTerms: string
  defaultWarrantyTerms: string
  defaultValidityDays: number
}) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  // Validate
  if (data.defaultTaxRate < 0 || data.defaultTaxRate > 1) {
    return { error: 'Tax rate must be between 0% and 100%.' }
  }
  if (data.defaultValidityDays < 1) {
    return { error: 'Validity period must be at least 1 day.' }
  }

  const { error } = await supabase
    .from('companies')
    .update({
      default_tax_rate: data.defaultTaxRate,
      default_payment_terms: data.defaultPaymentTerms || null,
      default_warranty_terms: data.defaultWarrantyTerms || null,
      default_validity_days: data.defaultValidityDays,
    })
    .eq('id', company.id)

  if (error) {
    return { error: 'Failed to save defaults. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function updateNotifications(data: {
  notifyOnView: boolean
  notifyOnAccept: boolean
  notifyOnDecline: boolean
}) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({
      notify_on_view: data.notifyOnView,
      notify_on_accept: data.notifyOnAccept,
      notify_on_decline: data.notifyOnDecline,
    })
    .eq('id', company.id)

  if (error) {
    return { error: 'Failed to save notification preferences. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function updateEstimateTerms(data: {
  estimateTermsEnabled: boolean
  estimateTermsText: string
}) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({
      estimate_terms_enabled: data.estimateTermsEnabled,
      estimate_terms_text: data.estimateTermsText.trim() || null,
    })
    .eq('id', company.id)

  if (error) {
    console.error('[settings] updateEstimateTerms DB error:', error)
    return { error: 'Failed to save estimate terms. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function updateDeliverySettings(data: {
  emailDeliveryEnabled: boolean
  smsDeliveryEnabled: boolean
  digitalSignatureEnabled: boolean
}) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({
      email_delivery_enabled: data.emailDeliveryEnabled,
      sms_delivery_enabled: data.smsDeliveryEnabled,
      digital_signature_enabled: data.digitalSignatureEnabled,
    })
    .eq('id', company.id)

  if (error) {
    console.error('[settings] updateDeliverySettings DB error:', error)
    return { error: 'Failed to save delivery settings. Please try again.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function changePassword(data: {
  currentPassword: string
  newPassword: string
}) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  // Verify current password by signing in
  const userEmail = (claims as Record<string, unknown>).email as string | undefined
  if (userEmail) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: data.currentPassword,
    })
    if (signInError) {
      return { error: 'Current password is incorrect.' }
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: data.newPassword,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function changeEmail(data: { newEmail: string }) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const { error } = await supabase.auth.updateUser({
    email: data.newEmail,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true, message: 'Confirmation email sent to your new address.' }
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const fullName = (formData.get('fullName') as string | null)?.trim() || null
  const phone = (formData.get('phone') as string | null)?.trim() || null

  const updateData: Record<string, string | null> = { full_name: fullName, phone }

  const avatarFile = formData.get('avatar') as File | null
  if (avatarFile && avatarFile.size > 0) {
    const ext = avatarFile.name.split('.').pop() ?? 'jpg'
    const storagePath = `user-avatars/${claims.sub}/avatar.${ext}`
    const storage = createStorage(supabase)
    try {
      await storage.upload('logos', storagePath, avatarFile, { upsert: true })
      updateData.avatar_url = storage.getPublicUrl('logos', storagePath)
    } catch {
      return { error: 'Failed to upload photo. Please try again.' }
    }
  }

  const { error } = await supabase.auth.updateUser({ data: updateData })
  if (error) return { error: error.message }

  revalidatePath('/settings/general')
  return { ok: true }
}

export async function saveWhatsAppNumber(phone: string | null) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return denied

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' }

  const svc = requireServiceClient()
  await syncOwnerPhone(svc, activeCompanyId, phone, claims.sub as string)

  revalidatePath('/settings/general')
  return { ok: true }
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const serviceClient = requireServiceClient()
  const { error } = await serviceClient.auth.admin.deleteUser(claims.sub as string)

  if (error) {
    return { error: 'Failed to delete account. Please try again.' }
  }

  return { success: true, redirect: '/?auth=login' }
}
