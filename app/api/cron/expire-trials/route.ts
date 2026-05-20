import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'

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
      .select('id, user_id')
      .eq('tier', 'free')
      .not('tier_trial_ends_at', 'is', null)
      .lt('tier_trial_ends_at', new Date().toISOString())

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (expired ?? []) as Array<{ id: string; user_id: string | null }>
    const ids = rows.map((r) => r.id)

    if (ids.length > 0) {
      const { error: updateError } = await supabase
        .from('companies')
        .update({ tier_trial_ends_at: null })
        .in('id', ids)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      // Phase 77 NOTIF-04: fire trial.expired with force channels — users MUST
      // know their trial ended. Best-effort, parallelized, never blocks the
      // cron response.
      const copy = buildNotificationCopy('trial.expired', {})
      await Promise.allSettled(
        rows.map((row) =>
          notify({
            companyId: row.id,
            userId: row.user_id ?? null,
            eventType: 'trial.expired',
            title: copy.title,
            body: copy.body,
            linkUrl: '/settings/billing',
            channels: { inApp: true, email: true },
            metadata: { dedupe_key: `trial-expired-${row.id}` },
          })
        )
      )
    }

    return NextResponse.json({ expired: ids.length }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'Failed' }, { status: 500 })
  }
}
