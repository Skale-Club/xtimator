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
 *   5. D-15: WhatsApp is always forced false — tenant cannot enable proactive
 *      WhatsApp dispatch regardless of stored preferences.
 *   6. `override` param (used by force-send events e.g. trial.expired)
 *
 * Best-effort: a DB read failure falls back to DEFAULT_PREFERENCES.
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
): Promise<ResolvedChannels> {
  // Unknown / dropped events resolve to the no-deliver `_dropped` defaults
  // (all channels false) — never crash on a missing category lookup.
  const category = EVENT_CATEGORIES[eventType] ?? '_dropped'
  const defaults = DEFAULT_PREFERENCES[category] ?? DEFAULT_PREFERENCES._dropped

  const userPrefs = userId ? await getUserPreferences(userId) : null
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

  // D-15: WhatsApp is always forced false for tenants — proactive WhatsApp
  // dispatch is platform-managed only. Old preferences cannot continue sends.
  whatsapp = false

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
    const svc = requireServiceClient()
    const { data, error } = await svc
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn(
        '[notifications.preferences] read failed:',
        error.message,
      )
      return null
    }
    return (data as UserPrefs | null) ?? null
  } catch (e) {
    console.warn(
      '[notifications.preferences] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return null
  }
}

export async function upsertUserPreferences(
  userId: string,
  patch: Partial<Omit<UserPrefs, 'user_id'>>,
): Promise<void> {
  try {
    const svc = requireServiceClient()
    const existing = await getUserPreferences(userId)
    const next = {
      user_id: userId,
      categories: {
        ...(existing?.categories ?? {}),
        ...(patch.categories ?? {}),
      },
      push_subscription:
        patch.push_subscription !== undefined
          ? patch.push_subscription
          : (existing?.push_subscription ?? null),
      email_digest_enabled:
        patch.email_digest_enabled ??
        existing?.email_digest_enabled ??
        true,
      // Phase 104 (NOTIF-05) — per-channel opt-in/consent. Only overwrite when
      // the patch carries the field, else preserve the recorded value (consent
      // timestamps are never silently cleared).
      sms_opt_in_at:
        patch.sms_opt_in_at !== undefined
          ? patch.sms_opt_in_at
          : (existing?.sms_opt_in_at ?? null),
      sms_opt_in_consent_text:
        patch.sms_opt_in_consent_text !== undefined
          ? patch.sms_opt_in_consent_text
          : (existing?.sms_opt_in_consent_text ?? null),
      whatsapp_opt_in_at:
        patch.whatsapp_opt_in_at !== undefined
          ? patch.whatsapp_opt_in_at
          : (existing?.whatsapp_opt_in_at ?? null),
      updated_at: new Date().toISOString(),
    }
    const { error } = await svc
      .from('notification_preferences')
      .upsert(next, { onConflict: 'user_id' })
    if (error) {
      console.warn(
        '[notifications.preferences] upsert failed:',
        error.message,
      )
    }
  } catch (e) {
    console.warn(
      '[notifications.preferences] upsert unexpected:',
      e instanceof Error ? e.message : String(e),
    )
  }
}
