import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Phase 104 (NOTIF-05) — Owner-phone resolver.
 *
 * Reads the per-user WhatsApp sender phone from the admin-provisioned
 * whatsapp_authorized_senders table (D-13 authority boundary). The SAME
 * verified E.164 number drives both the WhatsApp and SMS notification
 * channels (CONTEXT decision).
 *
 * Gate definition (Research Option A): "phone on file" = an active row
 * with a non-null phone_e164 on whatsapp_authorized_senders for the user's
 * (company, user) pair.
 *
 * whatsapp_authorized_senders is RLS deny-all → the service client is mandatory.
 *
 * Best-effort: returns the E.164 string when present, else null; never throws on
 * a DB error (returns null + logs).
 */
export async function resolveOwnerPhone(
  companyId: string,
  userId: string,
): Promise<string | null> {
  try {
    const svc = requireServiceClient()
    const { data, error } = await svc
      .from('whatsapp_authorized_senders')
      .select('phone_e164, status')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('phone_e164', 'is', null)
      .maybeSingle()

    if (error) {
      console.warn('[notifications.owner-phone] read failed:', error.message)
      return null
    }
    const phone = (data as { phone_e164?: string | null } | null)?.phone_e164
    return phone ?? null
  } catch (e) {
    console.warn(
      '[notifications.owner-phone] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}
