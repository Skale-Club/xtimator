import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 503 }
    )
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = requireServiceClient()
    const { data, error } = await supabase.rpc('cleanup_orphan_draft_projects')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const deletedCount = (data as Array<{ deleted_count: number }>)?.[0]?.deleted_count ?? 0
    return NextResponse.json({ deleted_count: deletedCount }, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? 'Cleanup failed' },
      { status: 500 }
    )
  }
}
