import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Seeds a row in platform_admins for the given user_id. Idempotent.
 * Returns a cleanup function. Intended for beforeAll() in e2e specs.
 *
 * REQUIREMENT: the e2e database MUST be pre-seeded with at least 2 platform_admins
 * rows BEFORE any test in this file runs. Typically this is the primary TEST_ADMIN
 * (bootstrapped via supabase/ADMIN-BOOTSTRAP.md) plus a dedicated secondary admin
 * that exists only to keep count > 1 during tests. The seeded secondary admin
 * guarantees count > 1 when this helper's cleanup removes the test admin it added,
 * so the prevent_last_admin_removal trigger never fires.
 *
 * If this invariant is broken (e2e DB has only 1 admin row), cleanup WILL fail
 * loudly with "Cannot remove the last platform admin" — intentional: the test
 * environment is misconfigured and must be fixed at the setup layer, not worked
 * around here with RPC hacks.
 */
export async function seedPlatformAdmin(userId: string) {
  const svc = requireServiceClient()
  await svc.from('platform_admins').upsert({ user_id: userId, notes: 'e2e-test' })
  return async () => {
    await svc.from('platform_admins').delete().eq('user_id', userId)
  }
}
