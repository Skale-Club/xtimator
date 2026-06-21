/**
 * Phase 1000 (XPHERE-B6): Admin-only Xphere backfill.
 *
 * Existing companies predate the lifecycle hooks (Plan 04), so they were never
 * mirrored into Xphere. This route enqueues a sync for every company in batches.
 *
 * Idempotent: Xphere upserts by external_id (company.id), so re-running is safe.
 * It uses the note-less 'company.updated' event so backfill re-runs never spam
 * the Xphere contact timeline (mapping.ts returns no note for 'company.updated').
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin-context'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import { EVENT_XPHERE_SYNC } from '@/lib/inngest/events'

export const dynamic = 'force-dynamic'

const CHUNK = 100

/**
 * Pure, unit-testable: map company ids → chunked batches of
 * `xphere/sync.requested` events (note-less 'company.updated' for idempotent
 * re-runs). Returns [] for an empty input.
 */
export function chunkEventBatches(companyIds: string[], size: number) {
  const events = companyIds.map((companyId) => ({
    name: EVENT_XPHERE_SYNC,
    data: { companyId, event: 'company.updated' as const },
  }))
  const chunks: (typeof events)[] = []
  for (let i = 0; i < events.length; i += size) {
    chunks.push(events.slice(i, i + size))
  }
  return chunks
}

export async function POST() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = requireServiceClient()
  const { data, error } = await svc.from('companies').select('id')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (data ?? []).map((r) => r.id as string)
  const chunks = chunkEventBatches(ids, CHUNK)
  for (const chunk of chunks) {
    // Await each chunk so we don't overwhelm the queue; idempotent Xphere-side.
    await inngest.send(chunk)
  }

  return NextResponse.json({ enqueued: ids.length, chunks: chunks.length }, { status: 200 })
}
