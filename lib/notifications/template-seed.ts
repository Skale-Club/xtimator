/**
 * Phase 172 (TMPL-01) — Day-one seed for `notification_templates`.
 *
 * Single TypeScript source of truth for the `notification_templates` seed
 * data. `supabase/migrations/20260721000001_phase172_notification_templates.sql`
 * hand-copies its 17 seed `INSERT` rows VERBATIM from this module — the two
 * are cross-checked by `tests/unit/notifications/template-seed-completeness.test.ts`
 * so they can never silently drift apart.
 *
 * Why `Record<EventType, TemplateSeedEntry>` (not an array or a partial map):
 * `lib/notifications/copy.ts`'s `buildNotificationCopy` is a `switch` over
 * `EventType` with NO `default` case — that is the only thing today that
 * makes forgetting to add copy for a new `EventType` a `tsc` COMPILE error
 * instead of a silent runtime gap (research/PITFALLS.md Pitfall 1). Moving
 * the copy into a DB table would normally lose that guarantee (a missing row
 * is a runtime condition, not a build failure). `Record<EventType, ...>`
 * re-establishes it at the TS layer: TypeScript requires every key of the
 * `EventType` union to be present here, so adding a new `EventType` to
 * `event-types.ts` without a matching entry in this file fails
 * `npx tsc --noEmit -p tsconfig.ci.json`, which is a CI gate.
 * `template-seed-completeness.test.ts` adds a second, independent runtime
 * check on top of this compile-time one.
 *
 * Byte-equivalence baseline (IMPORTANT — read before editing):
 * Every `body` below is hand-derived from the CURRENT `copy.ts` switch by
 * substituting each `ctx.<field>` access with a literal `{{field}}`
 * placeholder, using a FULLY-POPULATED `CopyContext` as the equivalence
 * baseline. `copy.ts` also defines per-field FALLBACK strings for a SPARSE
 * (partially-missing) `ctx` — e.g. `ctx.clientName ?? 'A client'`,
 * `ctx.projectName ?? 'a project'`, `ctx.daysRemaining ?? 3` — which a plain
 * `{{var}}` string-substitution interpolator (the kind plan 172-03's
 * resolver will use) does NOT reproduce; a sparse ctx renders those tokens
 * as `''` (empty string) instead of falling back to `'A client'` / `'a
 * project'` / `3`. This is a documented, ACCEPTED simplification: no call
 * site passes a `copyContext` into the DB-templates path today (this table
 * ships inert — see the migration header), so the gap is not yet reachable.
 * Phase 174's call-site sweep MUST either (a) pass a fully-populated ctx to
 * every swept `notify()`/resolver call, or (b) reproduce these exact
 * per-field defaults in whatever interpolator it ships — otherwise a
 * legitimately-sparse ctx will silently render blanks where `copy.ts` today
 * renders a coherent fallback sentence.
 *
 * CREDITUI-04 / Pitfall 5 guard (non-negotiable — do not "fix" this):
 * `admin.bonus_credits_granted`'s `variables` MUST stay `[]` and its `body`
 * MUST stay the static string below, with NO `{{credits}}` /
 * `{{amount}}` token. `tests/unit/notifications/copy-tenant-neutrality.test.ts`
 * locks in that this event's rendered body never contains a digit (a real,
 * already-shipped business rule — tenants never see raw credit counts, only
 * a % bar). An empty variable catalog here is what makes the future admin
 * template editor (Phase 173) structurally unable to reintroduce that
 * regression: the variable simply isn't offered to insert.
 */

import type { EventType } from './event-types'

export interface TemplateSeedEntry {
  title: string
  body: string
  /** Catalog for the future admin editor (TMPL-03) — NOT enforced/validated yet. */
  variables: string[]
}

// Record<EventType, ...> is the load-bearing type choice — see doc header.
export const EVENT_TEMPLATE_SEED: Record<EventType, TemplateSeedEntry> = {
  'estimate.viewed': {
    title: 'Estimate viewed',
    body: '{{clientName}} opened estimate {{estimateNumber}}.',
    variables: ['clientName', 'estimateNumber'],
  },
  'estimate.accepted': {
    title: 'Estimate accepted',
    body: '{{clientName}} accepted {{estimateNumber}}.',
    variables: ['clientName', 'estimateNumber'],
  },
  'estimate.declined': {
    title: 'Estimate declined',
    body: '{{clientName}} declined {{estimateNumber}}.',
    variables: ['clientName', 'estimateNumber'],
  },
  'estimate.expired': {
    title: 'Estimate expired',
    body: 'Estimate {{estimateNumber}} reached its expiry without a response.',
    variables: ['estimateNumber'],
  },
  'payment.received': {
    title: 'Payment received',
    body: '{{amountUSD}} received for {{projectName}}.',
    variables: ['amountUSD', 'projectName'],
  },
  'payment.refunded': {
    title: 'Payment refunded',
    body: '{{amountUSD}} refunded for {{projectName}}.',
    variables: ['amountUSD', 'projectName'],
  },
  'trial.expiring_3d': {
    title: 'Trial ends soon',
    body: 'Your trial ends in {{daysRemaining}} days. Upgrade to keep Pro features.',
    variables: ['daysRemaining'],
  },
  'trial.expired': {
    title: 'Trial expired',
    body: 'Your trial has ended. You have been moved to the free plan.',
    variables: [],
  },
  'trial.converted': {
    title: 'Welcome to Pro',
    body: 'Your subscription is active. Thanks for upgrading!',
    variables: [],
  },
  'quota.80pct': {
    title: 'Approaching monthly limit',
    body: 'You have used {{quotaPercent}}% of your monthly AI quota.',
    variables: ['quotaPercent'],
  },
  'quota.exhausted': {
    title: 'Monthly quota exhausted',
    body: 'You have used all included AI credits this month. Upgrade or wait until reset.',
    variables: [],
  },
  'whatsapp.inbound': {
    title: 'New WhatsApp message',
    body: 'Message from {{whatsappFrom}}.',
    variables: ['whatsappFrom'],
  },
  'ai_job.failed': {
    title: 'AI job failed',
    body: '{{jobType}} did not complete: {{errorMessage}}.',
    variables: ['jobType', 'errorMessage'],
  },
  'ai_job.completed': {
    title: 'AI job complete',
    body: '{{jobType}} finished successfully.',
    variables: ['jobType'],
  },
  'admin.tier_changed': {
    title: 'Plan updated by admin',
    body: 'Your plan was changed from {{tierFrom}} to {{tierTo}}.',
    variables: ['tierFrom', 'tierTo'],
  },
  // CREDITUI-04 / Pitfall 5 guard — see doc header. variables MUST stay [].
  'admin.bonus_credits_granted': {
    title: 'Bonus credits granted',
    body: 'An admin added bonus credits to your account.',
    variables: [],
  },
  'system.maintenance': {
    title: '{{maintenanceTitle}}',
    body: '{{maintenanceBody}}',
    variables: ['maintenanceTitle', 'maintenanceBody'],
  },
}
