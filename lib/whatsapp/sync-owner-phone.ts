/**
 * Keeps company_whatsapp.owner_phone in sync whenever a user's phone changes.
 * Called from onboarding (company.ts), company settings (settings.ts),
 * and the per-user profile WhatsApp field (saveWhatsAppNumber action).
 *
 * The WhatsApp welcome is NOT sent here — not everyone has WhatsApp, so blindly
 * messaging a number would fail. Instead the welcome fires on the owner's first
 * inbound WhatsApp message (see lib/whatsapp/send-welcome.ts). When the owner's
 * phone changes, we reset welcome_sent_at so the new number is welcomed on its
 * first contact.
 *
 * company_whatsapp is RLS deny-all — always call with a service-role client.
 *
 * Multi-user behaviour:
 *   - When userId is provided → upsert on (company_id, user_id) conflict.
 *     Each user in a company owns their own row independently.
 *   - When userId is null/undefined (legacy company-level path) → upsert on
 *     (company_id) conflict WHERE user_id IS NULL, preserving backward compat
 *     with the single-user onboarding flow.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

function toOwnerPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  if (!digits) return null
  const e164 = digits.startsWith('+') ? digits : `+${digits}`
  const numericPart = e164.slice(1)
  if (numericPart.length < 7 || numericPart.length > 15) return null
  return e164
}

export async function syncOwnerPhone(
  serviceClient: SupabaseClient,
  companyId: string,
  rawPhone: string | null | undefined,
  userId?: string | null
): Promise<void> {
  const ownerPhone = toOwnerPhone(rawPhone)

  if (userId) {
    // Per-user path: read existing row for this (company, user) pair.
    const { data: current } = await serviceClient
      .from('company_whatsapp')
      .select('owner_phone')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle()

    const phoneChanged = ownerPhone !== (current?.owner_phone ?? null)

    const row: Record<string, unknown> = {
      company_id: companyId,
      user_id: userId,
      owner_phone: ownerPhone,
      status: 'active',
    }
    if (phoneChanged) row.welcome_sent_at = null

    await serviceClient
      .from('company_whatsapp')
      .upsert(row, { onConflict: 'company_id, user_id' })
  } else {
    // Legacy company-level path (userId not known — e.g. createOrUpdateCompany).
    // Targets the NULL-user_id row via the company_whatsapp_company_no_user_unique index.
    const { data: current } = await serviceClient
      .from('company_whatsapp')
      .select('owner_phone')
      .eq('company_id', companyId)
      .is('user_id', null)
      .maybeSingle()

    const phoneChanged = ownerPhone !== (current?.owner_phone ?? null)

    const row: Record<string, unknown> = {
      company_id: companyId,
      owner_phone: ownerPhone,
      status: 'active',
    }
    if (phoneChanged) row.welcome_sent_at = null

    await serviceClient
      .from('company_whatsapp')
      .upsert(row, { onConflict: 'company_id' })
  }
}
