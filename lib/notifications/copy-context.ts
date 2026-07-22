/**
 * Phase 174 (TNT-01) — sparse-ctx default enrichment, closing carry-forward
 * (a) from 172-03-SUMMARY.md ("Sparse-ctx regression risk").
 *
 * `lib/notifications/copy.ts`'s `buildNotificationCopy` fills in coherent
 * per-field defaults for a sparse `CopyContext` (e.g.
 * `ctx.clientName ?? 'A client'`), but the `{{var}}` interpolator in
 * `template-engine.ts` does NOT — a missing ctx field renders as `''`. The
 * `notification_templates` table's 17 seed rows are already `is_active =
 * true`, so once a genuinely-sparse call site's `copyContext` flows through
 * the DB-template resolver, a missing field would render literal blanks
 * where `copy.ts` today renders a coherent fallback sentence.
 *
 * `buildFullCopyContext` is the ONE shared helper (applied centrally by
 * Plan 174-04's `dispatch.ts` wiring, ahead of template resolution) that
 * fills every genuinely-missing `CopyContext` field with the EXACT SAME
 * default `copy.ts`'s `buildNotificationCopy` uses for that event, so a
 * sparse ctx never regresses to a blank tenant-facing notification.
 *
 * MUST be kept in lockstep with `copy.ts`: every `ctx.field ?? <default>`
 * expression in a `buildNotificationCopy` branch must have an identical
 * counterpart here. This is a lint-by-inspection concern, not automatable
 * beyond:
 *  1. The exhaustive `switch (eventType)` below has NO `default` case —
 *     mirrors `copy.ts`'s own compile-time completeness trick (see that
 *     file's header comment): adding a new `EventType` to `event-types.ts`
 *     without a matching case here fails `tsc --noEmit`.
 *  2. `tests/unit/notifications/copy-context.test.ts`'s resolver-path proof
 *     — for every event, `renderTemplate(EVENT_TEMPLATE_SEED[e].body,
 *     buildFullCopyContext(e, {}), 'text')` must equal
 *     `buildNotificationCopy(e, {}).body` (and same for `.title`). This is
 *     a genuine correctness proof (unlike a round-trip through
 *     `buildNotificationCopy`, which re-applies its own defaults regardless
 *     of what this function did or didn't fill in, and so cannot detect a
 *     missing field).
 *
 * `admin.bonus_credits_granted` — CREDITUI-04 / Pitfall 5 guard: `ctx.credits`
 * exists on `CopyContext` but is NEVER read by `copy.ts`'s branch for this
 * event (the body is a static string with no `{{credits}}` token — tenants
 * never see a raw credit count, see `copy-tenant-neutrality.test.ts`). This
 * function must NOT invent a default for it — the case below passes `ctx`
 * through unchanged, same as `copy.ts` does.
 *
 * KNOWN pre-existing artifact (out of this plan's scope — see
 * .planning/phases/174-tenant-cutover-whatsapp-reenable/deferred-items.md):
 * `copy.ts`'s `estimate.viewed` and `estimate.expired` branches
 * post-process the ENTIRE interpolated string with `.trim()` /
 * `.replace(/\s+/g, ' ')` AFTER concatenation — a whole-string
 * normalization the static DB seed template text has no equivalent lever
 * for (a single `{{var}}` substitution cannot retroactively delete a
 * literal space baked into the surrounding template text). For a sparse
 * ctx, this produces one stray interior space in the resolver-rendered
 * output for these two events ONLY — never a missing/blank field. Proven
 * unfixable from this file (no value for `estimateNumber` can delete a
 * preceding literal template-text space); the real fix belongs to
 * `template-seed.ts` (Phase 172, out of this plan's scope fence).
 */

import type { EventType } from './event-types'
import type { CopyContext } from './copy'

export function buildFullCopyContext(
  eventType: EventType,
  ctx: CopyContext = {}
): CopyContext {
  switch (eventType) {
    case 'estimate.viewed':
      return {
        ...ctx,
        clientName: ctx.clientName ?? 'A client',
        estimateNumber: ctx.estimateNumber ?? '',
      }
    case 'estimate.accepted':
    case 'estimate.declined':
      return {
        ...ctx,
        clientName: ctx.clientName ?? 'A client',
        estimateNumber: ctx.estimateNumber ?? 'your estimate',
      }
    case 'estimate.expired':
      return {
        ...ctx,
        estimateNumber: ctx.estimateNumber ?? '',
      }
    case 'payment.received':
    case 'payment.refunded':
      return {
        ...ctx,
        amountUSD: ctx.amountUSD ?? 'A payment',
        projectName: ctx.projectName ?? 'a project',
      }
    case 'trial.expiring_3d':
      return {
        ...ctx,
        daysRemaining: ctx.daysRemaining ?? 3,
      }
    case 'trial.expired':
    case 'trial.converted':
    case 'quota.exhausted':
      // copy.ts's branches for these three reference no ctx fields at all —
      // pass ctx through unchanged, not an error.
      return { ...ctx }
    case 'quota.80pct':
      return {
        ...ctx,
        quotaPercent: ctx.quotaPercent ?? 80,
      }
    case 'whatsapp.inbound':
      return {
        ...ctx,
        whatsappFrom: ctx.whatsappFrom ?? 'a contact',
      }
    case 'ai_job.failed':
      return {
        ...ctx,
        jobType: ctx.jobType ?? 'Job',
        errorMessage: ctx.errorMessage ?? 'unknown error',
      }
    case 'ai_job.completed':
      return {
        ...ctx,
        jobType: ctx.jobType ?? 'Job',
      }
    case 'admin.tier_changed':
      return {
        ...ctx,
        tierFrom: ctx.tierFrom ?? 'previous',
        tierTo: ctx.tierTo ?? 'new',
      }
    case 'admin.bonus_credits_granted':
      // See CREDITUI-04 guard in the doc header — no default for `credits`.
      return { ...ctx }
    case 'system.maintenance':
      return {
        ...ctx,
        maintenanceTitle: ctx.maintenanceTitle ?? 'Scheduled maintenance',
        maintenanceBody: ctx.maintenanceBody ?? 'Brief downtime expected.',
      }
  }
}
