/**
 * lib/observability/error-spike.ts
 *
 * Turns a BURST of server errors into ONE ops alert.
 *
 * Every other platform event names a specific failure someone thought to
 * instrument: transcription failed, cron failed, pipeline stuck. This is the
 * net under all of them. Dozens of real failure paths only ever reach
 * `asResponse()` in lib/errors/index.ts, which logs to console and — for
 * `internal`/`offline` only — forwards to Sentry, and stops there. That is fine
 * for forensics and useless for being told.
 *
 * ## Why a rate, and not each error
 *
 * Alerting per error is unusable: one broken endpoint produces hundreds a
 * minute, and a channel that floods is a channel that gets muted — which costs
 * you the alerts that matter. So this reports a CHANGE IN RATE: silent while
 * errors trickle at their background level, one message when they jump, naming
 * the error codes responsible so the alert says what broke rather than merely
 * that something did.
 *
 * ## Where the threshold came from
 *
 * Measured on this project before choosing (2026-08-29, 30-day window):
 *   - Sentry `errors`:            8 events / 30d  (~0.27/day)
 *   - Sentry `errors`:            2 events / 7d
 *   - Sentry `logs` dataset:      0 ingested
 *   - pipeline_events failed:     10 / 320 over 90d (3.1%)
 *
 * The Sentry figure UNDERSTATES real error volume, because SENTRY_CAPTURE_TYPES
 * in lib/errors/index.ts forwards only `internal` and `offline`. That is exactly
 * why this counter lives in-process at the choke point instead of querying
 * Sentry: it sees every error the API returns, including the ones Sentry never
 * hears about.
 *
 * 10 errors in 5 minutes is roughly two orders of magnitude above that
 * background. It is deliberately blunt: with a near-zero baseline there is no
 * measured *operating* error rate to calibrate against yet, so this is the
 * smallest round number that cannot fire on noise. Revisit once the app carries
 * real traffic — the number to beat is the busiest normal 5-minute window.
 *
 * State is per-process and in memory. A restart resets it, which is correct: a
 * fresh process has no history to compare against, and a restart is itself
 * usually the response to a spike.
 *
 * ## Why notifyOps is imported lazily, and why there is no `server-only`
 *
 * This module is reached from `asResponse()` in lib/errors/index.ts, which is
 * imported by route handlers, server actions and query helpers all over the
 * app. A STATIC `import { notifyOps }` here would pull ops-alert — and behind it
 * Sentry, Upstash Redis, the Telegram client and the Supabase service client —
 * into the module graph of every one of those consumers. That is not
 * theoretical: it broke tests/unit/actions/team-invite.test.ts,
 * tests/unit/billing/seat-billing-wiring.test.ts and
 * tests/unit/whatsapp/confirm.test.ts (the last by timeout) purely by widening
 * what their narrower mocks had to satisfy.
 *
 * So the import happens only on the rare path that actually fires an alert.
 * This mirrors lib/observability/platform-preferences.ts, which lazily imports
 * the Supabase service client for exactly the same reason.
 *
 * `server-only` is deliberately absent for the same reason: the counter holds
 * nothing but integers, and marking it server-only would make it a build error
 * for any client-reachable module that transitively touches lib/errors. The
 * sensitive work is behind the lazy import, which IS server-only.
 */

/** Rolling window over which errors are counted. */
const WINDOW_MS = 5 * 60_000

/** Errors within one window before it counts as a spike. */
const SPIKE_THRESHOLD =
  Number(process.env.ERROR_SPIKE_THRESHOLD) > 0
    ? Math.floor(Number(process.env.ERROR_SPIKE_THRESHOLD))
    : 10

/**
 * Silence after firing. An outage lasts longer than one window, and repeating
 * "still broken" every five minutes is how a channel trains people to ignore
 * it. Thirty minutes is long enough to stay quiet through a deploy-and-recover
 * cycle and short enough that a genuinely worsening incident speaks again.
 */
const COOLDOWN_MS =
  Number(process.env.ERROR_SPIKE_COOLDOWN_MS) > 0
    ? Math.floor(Number(process.env.ERROR_SPIKE_COOLDOWN_MS))
    : 30 * 60_000

/** How many distinct error codes the alert names before it stops listing. */
const TOP_CODES = 5

