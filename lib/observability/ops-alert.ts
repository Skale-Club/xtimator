import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { getRedis } from '@/lib/redis'
import { sendTelegramMessage } from '@/lib/telegram/client'
import { isTelegramAlertEnabled } from '@/lib/observability/platform-preferences'

/**
 * lib/observability/ops-alert.ts
 *
 * The never-throw system-health fan-out. `notifyOps` is the single choke point
 * every ops alert flows through:
 *
 *   Redis SETNX dedupe (fail-open) → Sentry.captureMessage → sendTelegramMessage
 *
 * Each downstream failure is swallowed INDEPENDENTLY: a throwing Sentry does not
 * stop the Telegram send; a throwing/dormant Telegram does not throw out of
 * notifyOps; and an unavailable or erroring Redis FAILS OPEN (the alert still
 * sends) rather than fail closed. This is load-bearing: an unconfigured Telegram
 * or a down Redis can never break the hot AI path that fires these alerts.
 *
 * Company-agnostic: alerts carry only the kind/title/message — never a companyId.
 */

import { formatOpsMessage, type OpsAlert } from './ops-message'
export { formatOpsMessage, type OpsAlert } from './ops-message'

export async function notifyOps(alert: OpsAlert): Promise<void> {
  try {
    // (1) Dedupe — fail-open when Redis is absent or errors.
    if (alert.dedupeKey) {
      const redis = getRedis()
      if (redis) {
        try {
          const ok = await redis.set(`ops:${alert.dedupeKey}`, Date.now().toString(), {
            nx: true,
            ex: alert.suppressWindowSec ?? 900,
          })
          // SETNX returns null when the key already exists → suppressed in-window.
          if (!ok) return
        } catch {
          // Redis hiccup → fail open (proceed to send).
        }
      }
    }

    const severity = alert.severity ?? 'warning'

    // (2) Sentry — a Sentry failure must not stop the Telegram send.
    try {
      Sentry.captureMessage(`[ops:${alert.kind}] ${alert.title}`, {
        level: severity,
        tags: { ops_alert: alert.kind },
        extra: { message: alert.message },
      })
    } catch {
      // Swallow: Sentry down must not break the fan-out.
    }

    // (3) Telegram — gated per-kind by the admin toggle matrix (PLAT-02), EXCEPT
    // locked/critical kinds which always deliver (PLAT-03). The toggle check
    // itself never throws (fail-open); a Telegram failure (incl. 'not
    // configured') is still swallowed exactly as before.
    try {
      const telegramEnabled = await isTelegramAlertEnabled(alert.kind)
      if (telegramEnabled) {
        // Signup contacts belong only in the dedicated Leads group. All other
        // platform alerts retain the existing default technical Ops route.
        if (alert.kind === 'tenant_signup') await sendTelegramMessage(formatOpsMessage(alert), 'leads')
        else await sendTelegramMessage(formatOpsMessage(alert))
      }
    } catch {
      // Swallow: dormant/erroring Telegram (or a toggle-check hiccup) must not throw out of notifyOps.
    }
  } catch {
    // Belt-and-suspenders: notifyOps NEVER throws.
  }
}
