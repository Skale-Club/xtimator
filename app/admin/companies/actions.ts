'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string }

/**
 * Set or clear the per-company OpenRouter model override.
 *
 * - Passing a non-empty model id pins this company to OpenRouter with that
 *   exact model regardless of the platform-wide active provider.
 * - Passing `null` (or empty string) reverts the company to the global
 *   selection.
 */
export async function setCompanyModelOverride(
  companyId: string,
  model: string | null
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!companyId) return { ok: false, message: 'companyId is required' }

  const value = model && model.trim() ? model.trim() : null
  if (value && !/^[\w./:-]+$/.test(value)) {
    return { ok: false, message: 'Invalid model id format' }
  }

  const svc = requireServiceClient()
  // Read previous value for audit metadata.
  let previous: string | null = null
  try {
    const { data } = await svc
      .from('companies')
      .select('ai_model_override')
      .eq('id', companyId)
      .maybeSingle()
    previous = (data as { ai_model_override?: string | null } | null)?.ai_model_override ?? null
  } catch {
    // non-fatal
  }

  const { error } = await svc
    .from('companies')
    .update({ ai_model_override: value })
    .eq('id', companyId)

  if (error) {
    console.error('[admin] setCompanyModelOverride DB error:', error)
    return { ok: false, message: error.message }
  }

  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${companyId}`)

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'company.set_model_override',
    targetType: 'company',
    targetId: companyId,
    metadata: { model: value, previous },
  })

  return {
    ok: true,
    message: value
      ? `Model override set to ${value}.`
      : 'Override cleared — company will use the platform default.',
  }
}

/**
 * Set or clear the per-company demo estimate quota.
 *
 * - Pass a positive integer to cap estimate generation for this company.
 * - Pass `null` to remove the cap (unlimited).
 *
 * Works for ANY company, not just admin-created demo accounts.
 */
export async function setDemoEstimateQuota(
  companyId: string,
  quota: number | null
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!companyId) return { ok: false, message: 'companyId is required' }

  if (quota !== null && (!Number.isInteger(quota) || quota < 0)) {
    return { ok: false, message: 'Quota must be a non-negative integer or null' }
  }

  const svc = requireServiceClient()
  const { error } = await svc
    .from('companies')
    .update({ demo_estimate_quota: quota })
    .eq('id', companyId)

  if (error) {
    console.error('[admin] setDemoEstimateQuota DB error:', error)
    return { ok: false, message: error.message }
  }

  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${companyId}`)

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'company.set_demo_quota',
    targetType: 'company',
    targetId: companyId,
    metadata: { quota },
  })

  return {
    ok: true,
    message: quota !== null
      ? `Demo quota set to ${quota} estimate${quota === 1 ? '' : 's'}.`
      : 'Demo quota removed — company has unlimited estimates.',
  }
}

/**
 * Billing v2 BYOK — set, rotate, or disable a company's own OpenRouter key.
 * SUPER-ADMIN ONLY (the hidden "street-sale" plan — never publicly sold).
 *
 * - Pass a plaintext OpenRouter key: stored AES-encrypted (never plaintext,
 *   never logged; only the last 4 chars kept as a UI hint) + byok_enabled=true.
 *   From then on the company's AI calls run on ITS key and never debit credits.
 * - Pass `null`: BYOK disabled, key erased — the company bills normally again.
 */
export async function setByokConfig(
  companyId: string,
  apiKey: string | null
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!companyId) return { ok: false, message: 'companyId is required' }

  const svc = requireServiceClient()

  if (apiKey === null || apiKey.trim() === '') {
    const { error } = await svc
      .from('companies')
      .update({ byok_enabled: false, byok_openrouter_key: null, byok_key_last4: null })
      .eq('id', companyId)
    if (error) {
      console.error('[admin] setByokConfig disable DB error:', error)
      return { ok: false, message: error.message }
    }
    revalidatePath('/admin/companies')
    revalidatePath(`/admin/companies/${companyId}`)
    void logAdminAction({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      action: 'company.byok_disabled',
      targetType: 'company',
      targetId: companyId,
      metadata: {},
    })
    return { ok: true, message: 'BYOK disabled — company bills platform credits again.' }
  }

  const trimmed = apiKey.trim()
  // Lenient shape check: OpenRouter keys are `sk-or-...`; accept any plausible
  // secret so a future format change doesn't lock the admin out.
  if (trimmed.length < 20) {
    return { ok: false, message: 'That does not look like a valid OpenRouter API key.' }
  }

  const { encryptByokKey } = await import('@/lib/billing/byok')
  let encrypted: string
  try {
    encrypted = encryptByokKey(trimmed)
  } catch (err) {
    console.error('[admin] setByokConfig encrypt error:', err)
    return { ok: false, message: 'Encryption failed — is APP_ENCRYPTION_KEY configured?' }
  }

  const { error } = await svc
    .from('companies')
    .update({
      byok_enabled: true,
      byok_openrouter_key: encrypted,
      byok_key_last4: trimmed.slice(-4),
    })
    .eq('id', companyId)
  if (error) {
    console.error('[admin] setByokConfig DB error:', error)
    return { ok: false, message: error.message }
  }

  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${companyId}`)
  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'company.byok_enabled',
    targetType: 'company',
    targetId: companyId,
    // NEVER the key — only the display hint.
    metadata: { key_last4: trimmed.slice(-4) },
  })

  return {
    ok: true,
    message: `BYOK enabled — this company now runs on its own key (…${trimmed.slice(-4)}) and spends no platform credits.`,
  }
}
