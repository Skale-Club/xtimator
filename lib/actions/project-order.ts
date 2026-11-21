'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { billingEditDenied } from '@/lib/billing/access-guard'
import { assertWritable } from '@/lib/demo/guard'
import { computeMovedSortOrder } from '@/lib/projects/order'

/**
 * Custom project order. The client sends the moved project and the projects
 * now directly above and below it; the new sort_order sits between them. Only
 * the moved row is written, unless the neighbours are too close (or have no
 * order yet), in which case the company's projects are renumbered 1..n first.
 * Every query is scoped by company_id; estimates are never touched.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  return { supabase, company: { id: activeCompanyId } }
}

interface OrderRow {
  id: string
  sort_order: number | null
  created_at?: string
}

const RENUMBER_BATCH = 20

async function setSortOrder(
  supabase: Supabase,
  companyId: string,
  projectId: string,
  sortOrder: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('projects')
    .update({ sort_order: sortOrder })
    .eq('id', projectId)
    .eq('company_id', companyId)
    .select('id')
  return !error && !!data && data.length > 0
}

/** 1..n over every project of the company, current order first (nulls last, then newest). */
async function renumberCompany(
  supabase: Supabase,
  companyId: string,
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, sort_order, created_at')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error || !data) return null

  const rows = data as OrderRow[]
  const next = new Map<string, number>()
  rows.forEach((row, index) => next.set(row.id, index + 1))

  const changed = rows.filter((row) => row.sort_order !== next.get(row.id))
  for (let i = 0; i < changed.length; i += RENUMBER_BATCH) {
    const results = await Promise.all(
      changed
        .slice(i, i + RENUMBER_BATCH)
        .map((row) => setSortOrder(supabase, companyId, row.id, next.get(row.id) as number)),
    )
    if (results.some((ok) => !ok)) return null
  }
  return next
}

export async function moveProject(
  projectId: string,
  neighbours: { aboveId: string | null; belowId: string | null },
) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const denied = await assertWritable()
  if (denied) return denied
  const billingDenied = await billingEditDenied(ctx.company.id)
  if (billingDenied) return billingDenied
  const { supabase, company } = ctx

  const aboveId = neighbours?.aboveId ?? null
  const belowId = neighbours?.belowId ?? null
  if (typeof projectId !== 'string' || !projectId) return { error: 'Project not found.' }
  if (aboveId === null && belowId === null) return { error: 'Invalid position.' }

  const ids = [projectId, aboveId, belowId].filter((id): id is string => id !== null)
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    return { error: 'Invalid position.' }
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, sort_order')
    .eq('company_id', company.id)
    .in('id', ids)
  const found = (data ?? []) as OrderRow[]
  if (error || found.length !== ids.length) return { error: 'Project not found.' }

  const orderOf = (id: string | null) => found.find((row) => row.id === id)?.sort_order ?? null
  const read = (id: string | null, orders: (id: string) => number | null) =>
    id === null ? undefined : orders(id)

  let target = computeMovedSortOrder(
    read(aboveId, orderOf),
    read(belowId, orderOf),
  )

  if (target === null) {
    const renumbered = await renumberCompany(supabase, company.id)
    if (!renumbered) return { error: 'Failed to move the project.' }
    const fresh = (id: string) => renumbered.get(id) ?? null
    target = computeMovedSortOrder(read(aboveId, fresh), read(belowId, fresh))
    if (target === null) return { error: 'Invalid position.' }
  }

  if (!(await setSortOrder(supabase, company.id, projectId, target))) {
    return { error: 'Failed to move the project.' }
  }

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { data: { sort_order: target } }
}
