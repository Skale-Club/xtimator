import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { notifyOps } from '@/lib/observability/ops-alert'
import { recordCronHeartbeat } from '@/lib/observability/cron-heartbeat'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 503 }
    )
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = requireServiceClient()
    const { data, error } = await supabase.rpc('cleanup_orphan_draft_projects')
    if (error) {
      void notifyOps({
        kind: 'cron_failed',
        title: 'Cron cleanup-orphan-projects failed',
        message: error.message,
        severity: 'error',
        dedupeKey: 'cron:cleanup-orphan-projects',
        suppressWindowSec: 3600,
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const deletedCount = (data as Array<{ deleted_count: number }>)?.[0]?.deleted_count ?? 0

    // Deadman: record that this job actually ran to completion. Success path
    // only — a failed run must leave the heartbeat stale so the external probe
    // can still see the silence. Awaited (not fire-and-forget) so the write
    // isn't cut off when the serverless invocation ends; it never throws.
    await recordCronHeartbeat('cleanup-orphan-projects', {
      deleted_count: deletedCount,
    })

    return NextResponse.json({ deleted_count: deletedCount }, { status: 200 })
  } catch (err) {
    void notifyOps({
      kind: 'cron_failed',
      title: 'Cron cleanup-orphan-projects failed',
      message: (err as Error).message ?? 'Cleanup failed',
      severity: 'error',
      dedupeKey: 'cron:cleanup-orphan-projects',
      suppressWindowSec: 3600,
    })
    return NextResponse.json(
      { error: (err as Error).message ?? 'Cleanup failed' },
      { status: 500 }
    )
  }
}
