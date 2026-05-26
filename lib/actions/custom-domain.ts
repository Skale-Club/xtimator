'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { customDomainSchema } from '@/lib/schemas/custom-domain'
import { getActiveCompanyId } from '@/lib/queries/active-company'

// getAuthContext is duplicated per action file — established codebase convention (STATE.md Phase 03/20).
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', activeCompanyId)
    .single()

  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}

export async function saveCustomDomain(
  data: { custom_domain: string | null }
): Promise<{ success: true } | { error: string }> {
  // Validate before auth check (per STATE.md Phase 09 saveThemePreference pattern)
  const parsed = customDomainSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid domain.' }
  }

  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  const { error } = await supabase
    .from('companies')
    .update({ custom_domain: data.custom_domain || null })
    .eq('id', company.id)

  if (error) return { error: 'Failed to save domain. Please try again.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(revalidateTag as any)('company')
  revalidatePath('/settings/custom-domain')
  return { success: true }
}
