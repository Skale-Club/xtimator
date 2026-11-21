import 'server-only'
import { recordPipelineEvent, type PipelineInputType } from '@/lib/observability/pipeline-events'
import { EVENT_CREDITS_GRANTED } from '@/lib/inngest/events'

/**
 * Credits plan 2026-11-20 - pause a capture between steps when credits run
 * out, and carry on by itself after a top-up.
 *
 * An estimate's cost varies, so a live subscriber may start with any positive
 * balance. Before each step that costs credits (analyzing the pending photos,
 * generating) the run checks the spendable balance:
 *   - positive (or exempt / enforcement off): the step runs. A step that starts
 *     always finishes, even if it leaves the balance negative (credit_debt,
 *     paid down first by the next grant).
 *   - empty: the run PAUSES. It journals a `started` row with error_code
 *     `awaiting_credits` (the capture screen reads it as "paused", the watchdog
 *     leaves it alone), tells the owner, and waits for `billing/credits.granted`
 *     for this company. Waiting holds no concurrency slot.
 *   - credits arrive: re-check (a grant that only paid down debt leaves the
 *     balance empty, so it keeps waiting), journal a plain `started` row
 *     (resumed) and continue. The wait is a bounded loop, not one 7-day wait:
 *     the pause is journalled in one step and the wait registered in a later
 *     one, so a top-up landing in between (or between two waits) would be
 *     missed and the run would sit until expiry. Each wait therefore times out
 *     after at most an hour (six hours once the pause is over a day old) and
 *     re-checks the balance, the same check that decided to pause. What was already done (transcript, analyzed
 *     photos) is reused, never redone or charged again.
 *   - no credits within `creditPauseDays`: the pause expires (journal `failed`
 *     with `credit_pause_expired`); the project keeps its transcript and
 *     photos and can be generated again later.
 */

export const AWAITING_CREDITS = 'awaiting_credits'
export const CREDIT_PAUSE_EXPIRED = 'credit_pause_expired'

export type PauseStep = 'analyze' | 'generate_estimate'

/** The subset of the Inngest step API this helper uses (keeps it testable). */
export type StepLike = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
  waitForEvent: (
    id: string,
    opts: { event: string; timeout: string; if?: string }
  ) => Promise<unknown | null>
}

export type PauseContext = {
  companyId: string
  projectId: string
  attemptId: string
  inputType: PipelineInputType
  ownerUserId: string | null
  /** The step the run is about to take. */
  next: PauseStep
}

/** Hard bound on loop iterations (a safety net; the deadline normally ends it). */
const MAX_WAKES = 400

const HOUR_MS = 3_600_000
/** Poll every hour for the first day of a pause, then every six hours: bounds the step count. */
function pollIntervalMs(elapsedMs: number): number {
  return elapsedMs < 24 * HOUR_MS ? HOUR_MS : 6 * HOUR_MS
}

