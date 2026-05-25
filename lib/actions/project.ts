'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectFormValues } from '@/lib/schemas/project'
import { getProjectsByCompany, getProjectById } from '@/lib/queries/project'
import type { ProjectDetail } from '@/lib/queries/project'
import { PLACEHOLDER_PREFIX } from '@/lib/constants/project'

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

export async function createProjectAction(formData: ProjectFormValues) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const placeholderName = `${PLACEHOLDER_PREFIX}${new Date().toLocaleDateString()}`

  const { data: project, error: insertError } = await supabase
    .from('projects')
    .insert({
      company_id: company.id,
      client_id: formData.clientId ?? null,
      name: placeholderName,
      project_type: null,
      input_mode: formData.inputMode ?? null,
      status: 'draft',
      target_budget: null,
      total: 0,
    })
    .select()
    .single()

  if (insertError || !project) {
    return { error: 'Failed to create project. Please try again.' }
  }

  await supabase.from('estimate_activity').insert({
    project_id: project.id,
    company_id: company.id,
    event_type: 'project_created',
    metadata: { placeholder_name: placeholderName },
  })

  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: project }
}

/**
 * Minimal project fetch for client-side surfaces that only need the basics
 * (id, name, company_id, etc.) — e.g. the EstimateCreationPopup opening from
 * a URL param. RLS still gates access via the authenticated supabase client.
 */
export async function getProjectMinimalAction(
  projectId: string
): Promise<{ data: ProjectDetail } | { error: string }> {
  const supabase = await createClient()
  const project = await getProjectById(supabase, projectId)
  if (!project) return { error: 'Project not found' }
  return { data: project }
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

export async function getMoreProjects(companyId: string, page: number) {
  const supabase = await createClient()
  return getProjectsByCompany(supabase, companyId, page, 10)
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
  revalidatePath('/', 'layout')
  return { data: newProject }
}

export async function createProjectWithClientAction(clientId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  const placeholderName = `${PLACEHOLDER_PREFIX}${new Date().toLocaleDateString()}`

  const { data: project, error: insertError } = await supabase
    .from('projects')
    .insert({
      company_id: company.id,
      client_id: clientId,
      name: placeholderName,
      project_type: null,
      status: 'draft',
      target_budget: null,
      total: 0,
    })
    .select()
    .single()

  if (insertError || !project) {
    return { error: 'Failed to create project. Please try again.' }
  }

  await supabase.from('estimate_activity').insert({
    project_id: project.id,
    company_id: company.id,
    event_type: 'project_created',
    metadata: { placeholder_name: placeholderName },
  })

  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: project }
}

export async function linkProjectToClient(projectId: string, clientId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('projects')
    .update({ client_id: clientId })
    .eq('id', projectId)

  if (error) return { error: 'Failed to link client. Please try again.' }

  revalidatePath(`/projects/${projectId}`, 'layout')
  return { data: { linked: true } }
}

export async function renameProjectAction(projectId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length === 0) {
    return { error: 'Project name is required' }
  }
  if (trimmed.length > 200) {
    return { error: 'Name must be 200 characters or less' }
  }

  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('projects')
    .update({ name: trimmed })
    .eq('id', projectId)

  if (error) return { error: 'Failed to rename project. Please try again.' }

  revalidatePath(`/projects/${projectId}`, 'layout')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { renamed: true } }
}

// ---------------------------------------------------------------------------
// Quick task 260522-lhp (QUICK-LHP-BE-01) — Two-stage trash + archive actions.
//
// RLS already enforces company scope for both UPDATE and DELETE on `projects`
// (lines 192-196 of 20260409000001_initial_schema.sql). The actions only
// need to invoke `getAuthContext()` (so the unauthenticated path returns a
// clean error) and let RLS handle the per-row check via the WHERE clause
// `.eq('id', projectId)` — if the project isn't in the user's company, RLS
// returns zero rows affected.
// ---------------------------------------------------------------------------

export async function archiveProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Setting archived_at moves the row from Active → Archived.
  // We do NOT touch deleted_at — archiving a trashed project shouldn't undelete it
  // (UI prevents this anyway by only showing Archive on Active rows).
  const { error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', projectId)
    .is('deleted_at', null) // defense-in-depth: don't archive a trashed project

  if (error) return { error: 'Failed to archive project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { archived: true } }
}

export async function unarchiveProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('projects')
    .update({ archived_at: null })
    .eq('id', projectId)
    .is('deleted_at', null)

  if (error) return { error: 'Failed to unarchive project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { unarchived: true } }
}

export async function softDeleteProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Soft delete: sets deleted_at. Row hides from Active AND Archived; appears in Trash.
  // We do NOT clear archived_at — restoring later should bring it back to wherever it was.
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', projectId)

  if (error) return { error: 'Failed to delete project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { soft_deleted: true } }
}

export async function restoreProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Restore = clear deleted_at. archived_at is preserved (intentional — see softDelete above).
  // If the row was archived before deletion, it returns to Archived; otherwise to Active.
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null })
    .eq('id', projectId)

  if (error) return { error: 'Failed to restore project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { restored: true } }
}

export async function hardDeleteProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Hard delete: cascades to recordings/photos/estimates/sections/items/activity per FK ON DELETE CASCADE.
  // Only valid for rows that are already in Trash (deleted_at IS NOT NULL) — defense-in-depth filter.
  // UI gates this behind an AlertDialog (project-row-actions.tsx).
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .not('deleted_at', 'is', null)

  if (error) return { error: 'Failed to permanently delete project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { hard_deleted: true } }
}