/**
 * Codes this alert must never count, or it feeds on itself.
 *
 * Delivering the alert calls notifyOps → Sentry + Telegram. If the spike IS an
 * outbound-network or Supabase failure, those calls fail too. notifyOps
 * swallows its own failures, but anything that surfaced as an API error on the
 * notifier's own path would count toward the next window, which would fire
 * another alert, which would fail again. The cooldown alone bounds the loop;
 * excluding the notifier's own surface prevents it from starting.
 */
const SELF_PREFIXES = ['internal:notifications', 'internal:observability']

/**
 * The lazily-resolved notifier, memoised as a PROMISE rather than re-imported
 * per alert.
 *
 * Calling `import()` afresh on each dispatch is both wasteful and, in practice,
 * unreliable: two `import()` calls issued in the same synchronous turn resolved
 * to a single delivered call under Vitest's module mocking, silently dropping
 * an alert. Memoising means every dispatch attaches a `.then()` to the SAME
 * promise, which fans out to all subscribers exactly as expected.
 */
let notifierPromise: Promise<typeof import('@/lib/observability/ops-alert')> | null =
  null

function getNotifier(): Promise<typeof import('@/lib/observability/ops-alert')> {
  notifierPromise ??= import('@/lib/observability/ops-alert')
  return notifierPromise
}

let windowStartedAt = 0
let windowCount = 0
let windowCodes = new Map<string, number>()
let lastAlertAt = 0
/** Re-entrancy guard: errors raised while an alert is in flight don't count. */
let dispatching = false

/** Test seam — the module is process-global, so tests must be able to reset it. */
export function __resetErrorSpikeStateForTests(): void {
  notifierPromise = null
  windowStartedAt = 0
  windowCount = 0
  windowCodes = new Map()
  lastAlertAt = 0
  dispatching = false
}

/** Diagnostics + deterministic unit tests. */
export function getErrorSpikeState(): {
  windowCount: number
  lastAlertAt: number
  threshold: number
} {
  return { windowCount, lastAlertAt, threshold: SPIKE_THRESHOLD }
}

/**
 * Records one server error and fires the alert when the window crosses the
 * threshold.
 *
 * Synchronous, allocation-light and NEVER throws — it runs inside the error
 * response path of every failing request. The send itself is fire-and-forget.
 */
export function recordServerError(code: string, now = Date.now()): void {
  try {
    if (dispatching) return
    if (SELF_PREFIXES.some((p) => code.startsWith(p))) return

    // Roll the window.
    if (now - windowStartedAt > WINDOW_MS) {
      windowStartedAt = now
      windowCount = 0
      windowCodes = new Map()
    }

    windowCount += 1
    windowCodes.set(code, (windowCodes.get(code) ?? 0) + 1)

    if (windowCount < SPIKE_THRESHOLD) return
    if (now - lastAlertAt < COOLDOWN_MS) return

    lastAlertAt = now
    dispatching = true

    const top = [...windowCodes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CODES)
      .map(([name, count]) => `${name} ×${count}`)
      .join('\n')

    const count = windowCount
    const windowMinutes = Math.round(WINDOW_MS / 60_000)

    // Reset immediately so the next window measures the period AFTER the alert,
    // not one already known to be over threshold.
    windowStartedAt = now
    windowCount = 0
    windowCodes = new Map()

    // Lazy import — see the docblock. Fire-and-forget: this runs on the error
    // path of a request that is already failing, and must not add latency to it.
    void getNotifier()
      .then(({ notifyOps }) =>
        notifyOps({
          kind: 'error_spike',
          title: `Server error rate spike — ${count} in ${windowMinutes} min`,
          message:
            `${count} server errors in the last ${windowMinutes} minutes ` +
            `(threshold ${SPIKE_THRESHOLD}).\n\nTop codes:\n${top}\n\n` +
            `Silenced for ${Math.round(COOLDOWN_MS / 60_000)} min so a sustained ` +
            `outage does not repeat this message.`,
          severity: 'error',
          // notifyOps' own Redis dedupe is a second, independent guard. It is
          // fail-open (an absent or erroring Redis still sends), so the
          // in-process cooldown above is the one actually relied upon.
          dedupeKey: 'error-spike',
          suppressWindowSec: Math.round(COOLDOWN_MS / 1000),
        })
      )
      .catch(() => {
        // notifyOps never throws, but the dynamic import itself can fail.
        // Observability must never break the error path it observes.
      })
  } catch {
    // Observability must never break the error path it observes.
  } finally {
    dispatching = false
  }
}
