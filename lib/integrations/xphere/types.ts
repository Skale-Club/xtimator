/**
 * Phase 1000: Xphere CRM sync — shared request/response types + event-name union.
 *
 * Implements XPHERE-B3-MAP (typed mapping contract). The single import source for
 * the Xphere client + Inngest sync job (built in later plans). The webhook body
 * shape is FIXED by the already-built Xphere receiver
 * (`POST {XPHERE_BASE_URL}/api/xtimator/webhook`); see 1000-CONTEXT.md <decisions>.
 */

/** Lifecycle events Xtimator emits to Xphere. */
export const XPHERE_SYNC_EVENTS = [
  'company.created',
  'company.updated',
  'estimate.created',
  'estimate.sent',
  'subscription.updated',
  'trial.expired',
] as const

export type XphereSyncEvent = (typeof XPHERE_SYNC_EVENTS)[number]

/** Subscription tier on `companies.tier`. */
export type XphereTier = 'free' | 'trial' | 'pro' | 'business'

/**
 * The subset of `companies` columns the pure mapping reads. `companies.id` is
 * the Xphere `external_id` (idempotency key). Optional columns are `| null` to
 * mirror the nullable DB shape.
 */
export interface XphereCompanyInput {
  id: string
  name: string
  owner_name?: string | null
  email?: string | null
  phone?: string | null
  industry?: string | null
  website?: string | null
  address?: string | null
  tier: XphereTier
  tier_trial_ends_at?: string | null
  stripe_customer_id?: string | null
  created_at?: string | null
}

/** The body sent to the generic Xphere CRM-mirror endpoint POST /api/v1/sync. */
export interface XphereSyncPayload {
  /** Producing system in the shared org model — discriminates the mirror. */
  source: 'xtimator'
  event: XphereSyncEvent
  /** ISO8601 — drives last-write-wins ordering in Xphere. */
  occurred_at: string
  delivery_id?: string
  company: {
    id: string
    name: string
    owner_name?: string | null
    email?: string | null
    phone?: string | null
    industry?: string | null
    website?: string | null
    address?: string | null
    /** Applied to the Xphere Contact, e.g. ['xtimator:pro']. */
    tags: string[]
    /** Merged onto the Xphere Contact; current-state snapshot. */
    custom_fields: Record<string, string | null>
  }
  /** Optional — the subscription Opportunity in the "Xtimator Lifecycle" pipeline. */
  opportunity?: {
    stage: string
    status: 'open' | 'won' | 'lost'
    value: number
    title: string
    /** Target pipeline name in the org (the receiver resolves the stage by name). */
    pipeline: string
  }
  /** Optional — appended to the Contact timeline (only for meaningful events). */
  note?: { title: string; content: string }
}

/** Always HTTP 200 from the Xphere receiver. */
export interface XphereSyncResponse {
  ok: true
  account_id: string | null
  contact_id: string | null
  opportunity_id?: string | null
  /** Surfaced (not fatal) when the Xphere pipeline/stage setup is incomplete. */
  opportunity_skipped?: 'no_pipeline' | 'no_stage'
}
