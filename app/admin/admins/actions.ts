'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { requireServiceClient } from '@/lib/supabase/service'
import { addAdminSchema } from '@/lib/schemas/admin'

/**
 * Server actions for /admin/admins (ADMIN-03).
 *
 * Both actions begin with `await requireAdmin()` (R-05 mitigation: don't rely on
 * proxy gate alone). The service-role client is used for `auth.admin.listUsers`
 * and `platform_admins` writes (RLS-bypass needed for both).
 *
 * Returns a discriminated union { ok: true } | { ok: false, message: string }
 * so client components can render inline errors with the UI-SPEC copy.
 */

type ActionResult = { ok: true } | { ok: false; message: string }

export async function addPlatformAdmin(input: { email: string }): Promise<ActionResult> {
  const ctx = await requireAdmin()

  const parsed = addAdminSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Invalid email.' }
  }

  const svc = requireServiceClient()

  // Look up auth.users by email. listUsers returns up to 1000 in one page —
  // sufficient for any v1 platform-admin set. RPC alternative would require
  // an extra migration; D-08 prefers keeping the surface small.
  const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const user = list?.users.find((u) => u.email === parsed.data.email)
  if (!user) {
    return {
      ok: false,
      message:
        'No user registered with that email. Ask them to sign up first, then try again.',
    }
  }

  const { data: existing } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return { ok: false, message: 'That user is already a platform admin.' }
  }

  const { error } = await svc.from('platform_admins').insert({
    user_id: user.id,
    notes: `Added via /admin/admins on ${new Date().toISOString()}`,
  })
  if (error) {
    return { ok: false, message: error.message }
  }

  revalidatePath('/admin/admins')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'admin.add',
    targetType: 'user',
    targetId: user.id,
    metadata: { email: parsed.data.email },
  })

  return { ok: true }
}

export async function removePlatformAdmin(input: { userId: string }): Promise<ActionResult> {
  const ctx = await requireAdmin()

  const svc = requireServiceClient()
  const { error } = await svc.from('platform_admins').delete().eq('user_id', input.userId)

  if (error) {
    // The migration's BEFORE DELETE trigger raises this exact message when the
    // delete would leave zero admins. Translate it to the UI-SPEC copy.
    if (/Cannot remove the last platform admin/i.test(error.message)) {
      return { ok: false, message: 'Cannot remove the last platform admin.' }
    }
    return { ok: false, message: error.message }
  }

  revalidatePath('/admin/admins')

  void logAdminAction({
    actorId: ctx.userId,
    actorEmail: ctx.email,
    action: 'admin.remove',
    targetType: 'user',
    targetId: input.userId,
  })

  return { ok: true }
}
