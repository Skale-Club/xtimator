'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

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

  // Handle logo upload
  let logoUrl = existingLogoUrl
  const logoFile = formData.get('logo') as File | null
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split('.').pop() ?? 'png'
    const storagePath = `${claims.sub}/logo.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(storagePath, logoFile, { upsert: true })

    if (uploadError) {
      return { error: 'Failed to upload logo. Please try again.' }
    }

    const { data: publicUrlData } = supabase.storage
      .from('logos')
      .getPublicUrl(storagePath)

    logoUrl = publicUrlData.publicUrl
  }

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
      brand_primary_color: brandPrimaryColor || '#0D9488',
      logo_url: logoUrl || null,
    })
    .eq('id', company.id)

  if (error) {
    return { error: 'Failed to save company settings. Please try again.' }
  }

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

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.auth.admin.deleteUser(claims.sub as string)

  if (error) {
    return { error: 'Failed to delete account. Please try again.' }
  }

  return { success: true, redirect: '/auth/login' }
}
