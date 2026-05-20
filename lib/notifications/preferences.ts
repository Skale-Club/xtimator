import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  type EventType,
  type EventCategory,
  EVENT_CATEGORIES,
  DEFAULT_PREFERENCES,
} from './event-types'

/**
 * Phase 77 (NOTIF-02 + NOTIF-03) — Notification preferences resolver.
 *
 * `resolveChannels()` is the single source of truth for "should this event
 * fan out to in-app and/or email?" — used by `lib/notifications/dispatch.ts`.
 *
 * Resolution order (highest precedence last):
 *   1. DEFAULT_PREFERENCES[category]
 *   2. userPrefs.categories[category]  (per-category JSONB override)
 *   3. userPrefs.email_digest_enabled=false → force email=false
 *   4. `override` param (used by force-send events e.g. trial.expired)
 *
 * Best-effort: a DB read failure falls back to DEFAULT_PREFERENCES.
 */

export interface UserPrefs {
  user_id: string
  categories: Partial<
    Record<EventCategory, { in_app?: boolean; email?: boolean }>
  >
  push_subscription?: unknown | null
  email_digest_enabled: boolean
}

export interface ResolvedChannels {
  inApp: boolean
  email: boolean
}

export async function resolveChannels(
  eventType: EventType,
  userId: string | null | undefined,
  override?: { inApp?: boolean; email?: boolean },
): Promise<ResolvedChannels> {
  const category = EVENT_CATEGORIES[eventType]
  const defaults = DEFAULT_PREFERENCES[category]

  const userPrefs = userId ? await getUserPreferences(userId) : null
  const userCat = (userPrefs?.categories?.[category] ?? {}) as {
    in_app?: boolean
    email?: boolean
  }

  let inApp = userCat.in_app ?? defaults.in_app
  let email = userCat.email ?? defaults.email

  // Global email gate
  if (userPrefs && userPrefs.email_digest_enabled === false) {
    email = false
  }

  // Override wins absolutely (e.g. trial.expired forces email)
  if (override?.inApp !== undefined) inApp = override.inApp
  if (override?.email !== undefined) email = override.email

  return { inApp, email }
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
