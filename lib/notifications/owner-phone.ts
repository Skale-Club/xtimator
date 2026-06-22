import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Phase 104 (NOTIF-05) — Owner-phone resolver.
 *
 * Reads the per-user `company_whatsapp.owner_phone` (per-user since migration
 * 20260620000001) for a (companyId, userId) pair. The SAME verified E.164 number
 * drives BOTH the WhatsApp and SMS notification channels (CONTEXT decision).
 *
 * Gate definition (Research Option A): "phone on file" = a non-null `owner_phone`
 * on an `active` row. The Phase-50 OTP/verified columns were dropped by
 * 20260602000001, so there is no separate verified flag to read.
 *
 * `company_whatsapp` is RLS deny-all → the service client is mandatory.
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
      .from('company_whatsapp')
      .select('owner_phone, status')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .not('owner_phone', 'is', null)
      .maybeSingle()

    if (error) {
      console.warn('[notifications.owner-phone] read failed:', error.message)
      return null
    }
    const phone = (data as { owner_phone?: string | null } | null)?.owner_phone
    return phone ?? null
  } catch (e) {
    console.warn(
      '[notifications.owner-phone] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}
