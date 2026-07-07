import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'

/**
 * Pre-launch audit fix (B4): every dispatcher that hands a jobId (Inngest
 * event id) back to the browser for polling must record which company owns
 * it, so GET /api/jobs/[jobId] can reject cross-tenant polling. Best-effort —
 * a failure to record ownership must never break dispatch (the job itself
 * already ran); it only means that job's poll falls back to the
 * config_unavailable-safe "not_found" state for other tenants, and to a
 * denied poll for THIS tenant too (fail-closed is acceptable here — the
 * estimate/analysis itself still completes and is visible on the project
 * page once the user navigates there).
 */
export async function recordJobOwnership(eventId: string, companyId: string): Promise<void> {
  try {
    const svc = requireServiceClient()
    await svc.from('job_dispatch_ownership').insert({ event_id: eventId, company_id: companyId })
  } catch (err) {
    console.warn('[recordJobOwnership] swallowed write failure:', err)
  }
}

/** Returns the company_id that dispatched this event, or null if unknown. */
export async function getJobOwnerCompanyId(eventId: string): Promise<string | null> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('job_dispatch_ownership')
      .select('company_id')
      .eq('event_id', eventId)
      .maybeSingle()
    return (data as { company_id?: string } | null)?.company_id ?? null
  } catch (err) {
    console.warn('[getJobOwnerCompanyId] swallowed read failure:', err)
    return null
  }
}
