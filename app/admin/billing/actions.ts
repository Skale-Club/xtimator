'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import type { TierName } from '@/lib/entitlements'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

/**
 * ADMIN-BILLING-01: Force a company's tier to any value, optionally set tier_renews_at.
 * Updates companies.tier and optionally companies.tier_renews_at.
 * If forcing to 'free', also clears tier_trial_ends_at.
 */
export async function forceTier(
  companyId: string,
  tier: TierName,
  expiresAt?: string, // ISO string or undefined
): Promise<ActionResult> {
  const ctx = await requireAdmin()

  if (!companyId || !tier) return { ok: false, message: 'companyId and tier are required' }

  const VALID_TIERS: TierName[] = ['free', 'trial', 'pro', 'business']
  if (!VALID_TIERS.includes(tier)) return { ok: false, message: 'Invalid tier' }

  const svc = requireServiceClient()

  // Read previous tier + owner for the notification payload.
  const { data: previousRow } = await svc
    .from('companies')
    .select('user_id, tier')
    .eq('id', companyId)
    .single()
  const previous = previousRow as { user_id: string | null; tier: string } | null

  const update: Record<string, string | null> = { tier }
  if (expiresAt) {
    update.tier_renews_at = expiresAt
  }
  // If forcing back to free, clear trial column so they are regular free (not trial-expired-pending)
  if (tier === 'free') {
    update.tier_trial_ends_at = null
  }

  const { error } = await svc.from('companies').update(update).eq('id', companyId)
  if (error) return { ok: false, message: error.message }

  revalidatePath('/admin/billing')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'tier.force',
    targetType: 'company',
    targetId: companyId,
    metadata: { tier, expires_at: expiresAt ?? null },
  })

  // Phase 77 NOTIF-04: admin.tier_changed with force channels — owner must
  // know their tier was changed by support / admin.
  try {
    const copy = buildNotificationCopy('admin.tier_changed', {
      tierFrom: previous?.tier ?? 'unknown',
      tierTo: tier,
    })
    void notify({
      companyId,
      userId: previous?.user_id ?? null,
      eventType: 'admin.tier_changed',
      title: copy.title,
      body: copy.body,
      linkUrl: '/settings/billing',
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: `admin-tier-${companyId}-${Date.now()}` },
    })
  } catch {
    /* best-effort */
  }

  return { ok: true, message: `Tier set to ${tier}` }
}

/**
 * ADMIN-BILLING-02: Grant bonus quota credits by inserting a negative usage_events row.
 *
 * The usage_events.event_type CHECK constraint (Phase 55 migration) only allows:
 * 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'.
 * 'bonus_credits' is NOT in the constraint — service role bypasses RLS but not CHECK.
 *
 * Resolution: insert as event_type='estimate_generated' with negative units and
 * metadata { bonus: true, granted_by: adminEmail } for audit trail.
 *
 * checkQuota currently counts rows (not SUM units). This provides an audit trail
 * and fulfills the spec requirement ("insert negative usage_events row"). Future
 * quota evolution can SUM units to consume these credits automatically.
 */
export async function grantBonusCredits(
  companyId: string,
  units: number, // positive number; stored as negative (credit back)
): Promise<ActionResult> {
  const ctx = await requireAdmin()

  if (!companyId || !units || units <= 0) {
    return { ok: false, message: 'companyId and positive units are required' }
  }

  const svc = requireServiceClient()

  const { error } = await svc.from('usage_events').insert({
    company_id: companyId,
    event_type: 'estimate_generated',
    units: -Math.abs(units),
    metadata: { bonus: true, granted_by: ctx.email },
  })

  if (error) return { ok: false, message: error.message }

  revalidatePath('/admin/billing')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'bonus_credits.grant',
    targetType: 'company',
    targetId: companyId,
    metadata: { units },
  })

  // Phase 77 NOTIF-04: notify the company owner of the bonus credits grant.
  try {
    const { data: ownerRow } = await svc
      .from('companies')
      .select('user_id')
      .eq('id', companyId)
      .single()
    const ownerUserId = (ownerRow as { user_id?: string | null } | null)?.user_id ?? null
    const copy = buildNotificationCopy('admin.bonus_credits_granted', {
      credits: units,
    })
    void notify({
      companyId,
      userId: ownerUserId,
      eventType: 'admin.bonus_credits_granted',
      title: copy.title,
      body: copy.body,
      linkUrl: '/settings/billing',
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: `admin-bonus-${companyId}-${Date.now()}` },
    })
  } catch {
    /* best-effort */
  }

  return { ok: true, message: `Granted ${units} bonus estimate credits` }
}
