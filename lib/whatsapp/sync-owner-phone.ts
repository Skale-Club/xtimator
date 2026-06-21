/**
 * Keeps company_whatsapp.owner_phone in sync whenever the company's phone changes.
 * Called from onboarding (company.ts) and company settings (settings.ts).
 *
 * The WhatsApp welcome is NOT sent here — not everyone has WhatsApp, so blindly
 * messaging a number would fail. Instead the welcome fires on the owner's first
 * inbound WhatsApp message (see lib/whatsapp/send-welcome.ts). When the owner's
 * phone changes, we reset welcome_sent_at so the new number is welcomed on its
 * first contact.
 *
 * company_whatsapp is RLS deny-all — always call with a service-role client.
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
  rawPhone: string | null | undefined
): Promise<{ phoneChanged: boolean; ownerPhone: string | null }> {
  const ownerPhone = toOwnerPhone(rawPhone)

  // Read existing phone before upsert so we can detect a genuine change.
  const { data: current } = await serviceClient
    .from('company_whatsapp')
    .select('owner_phone')
    .eq('company_id', companyId)
    .maybeSingle()

  const phoneChanged = ownerPhone !== (current?.owner_phone ?? null)

  const row: Record<string, unknown> = {
    company_id: companyId,
    owner_phone: ownerPhone,
    status: 'active',
  }
  // New/changed number → clear the welcome flag so it's re-welcomed on first contact.
  // Unchanged number → leave welcome_sent_at untouched (don't overwrite on every save).
  if (phoneChanged) row.welcome_sent_at = null

  await serviceClient
    .from('company_whatsapp')
    .upsert(row, { onConflict: 'company_id' })

  // Returned so callers can fire the proactive welcome template only on a real
  // change (and target the normalized E.164 number).
  return { phoneChanged, ownerPhone }
}
