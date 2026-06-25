'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { assertWritable } from '@/lib/demo/guard'

export type TourEventType =
  | 'tour_started'
  | 'tour_step_completed'
  | 'tour_finished'
  | 'tour_skipped'

export interface TourEventMetadata {
  step_index?: number
  step_id?: string
  language?: string
}

// Private inline auth context — mirrors lib/actions/project.ts pattern.
// NOT exported. NOT imported from a shared module.
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }

  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return { error: 'No company found' as const }

  // getActiveCompanyId() already validated membership (company_members FK →
  // companies), so the company row provably exists — skip a redundant SELECT.
  const company = { id: activeCompanyId }

  const denied = await assertWritable()
  if (denied) return denied

  return { supabase, company, userId: claims.sub }
}

/**
 * Fire-and-forget tour telemetry. Inserts into tour_events table.
 * Never throws — telemetry failure must not block tour UX.
 * Called with `void logTourEvent(...)` from TourSpotlight client component.
 */
export async function logTourEvent(
  eventType: TourEventType,
  metadata?: TourEventMetadata
): Promise<void> {
  try {
    const ctx = await getAuthContext()
    if ('error' in ctx) return
    const { supabase, company, userId } = ctx
    await supabase.from('tour_events').insert({
      company_id: company.id,
      user_id: userId,
      event_type: eventType,
      metadata: metadata ?? null,
    })
  } catch {
    // Swallow all errors — telemetry failure must not disrupt tour UX.
  }
}
