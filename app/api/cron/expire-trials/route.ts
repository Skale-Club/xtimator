import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = requireServiceClient()

    // Find companies where tier = 'free' AND tier_trial_ends_at IS NOT NULL AND tier_trial_ends_at < NOW()
    // These are companies whose trial has expired but the column hasn't been cleared yet.
    const { data: expired, error } = await supabase
      .from('companies')
      .select('id')
      .eq('tier', 'free')
      .not('tier_trial_ends_at', 'is', null)
      .lt('tier_trial_ends_at', new Date().toISOString())

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const ids = (expired ?? []).map((r) => r.id as string)

    if (ids.length > 0) {
      const { error: updateError } = await supabase
        .from('companies')
        .update({ tier_trial_ends_at: null })
        .in('id', ids)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ expired: ids.length }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'Failed' }, { status: 500 })
  }
}
