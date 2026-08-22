'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import type { TierName } from '@/lib/entitlements'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { reconcileBalance } from '@/lib/billing/credit-ledger'

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

  const VALID_TIERS: TierName[] = ['free', 'pro', 'business']
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
  // Billing v2: the 14-day trial is retired; keep the legacy column clear when
  // forcing back to free so old rows never look trial-pending.
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
    const ctx = {
      tierFrom: previous?.tier ?? 'unknown',
      tierTo: tier,
    }
    const copy = buildNotificationCopy('admin.tier_changed', ctx)
    void notify({
      companyId,
      userId: previous?.user_id ?? null,
      eventType: 'admin.tier_changed',
      title: copy.title,
      body: copy.body,
      linkUrl: '/settings/billing',
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: `admin-tier-${companyId}-${Date.now()}` },
      copyContext: ctx,
    })
  } catch {
    /* best-effort */
  }

  return { ok: true, message: `Tier set to ${tier}` }
}

/**
 * ADMIN-BILLING-02: Grant bonus units against the LEGACY count-based quota
 * (usage_events), NOT the Phase 112 credit_ledger / companies.credit_balance
 * system. This inserts a negative usage_events row — it does NOT touch the
 * credit ledger and has no effect on a company's credit balance. For the
 * ledger-backed balance, use adjustCredits below.
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
    const ctx = {
      credits: units,
    }
    const copy = buildNotificationCopy('admin.bonus_credits_granted', ctx)
    void notify({
      companyId,
      userId: ownerUserId,
      eventType: 'admin.bonus_credits_granted',
      title: copy.title,
      body: copy.body,
      linkUrl: '/settings/billing',
      channels: { inApp: true, email: true },
      metadata: { dedupe_key: `admin-bonus-${companyId}-${Date.now()}` },
      copyContext: ctx,
    })
  } catch {
    /* best-effort */
  }

  return { ok: true, message: `Granted ${units} bonus estimate credits` }
}

/**
 * RLS-HARDEN-01: Manually adjust a company's Phase 112 credit_ledger balance
 * by an arbitrary (positive or negative) delta, via the atomic
 * apply_credit_ledger_entry RPC (service-role only — see
 * 20260706000002_atomic_credit_ledger_rpc.sql) rather than a direct table
 * write, so the row lock + idempotency-key discipline that protects every
 * other ledger writer also covers admin adjustments.
 *
 * `note` is REQUIRED (non-empty, <= 200 chars) and is stored as `ref_id` —
 * it is the only human-readable trace of why an admin moved a tenant's
 * balance, since reason is fixed to 'adjust' for every call here.
 */
export async function adjustCredits(
  companyId: string,
  deltaCredits: number,
  note: string,
): Promise<ActionResult & { balance?: number }> {
  const ctx = await requireAdmin()

  if (!companyId) return { ok: false, message: 'companyId is required' }
  if (!Number.isInteger(deltaCredits) || deltaCredits === 0) {
    return { ok: false, message: 'deltaCredits must be a non-zero integer' }
  }
  const trimmedNote = note?.trim() ?? ''
  if (!trimmedNote) return { ok: false, message: 'A note is required' }
  if (trimmedNote.length > 200) return { ok: false, message: 'Note must be 200 characters or fewer' }

  const svc = requireServiceClient()

  const { data: rpcData, error } = await svc.rpc('apply_credit_ledger_entry', {
    p_company_id: companyId,
    p_delta_credits: deltaCredits,
    p_reason: 'adjust',
    p_operation_type: null,
    p_ref_id: trimmedNote,
    p_real_cost_usd: null,
    p_markup: null,
    p_idempotency_key: `adjust:${randomUUID()}`,
  })
  if (error) return { ok: false, message: error.message }

  const result = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
    | { balance_after: number; applied: boolean }
    | undefined
  const balance = result?.balance_after

  revalidatePath('/admin/billing')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'credits.adjust',
    targetType: 'company',
    targetId: companyId,
    metadata: { delta: deltaCredits, note: trimmedNote },
  })

  return { ok: true, message: `Balance adjusted by ${deltaCredits}`, balance }
}

/**
 * RLS-HARDEN-01: Recompute a company's cached companies.credit_balance from
 * SUM(credit_ledger.delta_credits) — the source of truth — via
 * reconcileBalance (lib/billing/credit-ledger.ts). Never throws (mirrors
 * reconcileBalance's own best-effort contract); on internal failure it
 * resolves as ok:true with balance 0, since reconcileBalance swallows and
 * returns 0 rather than surfacing an error.
 */
export async function reconcileCreditBalance(
  companyId: string,
): Promise<ActionResult & { balance?: number }> {
  const ctx = await requireAdmin()

  if (!companyId) return { ok: false, message: 'companyId is required' }

  const balance = await reconcileBalance(companyId)

  revalidatePath('/admin/billing')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'credits.reconcile',
    targetType: 'company',
    targetId: companyId,
    metadata: { balance },
  })

  return { ok: true, message: `Balance reconciled to ${balance}`, balance }
}
