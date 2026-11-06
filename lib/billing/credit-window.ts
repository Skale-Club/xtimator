/**
 * SEED-055 Phase C: the monthly credit window.
 *
 * Pro grants credits as a MONTHLY lot that expires at the end of its monthly
 * window, for monthly AND annual subscriptions alike:
 *   - monthly sub: the window is the Stripe billing period;
 *   - annual sub: the window is the current monthly anniversary of the
 *     subscription (annual started Mar 15 -> Mar 15-Apr 15, Apr 15-May 15, ...).
 *
 * Both are derived from one input: `periodEnd`, the end of the Stripe period the
 * subscription is currently paid through (`tier_renews_at` / readPeriodEnd).
 * The window boundaries step back whole calendar months from `periodEnd`.
 * Every boundary is computed from `periodEnd`'s OWN day-of-month and time of day
 * (clamped to the target month's last day), never from the previous boundary, so
 * there is no cumulative drift: a Jan 31 end gives Dec 31, Nov 30, Oct 31 ...
 * and not Dec 31, Nov 30, Oct 30.
 *
 * Pure and UTC-only: no I/O, no clock reads (the caller injects `now`).
 */

export interface MonthlyCreditWindow {
  /** Inclusive window start. */
  start: Date
  /** Exclusive window end - the lot's `expires_at`. */
  end: Date
  /** Window start as `YYYY-MM-DD` (UTC) - the lot's `period_key`. */
  periodKey: string
}

/** Upper bound on how far back the search walks (100 years of months). */
const MAX_STEPS = 1200

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * `anchor` shifted back by `months` calendar months, keeping the anchor's own
 * day-of-month (clamped to the target month's length) and time of day.
 */
function shiftMonthsBack(anchor: Date, months: number): Date {
  const total = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() - months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month))
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  )
}

/** Default lifetime of a top-up lot, mirrored from DEFAULT_BILLING_CONFIG. */
const DEFAULT_TOPUP_EXPIRY_MONTHS = 3

/**
 * `from` shifted FORWARD by whole calendar months, keeping its day-of-month
 * (clamped to the target month's length) and time of day. UTC.
 */
function shiftMonthsForward(from: Date, months: number): Date {
  const total = from.getUTCFullYear() * 12 + from.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const month = total - year * 12
  const day = Math.min(from.getUTCDate(), daysInUtcMonth(year, month))
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  )
}

/**
 * Expiry (ISO string) of a top-up lot bought at `now`: `months` calendar months
 * later. A missing / non-positive / non-finite `months` (a stored billing row
 * that predates the field, a bad admin value) falls back to 3 - a top-up must
 * never silently become non-expiring.
 */
export function topupExpiresAt(months: number | null | undefined, now: Date = new Date()): string {
  const m =
    typeof months === 'number' && Number.isFinite(months) && months >= 1
      ? Math.floor(months)
      : DEFAULT_TOPUP_EXPIRY_MONTHS
  return shiftMonthsForward(now, m).toISOString()
}

/**
 * The monthly window containing `now`, stepping back whole months from
 * `periodEnd`. Returns null when no window applies: `now >= periodEnd` (the
 * period is not paid / has lapsed) or a malformed date.
 */
export function currentMonthlyCreditWindow(
  periodEnd: Date,
  now: Date,
): MonthlyCreditWindow | null {
  const endMs = periodEnd.getTime()
  const nowMs = now.getTime()
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) return null
  if (nowMs >= endMs) return null

  for (let k = 0; k < MAX_STEPS; k += 1) {
    const end = k === 0 ? new Date(endMs) : shiftMonthsBack(periodEnd, k)
    const start = shiftMonthsBack(periodEnd, k + 1)
    if (start.getTime() <= nowMs) {
      // nowMs < end holds by construction: the previous iteration's start (this
      // window's end) was > nowMs, and for k = 0 the guard above ensured it.
      return { start, end, periodKey: start.toISOString().slice(0, 10) }
    }
  }
  return null
}