function timeoutFor(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 60000))}m`
}

/**
 * Returns 'continue' when the run may take `ctx.next` now (possibly after a
 * pause), or 'expired' when the pause timed out and the run must stop.
 */
export async function continueOrPauseForCredits(
  step: StepLike,
  ctx: PauseContext
): Promise<'continue' | 'expired'> {
  const first = await step.run(`credits-check-${ctx.next}`, () => hasCredits(ctx.companyId))
  if (first) return 'continue'

  // Auto top-up on (delivery 3): try it before pausing. The charge respects
  // the company's own switch, threshold, cooldown and failure backoff; on
  // success the grant lands synchronously and the run simply carries on.
  const recharged = await step.run(`credits-autotopup-${ctx.next}`, async () => {
    try {
      const { triggerAutoTopupIfNeeded } = await import('@/lib/billing/auto-topup')
      await triggerAutoTopupIfNeeded({ companyId: ctx.companyId, newBalance: 0 })
    } catch (err) {
      console.warn('[credit-pause] auto top-up attempt failed:', err instanceof Error ? err.message : err)
    }
    return hasCredits(ctx.companyId)
  })
  if (recharged) return 'continue'

  const pause = await step.run(`credits-pause-${ctx.next}`, async () => {
    const { getBillingConfig } = await import('@/lib/billing/billing-config')
    const cfg = await getBillingConfig()
    const days = Math.max(1, Math.min(30, Number(cfg.creditPauseDays) || 7))
    const pausedAt = Date.now()
    const expiresAt = new Date(pausedAt + days * 86_400_000).toISOString()
    await recordPipelineEvent({
      attemptId: ctx.attemptId,
      inputType: ctx.inputType,
      step: 'generate_estimate',
      status: 'started',
      companyId: ctx.companyId,
      projectId: ctx.projectId,
      userId: ctx.ownerUserId,
      errorCode: AWAITING_CREDITS,
      errorMessage: 'Paused: out of credits',
      metadata: { paused: true, next: ctx.next, expiresAt },
    })
    await notifyPaused(ctx, expiresAt)
    return { expiresAt, pausedAt }
  })

  const deadline = Date.parse(pause.expiresAt)
  // The clock is read inside memoized steps only (a bare Date.now() would be
  // re-stamped on every Inngest replay). The recheck step both re-checks the
  // balance and stamps `now` for the next iteration.
  const startedAt = Number.isFinite(pause.pausedAt) ? pause.pausedAt : deadline - 7 * 86_400_000
  let now = startedAt
  for (let wake = 0; wake < MAX_WAKES; wake++) {
    const remaining = deadline - now
    if (remaining <= 0) break
    await step.waitForEvent(`credits-wait-${ctx.next}-${wake}`, {
      event: EVENT_CREDITS_GRANTED,
      timeout: timeoutFor(Math.min(remaining, pollIntervalMs(now - startedAt))),
      if: `async.data.companyId == "${ctx.companyId}"`,
    })
    // Granted OR timed out: either way, look at the balance (a timeout is what
    // catches a top-up that landed while no wait was registered).
    const check = await step.run(`credits-recheck-${ctx.next}-${wake}`, async () => ({
      ok: await hasCredits(ctx.companyId),
      now: Date.now(),
    }))
    // A run paused before this loop shipped may replay an old memoized recheck
    // under the same step id, which returned a bare boolean. Treat it as "no
    // clock reading" and move the clock forward by one interval.
    const legacy = typeof check !== 'object' || check === null
    const ok = legacy ? (check as unknown) === true : check.ok === true
    now = legacy || !Number.isFinite(check.now) ? now + pollIntervalMs(now - startedAt) : check.now
    if (ok) {
      await step.run(`credits-resume-${ctx.next}`, async () => {
        await recordPipelineEvent({
          attemptId: ctx.attemptId,
          inputType: ctx.inputType,
          step: 'generate_estimate',
          status: 'started',
          companyId: ctx.companyId,
          projectId: ctx.projectId,
          userId: ctx.ownerUserId,
          metadata: { resumed: true, next: ctx.next },
        })
      })
      return 'continue'
    }
  }

  await step.run(`credits-expired-${ctx.next}`, async () => {
    await recordPipelineEvent({
      attemptId: ctx.attemptId,
      inputType: ctx.inputType,
      step: 'generate_estimate',
      status: 'failed',
      companyId: ctx.companyId,
      projectId: ctx.projectId,
      userId: ctx.ownerUserId,
      errorCode: CREDIT_PAUSE_EXPIRED,
      errorMessage: 'The pause for credits expired',
    })
  })
  return 'expired'
}

/** Fails OPEN: a balance read error must never pause (or fail) a paid run. */
async function hasCredits(companyId: string): Promise<boolean> {
  try {
    const { canContinueRun } = await import('@/lib/billing/access-state')
    return (await canContinueRun(companyId)).ok
  } catch (err) {
    console.warn('[credit-pause] balance check failed open:', err instanceof Error ? err.message : err)
    return true
  }
}

/** Email + in-app to the owner; never throws. */
async function notifyPaused(ctx: PauseContext, expiresAt: string): Promise<void> {
  try {
    const [{ notify }, { requireServiceClient }, { isTopupEligible }] = await Promise.all([
      import('@/lib/notifications/dispatch'),
      import('@/lib/supabase/service'),
      import('@/lib/billing/topup-eligibility'),
    ])
    const svc = requireServiceClient()
    const [{ data: project }, { data: company }] = await Promise.all([
      svc.from('projects').select('name').eq('id', ctx.projectId).maybeSingle(),
      svc
        .from('companies')
        .select('tier, stripe_subscription_status, stripe_subscription_id')
        .eq('id', ctx.companyId)
        .maybeSingle(),
    ])
    const row = company as { tier?: string | null; stripe_subscription_status?: string | null; stripe_subscription_id?: string | null } | null
    const subscriber = row ? isTopupEligible(row.tier, row.stripe_subscription_status, row.stripe_subscription_id) : false
    const name = (project as { name?: string } | null)?.name
    const until = new Date(expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const action = subscriber ? 'Buy credits' : 'Subscribe to Xtimator Pro'
    await notify({
      companyId: ctx.companyId,
      userId: ctx.ownerUserId,
      // Reuses the billing "out of credits" event type (no new type, no migration).
      eventType: 'quota.exhausted',
      title: name ? `Your estimate for "${name}" is paused` : 'Your estimate is paused',
      body: `You ran out of credits before it finished. What was already done is saved until ${until}. ${action} and it picks up where it stopped.`,
      linkUrl: `/projects/${ctx.projectId}?paused=${encodeURIComponent(ctx.attemptId)}`,
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: `credit-pause-${ctx.attemptId}` },
    })
  } catch (err) {
    console.warn('[credit-pause] notify failed:', err instanceof Error ? err.message : err)
  }
}
