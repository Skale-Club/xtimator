import 'server-only'
/**
 * lib/agent-tools/create-project.ts
 *
 * NEUT — channel-neutral "create a project" capability. Mirrors
 * createProjectAction (lib/actions/project.ts) but stripped of the cookie-session
 * wrapper: the caller passes a trusted service-role client + resolved companyId.
 *
 * This closes the agent gap where create_estimate required a pre-existing
 * project_id but no channel could make one — so an agent could not start a job
 * from zero. With this, the flow is: create_project → (optionally) create_estimate.
 *
 * T-lrf-01: `companyId` and `supabase` are TRUSTED params, never LLM tool-input
 * fields. A supplied clientId is re-verified against the company before use, so
 * a cross-tenant id can never attach.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertCompanyWritable } from '@/lib/demo/guard'

export type CreateProjectInput = { name: string; clientId?: string | null }

export type CreateProjectResult =
  | { ok: true; id: string; name: string }
  | { ok: false; message: string }

export async function createProject(
  supabase: SupabaseClient,
  companyId: string,
  input: CreateProjectInput,
  channel?: 'web' | 'mcp',
): Promise<CreateProjectResult> {
  const denied = await assertCompanyWritable(companyId)
  if (denied) throw new Error(denied.error)

  const name = input.name.trim()
  if (!name) return { ok: false, message: 'Project name is required.' }
  if (name.length > 200) {
    return { ok: false, message: 'Project name must be 200 characters or less.' }
  }

  // If a clientId is supplied, verify it belongs to THIS company (defense in
  // depth — the caller resolves it, but a cross-tenant id must never attach).
  let clientId: string | null = null
  if (input.clientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', input.clientId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!client) return { ok: false, message: 'That client was not found for this company.' }
    clientId = (client as { id: string }).id
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      company_id: companyId,
      client_id: clientId,
      name,
      project_type: null,
      input_mode: null, // agent-created; no capture modality
      status: 'draft',
      target_budget: null,
      total: 0,
    })
    .select('id, name')
    .single()

  if (error || !project) {
    return { ok: false, message: 'Failed to create the project. Please try again.' }
  }
  const created = project as { id: string; name: string }

  // Best-effort activity log — mirrors createProjectAction; never blocks the result.
  await supabase
    .from('estimate_activity')
    .insert({
      project_id: created.id,
      company_id: companyId,
      event_type: 'project_created',
      metadata: { source: channel ?? 'agent' },
    })
    .then(
      () => undefined,
      () => undefined,
    )

  return { ok: true, id: created.id, name: created.name }
}
