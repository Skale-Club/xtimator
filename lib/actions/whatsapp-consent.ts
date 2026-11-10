'use server'

import { getAuthClaims } from '@/lib/queries/auth'
import { assertWritable } from '@/lib/demo/guard'
import { getUserPreferences, upsertUserPreferences } from '@/lib/notifications/preferences'

/**
 * Records the owner's explicit WhatsApp consent (notification_preferences.whatsapp_opt_in_at).
 * Meta requires consent before we send the welcome template. Called from the
 * onboarding checkbox, which is pre-unchecked: this runs only when the owner ticked it.
 * Idempotent: an existing consent timestamp is never overwritten.
 */
export async function recordWhatsAppOptIn(): Promise<{ ok: true } | { error: string }> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return { error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return denied

  const userId = claims.sub as string
  const existing = await getUserPreferences(userId)
  if (existing?.whatsapp_opt_in_at) return { ok: true }

  await upsertUserPreferences(userId, { whatsapp_opt_in_at: new Date().toISOString() })
  return { ok: true }
}
