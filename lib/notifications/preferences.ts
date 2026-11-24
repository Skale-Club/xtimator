import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  type EventType,
  type EventCategory,
  EVENT_CATEGORIES,
  DEFAULT_PREFERENCES,
} from './event-types'

/**
 * Phase 77 / Phase 104 — Notification preferences resolver.
 *
 * `resolveChannels()` is the single source of truth for "which channels should
 * this event fan out to?" — used by `lib/notifications/dispatch.ts`.
 *
 * Resolution order (highest precedence last):
 *   1. DEFAULT_PREFERENCES[category]                       (4-channel defaults)
 *   2. userPrefs.categories[category]  (per-category JSONB override)
 *   3. userPrefs.email_digest_enabled=false → force email=false
 *   4. WhatsApp/SMS consent gate → force whatsapp/sms=false unless an explicit
 *      per-channel opt-in timestamp is recorded (TCPA/cost defense — a toggle
 *      alone never sends a paid channel). The verified-phone gate lands in Wave 2.
 *   5. `override` param (used by force-send events e.g. trial.expired)
 *
 * Best-effort: a DB read failure falls back to DEFAULT_PREFERENCES.
 *
 * History: Phase 142.1's D-15 forced `whatsapp = false` unconditionally here
 * ("old preferences cannot continue proactive sends"). Phase 174 (TNT-03)
 * lifts that override — the consent gate in step 4 above is now the sole gate
 * on tenant WhatsApp beyond category preference; the D-15 line itself is gone.
 */

export interface UserPrefs {
  user_id: string
  categories: Partial<
    Record<
      EventCategory,
      { in_app?: boolean; email?: boolean; whatsapp?: boolean; sms?: boolean }
    >
  >
  push_subscription?: unknown | null
  email_digest_enabled: boolean
  /** Explicit per-channel consent timestamps (NOTIF-05 / TCPA). */
  whatsapp_opt_in_at?: string | null
  sms_opt_in_at?: string | null
  /** The exact paid-channel consent copy shown at SMS opt-in (audit). */
  sms_opt_in_consent_text?: string | null
}

export interface ResolvedChannels {
  inApp: boolean
  email: boolean
  whatsapp: boolean
  sms: boolean
}

export async function resolveChannels(
  eventType: EventType,
  userId: string | null | undefined,
  override?: {
    inApp?: boolean
    email?: boolean
    whatsapp?: boolean
    sms?: boolean
  },
  options: { throwOnReadError?: boolean } = {},
): Promise<ResolvedChannels> {
  // Unknown / dropped events resolve to the no-deliver `_dropped` defaults
  // (all channels false) — never crash on a missing category lookup.
  const category = EVENT_CATEGORIES[eventType] ?? '_dropped'
  const defaults = DEFAULT_PREFERENCES[category] ?? DEFAULT_PREFERENCES._dropped

  const readPreferences = options.throwOnReadError ? readUserPreferences : getUserPreferences
  const userPrefs = userId ? await readPreferences(userId) : null
  const userCat = (userPrefs?.categories?.[category] ?? {}) as {
    in_app?: boolean
    email?: boolean
    whatsapp?: boolean
    sms?: boolean
  }

  let inApp = userCat.in_app ?? defaults.in_app
  let email = userCat.email ?? defaults.email
  let whatsapp = userCat.whatsapp ?? defaults.whatsapp
  let sms = userCat.sms ?? defaults.sms

  // Global email gate
  if (userPrefs && userPrefs.email_digest_enabled === false) {
    email = false
  }

  // Paid-channel consent gate (TCPA/cost): the per-category toggle is necessary
  // but NOT sufficient — an explicit recorded opt-in timestamp is required
  // before any WhatsApp/SMS send. (Verified-phone gating is added in Wave 2.)
  if (!userPrefs?.whatsapp_opt_in_at) whatsapp = false
  if (!userPrefs?.sms_opt_in_at) sms = false

  // Override wins absolutely (e.g. trial.expired forces email)
  if (override?.inApp !== undefined) inApp = override.inApp
  if (override?.email !== undefined) email = override.email
  if (override?.whatsapp !== undefined) whatsapp = override.whatsapp
  if (override?.sms !== undefined) sms = override.sms

  return { inApp, email, whatsapp, sms }
}

export async function getUserPreferences(
  userId: string,
): Promise<UserPrefs | null> {
  try {
    return await readUserPreferences(userId)
  } catch (e) {
    console.warn(
      '[notifications.preferences] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}

/** Read persisted preferences for a mutation that must distinguish missing rows from failures. */
export async function readUserPreferences(userId: string): Promise<UserPrefs | null> {
  const { data, error } = await requireServiceClient()
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[notifications.preferences] read failed:', error.message)
    throw new Error('Could not read notification preferences.')
  }
  return (data as UserPrefs | null) ?? null
}

export async function upsertUserPreferences(
  userId: string,
  patch: Partial<Omit<UserPrefs, 'user_id'>>,
): Promise<void> {
  const { categories, ...fields } = patch
  const next: Record<string, unknown> = {
    ...fields,
    user_id: userId,
    updated_at: new Date().toISOString(),
  }
  if (categories) {
    const existing = await readUserPreferences(userId)
    const merged = { ...existing?.categories }
    for (const category of Object.keys(categories) as EventCategory[]) {
      merged[category] = { ...merged[category], ...categories[category] }
    }
    next.categories = merged
  }
  const { error } = await requireServiceClient()
    .from('notification_preferences')
    .upsert(next, { onConflict: 'user_id' })
  if (error) {
    console.warn('[notifications.preferences] upsert failed:', error.message)
    throw new Error('Could not save notification preferences.')
  }
}
