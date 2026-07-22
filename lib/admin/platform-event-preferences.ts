import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { PLATFORM_EVENT_KINDS, PLATFORM_EVENTS, type PlatformEventKind } from '@/lib/notifications/platform-events'

/**
 * Phase 175 (PLAT-02) — admin panel loader for the per-event Telegram toggle
 * matrix. Server-only; runs behind the `/admin/integrations` layout's
 * `requireAdmin()` gate — same posture as `loadCategoryInitials` in
 * `lib/admin/integrations-providers.ts`.
 */

export interface PlatformEventToggleRow {
  kind: PlatformEventKind
  label: string
  category: string
  locked: boolean
  enabled: boolean
}

export async function loadPlatformEventToggles(): Promise<PlatformEventToggleRow[]> {
  const svc = requireServiceClient()
  const { data } = await svc
    .from('platform_notification_preferences')
    .select('event_kind, telegram_enabled')
  const dbMap = new Map<string, boolean>(
    (data ?? []).map((r) => [r.event_kind as string, r.telegram_enabled as boolean])
  )
  return PLATFORM_EVENT_KINDS.map((kind) => {
    const def = PLATFORM_EVENTS[kind]
    return {
      kind,
      label: def.label,
      category: def.category,
      locked: def.locked,
      enabled: def.locked ? true : (dbMap.get(kind) ?? true),
    }
  })
}
