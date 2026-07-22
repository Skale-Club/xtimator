import 'server-only'
import { isLockedPlatformEvent } from '@/lib/notifications/platform-events'

/**
 * Phase 175 (PLAT-02/PLAT-03) — Telegram delivery gate for platform events.
 *
 * Mirrors `lib/notifications/whatsapp-registry.ts`'s `getApprovedTemplateForEvent`
 * fail-open shape exactly: lazy `await import('@/lib/supabase/service')`, a
 * nullable `createServiceClient()`, and a try/catch around the DB read that
 * falls back (never throws) with a `console.warn`.
 *
 * Adds a 30s in-memory TTL cache mirroring `lib/platform-config.ts`'s
 * `brandingCache`/`integrationCache` pattern, so `notifyOps()` doesn't re-hit
 * the DB on every alert.
 */

const TTL_MS = 30_000
let cache: { value: Map<string, boolean>; fetchedAt: number } | null = null

async function loadPreferences(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.value
  const map = new Map<string, boolean>()
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (svc) {
      const { data } = await svc
        .from('platform_notification_preferences')
        .select('event_kind, telegram_enabled')
      for (const row of data ?? []) {
        map.set(row.event_kind as string, row.telegram_enabled as boolean)
      }
    }
  } catch (err) {
    console.warn('[platform-preferences] loadPreferences fell back to fail-open (empty map):', err)
  }
  cache = { value: map, fetchedAt: Date.now() }
  return cache.value
}

/** Admin-panel writes (Plan 03) call this after every toggle save. */
export function invalidatePlatformPreferencesCache(): void {
  cache = null
}

/**
 * Whether `kind` should deliver to Telegram right now.
 *  - locked kinds → always true (PLAT-03), checked BEFORE any DB read.
 *  - otherwise → the stored toggle, defaulting to true (fail-open) on a
 *    missing row OR a read error — matches today's always-on notifyOps.
 */
export async function isTelegramAlertEnabled(kind: string): Promise<boolean> {
  if (isLockedPlatformEvent(kind)) return true
  try {
    const map = await loadPreferences()
    return map.get(kind) ?? true
  } catch {
    return true
  }
}
