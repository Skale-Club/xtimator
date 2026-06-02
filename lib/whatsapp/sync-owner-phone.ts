/**
 * Keeps company_whatsapp.owner_phone in sync whenever the company's phone changes.
 * Called from onboarding (company.ts) and company settings (settings.ts).
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
): Promise<void> {
  const ownerPhone = toOwnerPhone(rawPhone)

  await serviceClient
    .from('company_whatsapp')
    .upsert(
      { company_id: companyId, owner_phone: ownerPhone },
      { onConflict: 'company_id' }
    )
}
