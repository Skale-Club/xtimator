/**
 * Phase 1000 (XPHERE-B5) — fire-and-forget Xphere sync dispatch helper.
 *
 * Every lifecycle call site (Plan 04) enqueues a mirror by calling
 * `dispatchXphereSync(companyId, event)`. It wraps `inngest.send` with a
 * `.catch(() => undefined)` so a queue hiccup or unconfigured Inngest key NEVER
 * blocks or breaks a user-facing flow — same discipline as `sendWelcomeEmail`
 * in lib/actions/company.ts. The durable retry + the actual Xphere POST live in
 * the xphereSyncJob (Plan 03); this helper only enqueues.
 */
import 'server-only'
import { inngest } from '@/lib/inngest/client'
import { EVENT_XPHERE_SYNC } from '@/lib/inngest/events'
import type { XphereSyncEvent } from '@/lib/integrations/xphere/types'
import { assertCompanyWritable } from '@/lib/demo/guard'

/**
 * Fire-and-forget Xphere sync dispatch. NEVER awaited by user flows — mirrors the
 * sendWelcomeEmail discipline. Swallows all errors so a queue hiccup never breaks UX.
 */
export function dispatchXphereSync(companyId: string, event: XphereSyncEvent): void {
  void (async () => {
    const denied = await assertCompanyWritable(companyId)
    if (denied) return

    await inngest.send({
      name: EVENT_XPHERE_SYNC,
      data: { companyId, event, occurredAt: new Date().toISOString() },
    })
  })().catch(() => undefined)
}
