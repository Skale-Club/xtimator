'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

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

const VERIFICATION_TTL_MINUTES = 10
const MAX_VERIFICATION_ATTEMPTS = 3

function generateVerificationCode(): string {
  // 6-digit numeric code, leading zeros preserved.
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
}

/**
 * Phase 50: Step 1 of the new OTP flow.
 *
 * Submits credentials and triggers a verification code via WhatsApp. Row is
 * stored with status='pending' until the user confirms the code.
 */
export async function requestWhatsAppVerification(data: {
  phoneNumber: string
  phoneNumberId: string
  wabaId: string
}): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { supabase, companyId } = ctx

  const code = generateVerificationCode()
  const expiresAt = new Date(
    Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000
  ).toISOString()

  const { error: dbError } = await supabase.from('company_whatsapp').upsert(
    {
      company_id: companyId,
      phone_number: data.phoneNumber,
      phone_number_id: data.phoneNumberId,
      waba_id: data.wabaId,
      status: 'pending',
      verification_code: code,
      verification_attempts: 0,
      verification_expires_at: expiresAt,
    },
    { onConflict: 'company_id' }
  )

  if (dbError) return { ok: false, error: dbError.message }

  try {
    await sendWhatsAppMessage(data.phoneNumber, {
      type: 'text',
      text: {
        body: `Your Xtimator verification code is *${code}*.\n\nEnter this code in the Xtimator settings page to activate WhatsApp. The code expires in ${VERIFICATION_TTL_MINUTES} minutes.`,
      },
    })
  } catch (sendErr) {
    // If we can't send the code, the row is useless — roll back so the user
    // can retry cleanly. They get a clear error.
    await supabase.from('company_whatsapp').delete().eq('company_id', companyId)
    const msg = sendErr instanceof Error ? sendErr.message : String(sendErr)
    return {
      ok: false,
      error: `Could not send verification code via WhatsApp. Please check your credentials and try again. (${msg})`,
    }
  }

  revalidatePath('/settings/integrations')
  return { ok: true }
}

/**
 * Phase 50: Step 2 of the OTP flow.
 *
 * Validates the 6-digit code. On success: status='active', verified_at set,
 * verification fields cleared. On failure: attempts counter incremented.
 * After MAX_VERIFICATION_ATTEMPTS failures, row is deleted.
 */
export async function confirmWhatsAppVerification(
  code: string
): Promise<WhatsAppSettingsResult> {
  const ctx = await getAuthContext()
  if (!ctx.ok) return { ok: false, error: ctx.errorMsg }
  const { supabase, companyId } = ctx

  const { data: row, error: fetchError } = await supabase
    .from('company_whatsapp')
    .select('verification_code, verification_attempts, verification_expires_at, status')
    .eq('company_id', companyId)
    .single()

  if (fetchError || !row) {
    return { ok: false, error: 'No pending verification found. Please start over.' }
  }

  if (row.status !== 'pending') {
    return { ok: false, error: 'No verification in progress.' }
  }

  const expiresAt = row.verification_expires_at
    ? new Date(row.verification_expires_at as string).getTime()
    : 0
  if (!expiresAt || expiresAt < Date.now()) {
    await supabase.from('company_whatsapp').delete().eq('company_id', companyId)
    return { ok: false, error: 'Verification code expired. Please start over.' }
  }

  const normalized = code.trim()
  if (normalized !== row.verification_code) {
    const newAttempts = (row.verification_attempts ?? 0) + 1
    if (newAttempts >= MAX_VERIFICATION_ATTEMPTS) {
      await supabase.from('company_whatsapp').delete().eq('company_id', companyId)
      return {
        ok: false,
        error: 'Too many incorrect attempts. Please start over.',
      }
    }
    await supabase
      .from('company_whatsapp')
      .update({ verification_attempts: newAttempts })
      .eq('company_id', companyId)
    return {
      ok: false,
      error: `Incorrect code. ${MAX_VERIFICATION_ATTEMPTS - newAttempts} attempt${
        MAX_VERIFICATION_ATTEMPTS - newAttempts === 1 ? '' : 's'
      } remaining.`,
    }
  }

  const { error: updateError } = await supabase
    .from('company_whatsapp')
    .update({
      status: 'active',
      verified_at: new Date().toISOString(),
      verification_code: null,
      verification_attempts: 0,
      verification_expires_at: null,
    })
    .eq('company_id', companyId)

  if (updateError) return { ok: false, error: updateError.message }

  revalidatePath('/settings/integrations')
  return { ok: true }
}

/**
 * Legacy single-step connect — preserved for backward compatibility with UI
 * that hasn't migrated to the OTP flow yet.
 *
 * @deprecated Use `requestWhatsAppVerification` + `confirmWhatsAppVerification`
 */
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
