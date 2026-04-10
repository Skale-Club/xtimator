'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()

  if (!company) return { error: 'No company found' as const }

  return { supabase, company }
}

export async function deleteProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) return { error: 'Failed to delete project. Please try again.' }

  revalidatePath('/dashboard')
  return { data: { deleted: true } }
}

export async function duplicateProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  // Fetch original project
  const { data: original, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (fetchError || !original) return { error: 'Project not found.' }

  // Insert copy
  const { data: newProject, error: insertError } = await supabase
    .from('projects')
    .insert({
      company_id: company.id,
      client_id: original.client_id,
      name: `${original.name} (Copy)`,
      project_type: original.project_type,
      status: 'draft',
      target_budget: original.target_budget,
      total: 0,
    })
    .select()
    .single()

  if (insertError) return { error: 'Failed to duplicate project. Please try again.' }

  revalidatePath('/dashboard')
  return { data: newProject }
}
