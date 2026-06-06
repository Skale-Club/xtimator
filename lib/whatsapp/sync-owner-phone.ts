/**
 * Keeps company_whatsapp.owner_phone in sync whenever the company's phone changes.
 * Called from onboarding (company.ts) and company settings (settings.ts).
 *
 * Sends a WhatsApp welcome message when a phone is newly linked or changed.
 *
 * company_whatsapp is RLS deny-all — always call with a service-role client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppWelcome } from '@/lib/whatsapp/send-welcome'

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

  // Read existing phone before upsert so we can detect a genuine change
  const { data: current } = await serviceClient
    .from('company_whatsapp')
    .select('owner_phone')
    .eq('company_id', companyId)
    .maybeSingle()

  await serviceClient
    .from('company_whatsapp')
    .upsert(
      { company_id: companyId, owner_phone: ownerPhone, status: 'active' },
      { onConflict: 'company_id' }
    )

  // Send welcome only when a valid phone is newly linked or replaced
  if (ownerPhone && ownerPhone !== (current?.owner_phone ?? null)) {
    sendWhatsAppWelcome(ownerPhone).catch((err) =>
      console.warn('[WhatsApp] welcome message failed', err)
    )
  }
}
