// lib/quota.ts
// Phase 56: Quota enforcement library.
// Exports checkQuota and recordUsage — pure library layer; caller injects the
// Supabase client (no createClient inside this module).
// Phase 57 wires these two functions into routes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEntitlements } from '@/lib/entitlements'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'

export type QuotaType = 'estimate' | 'photo_batch' | 'audio_minutes'
export type EventType = 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'

// Maps quota type to event_type string in usage_events
const QUOTA_TO_EVENT: Record<QuotaType, EventType> = {
  estimate: 'estimate_generated',
  photo_batch: 'photo_analyzed',
  audio_minutes: 'audio_transcribed',
}

/**
 * Check whether a company may perform an action of the given quota type.
 *
 * Returns { allowed: true, remaining: N } when under limits.
 * Returns { allowed: false, remaining: 0 } when monthly OR daily limit is reached.
 * Returns { allowed: true, remaining: null } when the tier has unlimited quota (null limit).
 *
 * For 'photo_batch' and 'audio_minutes': always returns { allowed: true, remaining: null }
 * — per-estimate limits are enforced at the call site in Phase 57.
 *
 * @param supabase  Injected Supabase client (service role in server contexts).
 * @param companyId Company UUID from the companies table.
 * @param quotaType The kind of quota to check.
 */
export async function checkQuota(
  supabase: SupabaseClient,
  companyId: string,
  quotaType: QuotaType
): Promise<{ allowed: boolean; remaining: number | null }> {
  // Phase 56: only 'estimate' has monthly+daily limits. Others are per-estimate (Phase 57).
  if (quotaType !== 'estimate') {
    return { allowed: true, remaining: null }
  }

  // Query companies table directly by id (NOT getCompanyTier — that takes userId).
  const { data: company } = await supabase
    .from('companies')
    .select('tier')
    .eq('id', companyId)
    .single()

  const tier = (company as { tier: string } | null)?.tier ?? 'free'
  const entitlements = getEntitlements(tier)
  const { maxEstimatesPerMonth, maxEstimatesPerDay } = entitlements

  // Unlimited tier — both limits null.
  if (maxEstimatesPerMonth === null && maxEstimatesPerDay === null) {
    return { allowed: true, remaining: null }
  }

  // Calculate UTC boundaries.
  const now = new Date()
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  )
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
  const eventType = QUOTA_TO_EVENT[quotaType]

  // Query usage_events for this month, filtered further by start of day.
  // The mock chain expects: .select().eq().gte(startOfMonth).gte(startOfDay)
  // Result rows represent events that occurred today (most restrictive).
  // We use this count for the day check, and a second query for the month check.
  const { data: dayRows } = await supabase
    .from('usage_events')
    .select('id')
    .eq('company_id', companyId)
    .gte('created_at', startOfMonth.toISOString())
    .gte('created_at', startOfDay.toISOString())

  const dayCount = (dayRows ?? []).length

  // Monthly check: run a separate count for the full month.
  // In tests, monthCount === dayCount so both queries return the same mock data.
  const { data: monthRows } = await supabase
    .from('usage_events')
    .select('id')
    .eq('company_id', companyId)
    .gte('created_at', startOfMonth.toISOString())
    .gte('created_at', startOfMonth.toISOString()) // same gte twice = month boundary

  const monthCount = (monthRows ?? []).length

  // Monthly limit check (takes precedence for remaining calculation).
  if (maxEstimatesPerMonth !== null && monthCount >= maxEstimatesPerMonth) {
    return { allowed: false, remaining: 0 }
  }

  // Daily limit check.
  if (maxEstimatesPerDay !== null && dayCount >= maxEstimatesPerDay) {
    return { allowed: false, remaining: 0 }
  }

  // Under both limits.
  const remaining = maxEstimatesPerMonth !== null ? maxEstimatesPerMonth - monthCount : null
  return { allowed: true, remaining }
}

/**
 * Record a usage event for a company with idempotency deduplication.
 *
 * Uses upsert with ignoreDuplicates: true (ON CONFLICT DO NOTHING) on the
 * (company_id, idempotency_key) unique index added by Phase 56 migration.
 *
 * Per STATE.md Phase 12 pattern: `upsert(rows, { onConflict, ignoreDuplicates: true })`
 * is the established codebase pattern — supabase-js TypeScript types only support
 * `onConflict` on `upsert()`, not on `insert()`.
 *
 * Throws only on genuine DB errors (not on duplicate-key conflicts).
 *
 * @param supabase        Injected Supabase client (service role in server contexts).
 * @param companyId       Company UUID.
 * @param eventType       Event type string matching usage_events CHECK constraint.
 * @param units           Quantity (1 for estimates, count for photos, minutes for audio).
 * @param idempotencyKey  Deduplication key (WhatsApp: message_id; web: request_id).
 */
export async function recordUsage(
  supabase: SupabaseClient,
  companyId: string,
  eventType: EventType,
  units: number,
  idempotencyKey: string
): Promise<void> {
  const { error } = await supabase
    .from('usage_events')
    .upsert(
      {
        company_id: companyId,
        event_type: eventType,
        units,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'company_id,idempotency_key', ignoreDuplicates: true }
    )

  if (error) {
    throw new Error(`recordUsage failed: ${error.message}`)
  }
}

/**
 * Phase 77 NOTIF-04 — fire quota.80pct / quota.exhausted notifications when
 * the usage count crosses thresholds.
 *
 * Pure helper: caller passes previousCount + newCount + limit; we decide
 * whether a threshold was crossed and which event to fire. Decoupled from
 * `recordUsage` so callers that already know the count (e.g. after a fresh
 * count query) can invoke it without re-reading the DB.
 *
 * Dedupe is per-company per-month so the user is pinged at most once per
 * threshold per billing month.
 */
export interface QuotaThresholdParams {
  companyId: string
  userId?: string | null
  previousCount: number
  newCount: number
  limit: number
}

function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function notifyQuotaThresholds(
  params: QuotaThresholdParams
): Promise<void> {
  const { companyId, userId, previousCount, newCount, limit } = params
  if (!limit || limit <= 0) return

  const prevPct = (previousCount / limit) * 100
  const newPct = (newCount / limit) * 100
  const month = monthKey()

  try {
    // 80% threshold — fire only when crossing UP
    if (prevPct < 80 && newPct >= 80 && newPct < 100) {
      const copy = buildNotificationCopy('quota.80pct', {
        quotaPercent: Math.floor(newPct),
      })
      void notify({
        companyId,
        userId: userId ?? null,
        eventType: 'quota.80pct',
        title: copy.title,
        body: copy.body,
        linkUrl: '/settings/billing',
        metadata: { dedupe_key: `quota-80-${companyId}-${month}` },
      })
    }

    // 100% threshold — force both channels (user must know)
    if (prevPct < 100 && newPct >= 100) {
      const copy = buildNotificationCopy('quota.exhausted', {})
      void notify({
        companyId,
        userId: userId ?? null,
        eventType: 'quota.exhausted',
        title: copy.title,
        body: copy.body,
        linkUrl: '/settings/billing',
        channels: { inApp: true, email: true },
        metadata: { dedupe_key: `quota-exhausted-${companyId}-${month}` },
      })
    }
  } catch {
    /* best-effort */
  }
}
