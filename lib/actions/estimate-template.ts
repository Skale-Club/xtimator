'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'

// getAuthContext is duplicated per action file — established codebase convention (STATE.md Phase 20).
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

export async function saveEstimateTemplate(data: {
  greeting: string | null
  opener: string | null
  closer: string | null
  signature: string | null
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error as string }
  const { supabase, company } = ctx

  // Pitfall 3: empty string must be stored as null so resolveTemplate() applies defaults.
  const { error } = await supabase
    .from('companies')
    .update({
      estimate_template_greeting:  data.greeting  || null,
      estimate_template_opener:    data.opener    || null,
      estimate_template_closer:    data.closer    || null,
      estimate_template_signature: data.signature || null,
    })
    .eq('id', company.id)

  if (error) return { error: 'Failed to save template. Please try again.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(revalidateTag as any)('company')
  revalidatePath('/settings/estimate-templates')

  return { success: true }
}
