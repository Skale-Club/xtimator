'use server'

import { getAuthClaims } from '@/lib/queries/auth'
import { assertWritable } from '@/lib/demo/guard'
import { readUserPreferences, upsertUserPreferences } from '@/lib/notifications/preferences'
import { WHATSAPP_NOTIFICATION_CATEGORIES } from '@/lib/notifications/event-types'
import { sendWelcomeTemplateForUser } from '@/lib/whatsapp/welcome-template'

async function setWhatsAppConsent(enabled: boolean): Promise<{ ok: true } | { error: string }> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return { error: 'Not authenticated' }

  const denied = await assertWritable()
  if (denied) return denied

  const userId = claims.sub as string
  try {
    const existing = await readUserPreferences(userId)
    const timestamp = enabled ? existing?.whatsapp_opt_in_at ?? new Date().toISOString() : null
    const unchanged = (existing?.whatsapp_opt_in_at ?? null) === timestamp &&
      WHATSAPP_NOTIFICATION_CATEGORIES.every(
        (category) => (existing?.categories?.[category]?.whatsapp ?? false) === enabled,
      )
    if (!unchanged) {
      await upsertUserPreferences(userId, {
        whatsapp_opt_in_at: timestamp,
        categories: Object.fromEntries(
          WHATSAPP_NOTIFICATION_CATEGORIES.map((category) => [category, { whatsapp: enabled }]),
        ),
      })
    }
  } catch {
    return { error: 'Could not save your WhatsApp preferences. Please try again.' }
  }

  // Retry an unsent welcome even when the consent was already recorded.
  if (enabled) await sendWelcomeTemplateForUser(userId)
  return { ok: true }
}

/** Records explicit consent and opts the owner into the categories advertised in the UI. */
export async function recordWhatsAppOptIn() {
  return setWhatsAppConsent(true)
}

/** Revokes proactive WhatsApp consent and clears the corresponding category switches. */
export async function recordWhatsAppOptOut() {
  return setWhatsAppConsent(false)
}
