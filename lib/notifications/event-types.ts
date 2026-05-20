/**
 * Phase 77 — Notification event catalog.
 *
 * Single source of truth for event types + their category grouping + default
 * per-category channel preferences. Consumed by `lib/notifications/dispatch.ts`
 * (77-02) and `lib/notifications/preferences.ts` (77-02).
 *
 * Adding a new event:
 *  1. Add to `EventType` union below
 *  2. Add to `EVENT_CATEGORIES` map
 *  3. (If new category) add to `EventCategory` union + `DEFAULT_PREFERENCES`
 */

export type EventCategory =
  | 'estimate'
  | 'payment'
  | 'trial'
  | 'quota'
  | 'whatsapp'
  | 'ai_job'
  | 'admin'
  | 'system'

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
  'payment.received': 'payment',
  'payment.refunded': 'payment',
  'trial.expiring_3d': 'trial',
  'trial.expired': 'trial',
  'trial.converted': 'trial',
  'quota.80pct': 'quota',
  'quota.exhausted': 'quota',
  'whatsapp.inbound': 'whatsapp',
  'ai_job.failed': 'ai_job',
  'ai_job.completed': 'ai_job',
  'admin.tier_changed': 'admin',
  'admin.bonus_credits_granted': 'admin',
  'system.maintenance': 'system',
}

/**
 * Default per-category channel preferences applied when a user has no
 * `notification_preferences` row, or when a category is missing from their
 * `categories` JSONB.
 *
 * Rationale:
 *  - `ai_job` is opt-in (noisy for normal users)
 *  - `whatsapp` defaults to in_app only (avoid email spam for chat events)
 *  - everything else: in_app + email both on
 */
export const DEFAULT_PREFERENCES: Record<EventCategory, { in_app: boolean; email: boolean }> = {
  estimate: { in_app: true, email: true },
  payment: { in_app: true, email: true },
  trial: { in_app: true, email: true },
  quota: { in_app: true, email: true },
  whatsapp: { in_app: true, email: false },
  ai_job: { in_app: false, email: false },
  admin: { in_app: true, email: true },
  system: { in_app: true, email: true },
}

export function getCategoryForEvent(eventType: EventType): EventCategory {
  return EVENT_CATEGORIES[eventType]
}
