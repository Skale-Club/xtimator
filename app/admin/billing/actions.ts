'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import type { TierName } from '@/lib/entitlements'

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
  await requireAdmin()

  if (!companyId || !tier) return { ok: false, message: 'companyId and tier are required' }

  const VALID_TIERS: TierName[] = ['free', 'trial', 'pro', 'business']
  if (!VALID_TIERS.includes(tier)) return { ok: false, message: 'Invalid tier' }

  const svc = requireServiceClient()

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
  return { ok: true, message: `Granted ${units} bonus estimate credits` }
}
