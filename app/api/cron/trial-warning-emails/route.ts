import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { getBillingConfig } from '@/lib/billing/billing-config'
import { formatMinorUnits } from '@/lib/money/currency'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!isAuthorizedCron(request)) {
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

    const appUrl = getCanonicalBaseUrl()

    // Pricing is the billing-config source of truth (no hardcoded numbers — the
    // same rule the credit ledger enforces), and the sender + brand name come
    // from platform branding instead of Resend's shared sandbox domain.
    const [cfg, branding] = await Promise.all([getBillingConfig(), getBranding()])
    const proPrice = formatMinorUnits(cfg.tiers.pro.subscriptionPriceCents, 'USD')
    const businessPrice = formatMinorUnits(cfg.tiers.business.subscriptionPriceCents, 'USD')
    const appName = branding.appName
    const fromAddress = `${appName} <notifications@xtimator.com>`
    const upgradeLine = `Upgrade to Pro (${proPrice}/mo) or Business (${businessPrice}/mo) to keep unlimited access.`

    let sent = 0
    await Promise.allSettled(
      allCompanies.map(async (company) => {
        const email = emailById.get(company.user_id as string)
        if (!email) return

        const isT0 = company.type === 't0'
        const subject = isT0
          ? `Your ${appName} trial ends today`
          : `Your ${appName} trial expires in 3 days`
        const lead = isT0
          ? `Your 14-day ${appName} trial ends today.`
          : `Your 14-day ${appName} trial expires in 3 days.`
        const body = `Hi,\n\n${lead} ${upgradeLine}\n\nUpgrade now: ${appUrl}/settings/billing\n\nThank you,\nThe ${appName} Team`

        const { error } = await resend.emails.send({
          from: fromAddress,
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
