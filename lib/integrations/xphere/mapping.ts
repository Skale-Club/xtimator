/**
 * Phase 1000: Xphere CRM sync — pure mapping layer.
 *
 * Implements XPHERE-B3-MAP. `buildSyncPayload(company, event)` is a PURE transform
 * from a `companies` row + lifecycle event into the FIXED Xphere webhook body. No
 * network, no DB — every tier→stage / tags / custom_fields / note-text decision
 * lives here so the Inngest job stays thin and the stage literals are unit-locked.
 */

import type {
  XphereCompanyInput,
  XphereSyncEvent,
  XphereSyncPayload,
} from '@/lib/integrations/xphere/types'

/**
 * The Xphere pipeline these opportunities land in. MUST match the Xphere
 * "Xtimator Lifecycle" pipeline name verbatim (single source of truth).
 */
export const XPHERE_PIPELINE_NAME = 'Xtimator Lifecycle' as const

/**
 * Opportunity stage names. These strings MUST match the Xphere "Xtimator
 * Lifecycle" pipeline stages verbatim, INCLUDING the em dash (U+2014 "—") — a
 * hyphen will NOT match and the opportunity will be skipped (`no_stage`).
 */
export const XPHERE_STAGES = {
  trial: 'Trial',
  pro: 'Active — Pro', // em dash U+2014 — must match Xphere verbatim
  business: 'Active — Business', // em dash U+2014
  churned: 'Churned',
} as const

type StageStatus = { stage: string; status: 'open' | 'won' | 'lost' }

/** tier → {stage, status}. `trial.expired` overrides this to Churned (handled in builder). */
function tierToStage(tier: XphereCompanyInput['tier']): StageStatus {
  switch (tier) {
    case 'trial':
      return { stage: XPHERE_STAGES.trial, status: 'open' }
    case 'pro':
      return { stage: XPHERE_STAGES.pro, status: 'won' }
    case 'business':
      return { stage: XPHERE_STAGES.business, status: 'won' }
    case 'free':
    default:
      return { stage: XPHERE_STAGES.churned, status: 'lost' }
  }
}

/** Per-event timeline note; `null` for events not worth a timeline entry. */
const NOTE_BY_EVENT: Record<
  XphereSyncEvent,
  { title: string; content: string } | null
> = {
  'company.created': { title: 'Account created', content: 'Signed up for Xtimator.' },
  'company.updated': null,
  'estimate.created': { title: 'Estimate created', content: 'Created a new estimate draft.' },
  'estimate.sent': { title: 'Estimate sent', content: 'Sent an estimate to a client.' },
  'subscription.updated': { title: 'Subscription updated', content: '' }, // content filled per-company below
  'trial.expired': { title: 'Trial expired', content: 'Free trial has expired.' },
}

/**
 * Pure transform: `companies` row + lifecycle event → Xphere webhook body.
 * No side effects, no I/O.
 */
export function buildSyncPayload(
  company: XphereCompanyInput,
  event: XphereSyncEvent,
): XphereSyncPayload {
  // trial.expired forces Churned/lost regardless of the stored tier.
  const opp: StageStatus =
    event === 'trial.expired'
      ? { stage: XPHERE_STAGES.churned, status: 'lost' }
      : tierToStage(company.tier)

  // Note text: subscription.updated mentions the current tier; others are static.
  let note = NOTE_BY_EVENT[event]
  if (note && event === 'subscription.updated') {
    note = { title: note.title, content: `Subscription is now ${company.tier}.` }
  }

  const payload: XphereSyncPayload = {
    source: 'xtimator',
    event,
    occurred_at: new Date().toISOString(),
    company: {
      id: company.id,
      name: company.name,
      owner_name: company.owner_name ?? null,
      email: company.email ?? null,
      phone: company.phone ?? null,
      industry: company.industry ?? null,
      website: company.website ?? null,
      address: company.address ?? null,
      tags: [`xtimator:${company.tier}`],
      custom_fields: {
        xtimator_tier: company.tier,
        xtimator_trial_ends_at: company.tier_trial_ends_at ?? null,
        xtimator_stripe_customer_id: company.stripe_customer_id ?? null,
        xtimator_signed_up_at: company.created_at ?? null,
        xtimator_last_event: event,
      },
    },
    opportunity: {
      stage: opp.stage,
      status: opp.status,
      // Pure transform has no Stripe lookup; pass 0 (CONTEXT: plan value if readily available else 0).
      value: 0,
      title: `${company.name} — Subscription`, // em dash U+2014
      pipeline: XPHERE_PIPELINE_NAME,
    },
  }

  if (note) {
    payload.note = note
  }

  return payload
}
