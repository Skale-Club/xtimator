'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type AuthSuccess = { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; companyId: string }
type AuthFailure = { ok: false; errorMsg: string }

async function getAuthContext(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { ok: false, errorMsg: 'Not authenticated' }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub as string)
    .single()

  if (!company) return { ok: false, errorMsg: 'No company found' }

  return { ok: true, supabase, companyId: company.id }
}

export type WhatsAppSettingsResult =
  | { ok: true }
  | { ok: false; error: string }

export async function connectWhatsApp(data: {
  phoneNumber: string
  phoneNumberId: string
  wabaId: string
}): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { supabase, companyId } = ctx

  const { error } = await supabase.from('company_whatsapp').upsert(
    {
      company_id: companyId,
      phone_number: data.phoneNumber,
      phone_number_id: data.phoneNumberId,
      waba_id: data.wabaId,
      status: 'active',
    },
    { onConflict: 'company_id' }
  )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/integrations')
  return { ok: true }
}

export async function disconnectWhatsApp(): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { supabase, companyId } = ctx

  const { error } = await supabase
    .from('company_whatsapp')
    .delete()
    .eq('company_id', companyId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/integrations')
  return { ok: true }
}

export async function updateDeliveryFormat(
  format: 'share_link' | 'formatted_text'
): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { supabase, companyId } = ctx

  const { error } = await supabase
    .from('company_whatsapp')
    .update({ delivery_format: format })
    .eq('company_id', companyId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings/integrations')
  return { ok: true }
}
