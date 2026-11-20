import 'server-only'
import { cache } from 'react'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Credits plan 2026-11-20: the company's captures paused for credits right now
 * (lib/inngest/credit-pause.ts). A pause is live while its `awaiting_credits`
 * journal row is the attempt's LATEST row (a resume or an expiry appends a row
 * after it) and its expiry is still ahead. pipeline_events is super-admin only
 * under RLS, so this reads through the service client, scoped by company.
 */
export type PausedCapture = {
  attemptId: string
  projectId: string
  expiresAt: string | null
  next: 'analyze' | 'generate_estimate'
}

type Row = {
  attempt_id: string
  project_id: string | null
  error_code: string | null
  created_at: string
  metadata: { expiresAt?: unknown; next?: unknown } | null
}

export const getPausedCaptures = cache(async (companyId: string): Promise<PausedCapture[]> => {
  try {
    const svc = requireServiceClient()
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const { data: pauses } = await svc
      .from('pipeline_events')
      .select('attempt_id')
      .eq('company_id', companyId)
      .eq('error_code', 'awaiting_credits')
      .gte('created_at', since)
      .limit(50)
    const ids = [...new Set(((pauses ?? []) as Array<{ attempt_id: string }>).map((p) => p.attempt_id))]
    if (ids.length === 0) return []

    const { data } = await svc
      .from('pipeline_events')
      .select('attempt_id, project_id, error_code, created_at, metadata')
      .in('attempt_id', ids)
      .order('created_at', { ascending: false })
    const latest = new Map<string, Row>()
    for (const r of (data ?? []) as Row[]) if (!latest.has(r.attempt_id)) latest.set(r.attempt_id, r)

    const now = Date.now()
    const out: PausedCapture[] = []
    for (const r of latest.values()) {
      if (r.error_code !== 'awaiting_credits' || !r.project_id) continue
      const expiresAt = typeof r.metadata?.expiresAt === 'string' ? r.metadata.expiresAt : null
      if (expiresAt && Date.parse(expiresAt) <= now) continue
      out.push({
        attemptId: r.attempt_id,
        projectId: r.project_id,
        expiresAt,
        next: r.metadata?.next === 'analyze' ? 'analyze' : 'generate_estimate',
      })
    }
    return out
  } catch (err) {
    console.warn('[credit-pauses] read failed:', err instanceof Error ? err.message : err)
    return []
  }
})

/**
 * Marks paused projects with the virtual status the project badge renders and
 * the paused attempt the badge opens (?paused=).
 */
export function withPausedStatus<T extends { id: string; status: string }>(
  projects: T[],
  paused: PausedCapture[]
): Array<T & { paused_attempt_id?: string }> {
  if (paused.length === 0) return projects
  const byProject = new Map(paused.map((p) => [p.projectId, p.attemptId]))
  return projects.map((p) =>
    byProject.has(p.id) ? { ...p, status: 'awaiting_credits', paused_attempt_id: byProject.get(p.id) } : p
  )
}
