/**
 * Phase 176 Plan 03 — platform-wide quiet-hours guard.
 *
 * Pure module: consumes the `zones` array produced by
 * lib/notifications/timezone-derive.ts's resolveRecipientZones(). No DB
 * access, no Date.now() call baked into the logic path — the current
 * instant is always an explicit `at` parameter (defaults to `new Date()`
 * only at the call boundary), keeping the function deterministic and
 * testable with injected clocks.
 *
 * Window: there is no single federal bright line for SMS quiet hours, but
 * Florida/Oklahoma statute a stricter 8am-8pm local window. CUST-04's
 * "platform-wide guard" is satisfied most defensibly by adopting that
 * stricter window everywhere (Operational Decision #3). Expressed as named
 * constants (not inline magic numbers) so a future owner/legal decision to
 * change the window doesn't require touching the comparison logic.
 */

export const QUIET_HOURS_START_HOUR = 8 // 8:00am local, inclusive
export const QUIET_HOURS_END_HOUR = 20 // 8:00pm local, EXCLUSIVE (research: 8am-8pm)

/**
 * Computes the local hour (0-23) for a given instant in a given IANA
 * timezone, using Intl.DateTimeFormat (zero new dependency, DST-aware,
 * matches lib/utils/format-date.ts's existing Intl convention).
 */
function localHour(zone: string, at: Date): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hour12: false,
  }).format(at)
  // Node's Intl sometimes returns '24' for midnight instead of '0' —
  // normalize via modulo.
  return Number(hourStr) % 24
}

/**
 * Returns `true` only if the given instant falls within
 * [QUIET_HOURS_START_HOUR, QUIET_HOURS_END_HOUR) local time in EVERY zone
 * in `zones` (intersection). A single-zone array behaves like a normal
 * single-timezone check; a multi-zone array (split-timezone-state clients)
 * is evaluated against the most restrictive zone — the guard only allows a
 * send when ALL plausible zones are simultaneously within the window.
 *
 * An empty `zones` array returns `false` (defensive fail-closed; callers
 * should never produce one via resolveRecipientZones(), but this function
 * treats "no zones" as "unresolved" rather than "always allowed").
 */
export function isWithinQuietHours(zones: string[], at: Date = new Date()): boolean {
  if (zones.length === 0) return false

  return zones.every((zone) => {
    const hour = localHour(zone, at)
    return hour >= QUIET_HOURS_START_HOUR && hour < QUIET_HOURS_END_HOUR
  })
}
