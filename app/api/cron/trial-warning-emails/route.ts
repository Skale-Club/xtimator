import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
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
    const now = new Date()

    // T-3 window: trial ends 2d20h to 3d4h from now
    const t3Low = new Date(now.getTime() + (2 * 24 + 20) * 60 * 60 * 1000).toISOString()
    const t3High = new Date(now.getTime() + (3 * 24 + 4) * 60 * 60 * 1000).toISOString()

    // T-0 window: trial ends within ±4h of now
    const t0Low = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString()
    const t0High = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()

    // Fetch T-3 and T-0 companies in parallel
    const [{ data: t3Companies }, { data: t0Companies }] = await Promise.all([
      supabase
        .from('companies')
        .select('id, name, user_id')
        .eq('tier', 'free')
        .not('tier_trial_ends_at', 'is', null)
        .gte('tier_trial_ends_at', t3Low)
        .lte('tier_trial_ends_at', t3High),
      supabase
        .from('companies')
        .select('id, name, user_id')
        .eq('tier', 'free')
        .not('tier_trial_ends_at', 'is', null)
        .gte('tier_trial_ends_at', t0Low)
        .lte('tier_trial_ends_at', t0High),
    ])

    const allCompanies = [
      ...((t3Companies ?? []).map((c) => ({ ...c, type: 't3' as const }))),
      ...((t0Companies ?? []).map((c) => ({ ...c, type: 't0' as const }))),
    ]

    if (allCompanies.length === 0) {
      return NextResponse.json({ sent: 0 }, { status: 200 })
    }

    // Phase 77 NOTIF-04: fire in-app notification alongside the email send.
    // T-3 cohort → trial.expiring_3d. T-0 cohort is handled by the
    // expire-trials cron once the trial actually ends (avoids double-pinging).
    await Promise.allSettled(
      allCompanies
        .filter((c) => c.type === 't3')
        .map((c) => {
          const copy = buildNotificationCopy('trial.expiring_3d', {
            daysRemaining: 3,
          })
          return notify({
            companyId: c.id as string,
            userId: (c.user_id as string | null) ?? null,
            eventType: 'trial.expiring_3d',
            title: copy.title,
            body: copy.body,
            linkUrl: '/settings/billing',
            metadata: { dedupe_key: `trial-warning-3d-${c.id as string}` },
          })
        })
    )

    // Get emails for all user_ids in one call
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const emailById = new Map<string, string>()
    for (const u of userList?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email)
    }

    const resendKey = await getIntegrationKey('resend')
    if (!resendKey) {
      return NextResponse.json({ error: 'Resend not configured' }, { status: 503 })
    }
    const resend = new Resend(resendKey)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://xtimator.com'

    let sent = 0
    await Promise.allSettled(
      allCompanies.map(async (company) => {
        const email = emailById.get(company.user_id as string)
        if (!email) return

        const isT0 = company.type === 't0'
        const subject = isT0
          ? 'Your Xtimator trial ends today'
          : 'Your Xtimator trial expires in 3 days'
        const body = isT0
          ? `Hi,\n\nYour 14-day Xtimator trial ends today. Upgrade to Pro ($29/mo) or Business ($99/mo) to keep unlimited access.\n\nUpgrade now: ${appUrl}/settings/billing\n\nThank you,\nThe Xtimator Team`
          : `Hi,\n\nYour 14-day Xtimator trial expires in 3 days. Upgrade to Pro ($29/mo) or Business ($99/mo) to keep unlimited access.\n\nUpgrade now: ${appUrl}/settings/billing\n\nThank you,\nThe Xtimator Team`

        const { error } = await resend.emails.send({
          from: 'Xtimator <onboarding@resend.dev>',
          to: email,
          subject,
          text: body,
        })
        if (!error) sent++
      })
    )

    return NextResponse.json({ sent, total: allCompanies.length }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'Failed' }, { status: 500 })
  }
}
