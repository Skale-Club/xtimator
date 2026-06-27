/**
 * Phase 77 / Phase 104 — Notification event catalog.
 *
 * Single source of truth for event types + their category grouping + default
 * per-category channel preferences. Consumed by `lib/notifications/dispatch.ts`
 * (77-02) and `lib/notifications/preferences.ts` (77-02).
 *
 * Phase 104 (NOTIF-01) reduces the visible category set from 8 to 3 — Estimates,
 * Billing, System — plus an internal `_dropped` sentinel for events that are no
 * longer delivered to tenants (whatsapp.inbound, ai_job.*). The full `EventType`
 * union is UNCHANGED so every existing `notify()` call site keeps working; the
 * `_dropped` category simply resolves to no enabled channels (no notification).
 *
 * Adding a new event:
 *  1. Add to `EventType` union below
 *  2. Add to `EVENT_CATEGORIES` map
 *  3. (If new category) add to `EventCategory` union + `DEFAULT_PREFERENCES`
 */

export type EventCategory =
  | 'estimate'
  | 'billing'
  | 'system'
  // Internal sentinel — never shown in any UI. Events mapped here resolve to no
  // deliverable channel (in_app/email/whatsapp/sms all false), so call sites for
  // dropped events (whatsapp.inbound, ai_job.*) stay intact but deliver nothing.
  | '_dropped'

export type EventType =
  | 'estimate.viewed'
  | 'estimate.accepted'
  | 'estimate.declined'
  | 'estimate.expired'
  | 'payment.received'
  | 'payment.refunded'
  | 'trial.expiring_3d'
  | 'trial.expired'
  | 'trial.converted'
  | 'quota.80pct'
  | 'quota.exhausted'
  | 'whatsapp.inbound'
  | 'ai_job.failed'
  | 'ai_job.completed'
  | 'admin.tier_changed'
  | 'admin.bonus_credits_granted'
  | 'system.maintenance'

export const EVENT_CATEGORIES: Record<EventType, EventCategory> = {
  'estimate.viewed': 'estimate',
  'estimate.accepted': 'estimate',
  'estimate.declined': 'estimate',
  'estimate.expired': 'estimate',
  // Billing = merge of today's Payments + Trial + Quota + Admin.
  'payment.received': 'billing',
  'payment.refunded': 'billing',
  'trial.expiring_3d': 'billing',
  'trial.expired': 'billing',
  'trial.converted': 'billing',
  'quota.80pct': 'billing',
  'quota.exhausted': 'billing',
  'admin.tier_changed': 'billing',
  'admin.bonus_credits_granted': 'billing',
  'system.maintenance': 'system',
  // Dropped for tenants — no category, no toggle, no delivery.
  'whatsapp.inbound': '_dropped',
  'ai_job.failed': '_dropped',
  'ai_job.completed': '_dropped',
}

export const DROPPED_EVENT_TYPES = (
  Object.keys(EVENT_CATEGORIES) as EventType[]
).filter((eventType) => EVENT_CATEGORIES[eventType] === '_dropped')

const DROPPED_EVENT_TYPE_SET = new Set<string>(DROPPED_EVENT_TYPES)

export function isVisibleNotificationEventType(eventType: string): boolean {
  return !DROPPED_EVENT_TYPE_SET.has(eventType)
}

/**
 * Per-category channel preference shape — 4 channels (Phase 104, NOTIF-02).
 *
 * `whatsapp` and `sms` are paid/consent-gated channels: they default to `false`
 * everywhere and are NEVER auto-enabled by a default or a migration (Pitfall 5).
 */
export interface ChannelPrefs {
  in_app: boolean
  email: boolean
  whatsapp: boolean
  sms: boolean
}

/**
 * Default per-category channel preferences applied when a user has no
 * `notification_preferences` row, or when a category is missing from their
 * `categories` JSONB.
 *
 * Rationale:
 *  - in_app + email default on for every visible category
 *  - whatsapp + sms default OFF everywhere (opt-in + paid — TCPA/cost)
 *  - `_dropped` is all-false (its events never deliver)
 */
export const DEFAULT_PREFERENCES: Record<EventCategory, ChannelPrefs> = {
  estimate: { in_app: true, email: true, whatsapp: false, sms: false },
  billing: { in_app: true, email: true, whatsapp: false, sms: false },
  system: { in_app: true, email: true, whatsapp: false, sms: false },
  _dropped: { in_app: false, email: false, whatsapp: false, sms: false },
}

export function getCategoryForEvent(eventType: EventType): EventCategory {
  return EVENT_CATEGORIES[eventType]
}
