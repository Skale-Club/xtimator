/**
 * Phase 175 (PLAT-01) — Platform-event catalog.
 *
 * A typed catalog of PLATFORM-scoped alert kinds — events about the platform
 * itself (tenant lifecycle, platform revenue, reliability) — as opposed to
 * `lib/notifications/event-types.ts`'s `EventType`, which is TENANT-scoped
 * (per-company owner notifications carrying a `company_id`).
 *
 * These are deliberately SIBLING, never-merged unions: platform events carry
 * no `company_id` and flow through `lib/observability/ops-alert.ts`'s
 * `notifyOps()` (Sentry + Telegram), not the tenant `notify()` dispatch. Do
 * not import from or reuse `EventType` / `EVENT_CATEGORIES` here.
 *
 * The catalog covers:
 *  - 4 tenant-scoped kinds (`category: 'tenant'`) — visibility into what's
 *    happening across tenants: signups, a customer paying a tenant via
 *    Connect (`tenant_payment_received`), a tenant paying Xtimator itself
 *    (`subscription_payment_received` — platform revenue, distinct from the
 *    Connect event), and quota exhaustion.
 *  - 4 job-failure kinds (`category: 'job_failure'`) — already-shipped AI
 *    pipeline failure alerts (transcription/vision/estimate generation) plus
 *    the AI provider fallback signal.
 *  - 2 critical kinds (`category: 'critical'`) — `pipeline_stuck` and
 *    `cron_failed` are LOCKED (always deliver to Telegram, PLAT-03) because
 *    they signal the generation pipeline or scheduled jobs may be down
 *    platform-wide — the core value prop is at risk. `ai_fallback` is also
 *    `critical` in category (degraded AI provider) but stays admin-toggleable
 *    since it's a degraded-but-still-working state, not an outage signal.
 */

export type PlatformEventKind =
  | 'tenant_signup'
  | 'tenant_payment_received'
  | 'subscription_payment_received'
  | 'tenant_quota_exhausted'
  | 'estimate_generation_failed'
  | 'transcription_failed'
  | 'vision_failed'
  | 'ai_fallback'
  | 'pipeline_stuck'
  | 'cron_failed'
  | 'error_spike'

export type PlatformEventCategory = 'tenant' | 'job_failure' | 'critical'

export interface PlatformEventDef {
  kind: PlatformEventKind
  label: string
  category: PlatformEventCategory
  /** Critical events that always deliver to Telegram regardless of the admin toggle matrix (PLAT-03). */
  locked: boolean
}

/**
 * Locked kinds — `pipeline_stuck` and `cron_failed` — always resolve
 * Telegram-enabled (see `lib/observability/platform-preferences.ts`), even
 * when their DB toggle row explicitly says `false`. This is a reviewable,
 * deliberate decision (not an accident): these two signal the generation
 * pipeline or scheduled jobs may be down platform-wide. Every other kind,
 * including `ai_fallback`, stays admin-toggleable.
 */
export const PLATFORM_EVENTS: Record<PlatformEventKind, PlatformEventDef> = {
  tenant_signup: { kind: 'tenant_signup', label: 'New tenant signup', category: 'tenant', locked: false },
  tenant_payment_received: { kind: 'tenant_payment_received', label: 'Tenant payment received', category: 'tenant', locked: false },
  subscription_payment_received: { kind: 'subscription_payment_received', label: 'Subscription payment received', category: 'tenant', locked: false },
  tenant_quota_exhausted: { kind: 'tenant_quota_exhausted', label: 'Tenant quota exhausted', category: 'tenant', locked: false },
  estimate_generation_failed: { kind: 'estimate_generation_failed', label: 'Estimate generation failed', category: 'job_failure', locked: false },
  transcription_failed: { kind: 'transcription_failed', label: 'Audio transcription failed', category: 'job_failure', locked: false },
  vision_failed: { kind: 'vision_failed', label: 'Photo analysis failed', category: 'job_failure', locked: false },
  ai_fallback: { kind: 'ai_fallback', label: 'AI provider fallback engaged', category: 'critical', locked: false },
  pipeline_stuck: { kind: 'pipeline_stuck', label: 'Generation pipeline stuck', category: 'critical', locked: true },
  cron_failed: { kind: 'cron_failed', label: 'Scheduled cron job failed', category: 'critical', locked: true },
  // Layer 3 (aggregate): one alert per error RATE, not per error. `critical` in
  // category, but deliberately NOT locked. The two locked kinds above name a
  // specific, unambiguous outage; this one is a heuristic over a threshold that
  // has not yet been calibrated against real traffic (see the measurement note
  // in lib/observability/error-spike.ts). A heuristic that cannot be switched
  // off is exactly how a channel earns being muted wholesale — and muting the
  // channel would take pipeline_stuck and cron_failed down with it. Being
  // toggleable means a noisy threshold costs this one kind, not all of them.
  // It still defaults to ON: a missing preferences row reads as enabled.
  error_spike: { kind: 'error_spike', label: 'Server error rate spike', category: 'critical', locked: false },
}

export const PLATFORM_EVENT_KINDS = Object.keys(PLATFORM_EVENTS) as PlatformEventKind[]

export const LOCKED_PLATFORM_EVENT_KINDS = new Set<PlatformEventKind>(
  PLATFORM_EVENT_KINDS.filter((k) => PLATFORM_EVENTS[k].locked)
)

export function isLockedPlatformEvent(kind: string): boolean {
  return LOCKED_PLATFORM_EVENT_KINDS.has(kind as PlatformEventKind)
}
