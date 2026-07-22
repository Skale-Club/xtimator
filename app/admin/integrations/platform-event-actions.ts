'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { isLockedPlatformEvent, PLATFORM_EVENT_KINDS, type PlatformEventKind } from '@/lib/notifications/platform-events'
import { invalidatePlatformPreferencesCache } from '@/lib/observability/platform-preferences'

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string }

/**
 * Phase 175 (PLAT-02/PLAT-03) — persist a single platform-event Telegram
 * toggle. Mirrors the `requireAdmin -> validate -> upsert -> invalidate
 * cache -> revalidate path -> audit` shape used throughout
 * `app/admin/integrations/actions.ts` (e.g. `saveTelegramChatId`).
 *
 * PLAT-03 defense in depth: locked/critical kinds can never be turned off,
 * even via a direct action call — the UI already disables their switch.
 */
export async function savePlatformEventToggle(input: {
  kind: string
  enabled: boolean
}): Promise<ActionResult> {
  const ctx = await requireAdmin()

  if (!PLATFORM_EVENT_KINDS.includes(input.kind as PlatformEventKind)) {
    return { ok: false, message: 'Unknown platform event kind.' }
  }
  if (isLockedPlatformEvent(input.kind) && !input.enabled) {
    return { ok: false, message: 'This event is critical and always delivers.' }
  }

  const svc = requireServiceClient()
  const { error } = await svc.from('platform_notification_preferences').upsert(
    {
      event_kind: input.kind,
      telegram_enabled: input.enabled,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_kind' }
  )
  if (error) return { ok: false, message: error.message }

  invalidatePlatformPreferencesCache()
  revalidatePath('/admin/integrations')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'platform_event.toggle',
    targetType: 'platform_notification_preferences',
    targetId: input.kind,
    metadata: { enabled: input.enabled },
  })

  return { ok: true }
}
