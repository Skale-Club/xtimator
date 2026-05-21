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
