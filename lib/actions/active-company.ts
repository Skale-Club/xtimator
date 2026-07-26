'use server'

import { cookies } from 'next/headers'
import { revalidatePath, updateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  ACTIVE_COMPANY_COOKIE,
  ACTIVE_COMPANY_COOKIE_OPTIONS,
} from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'

/**
 * Phase 81 — Switch the active company for the current request.
 *
 * SWITCH-06 (six-step sequence):
 *   1. Resolve auth claims via supabase.auth.getClaims().
 *   2. If no claims → return { error: 'unauthenticated' } (no DB call).
 *   3. Verify membership against `company_members` using the RLS-bound client.
 *      No row → return { error: 'forbidden' } (never reveals whether the company exists).
 *   4. Write the `active_company_id` cookie via Phase 79's shared constants.
 *   5. updateTag('company') — immediately invalidates the company cache so the
 *      user reads the company they just selected.
 *   6. revalidatePath('/', 'layout') — forces layout-level RSC re-render across all routes
 *      so headers / sidebars pick up the new company immediately (established pattern from
 *      lib/actions/project.ts).
 *
 * SWITCH-08 — discriminated-union return: callers can narrow at the type level.
 * SWITCH-16 — request-scoped client only (RLS gates by user_id = auth.uid()), never
 * requireServiceClient.
 */
export async function switchActiveCompany(
  companyId: string
): Promise<{ ok: true } | { error: 'unauthenticated' | 'forbidden' }> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims?.sub) return { error: 'unauthenticated' }

  const denied = await assertWritable()
  if (denied) return { error: 'forbidden' }

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', claims.sub as string)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!membership) return { error: 'forbidden' }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, ACTIVE_COMPANY_COOKIE_OPTIONS)

  updateTag('company')
  revalidatePath('/', 'layout')

  return { ok: true }
}
