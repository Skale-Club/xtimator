/**
 * RSS ingestion over HTTP (autoblog-parity XT-10 / MASTER D-07). HTTP twin of
 * lib/inngest/functions/autoblog.ts's fetch job — see the generate route for
 * why both exist.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { fetchAllRssSources } from '@/lib/blog/rss'
import { loadBlogSettings } from '@/lib/blog/generator'

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = requireServiceClient()
  const settings = await loadBlogSettings(svc)
  if (!settings?.rss_enabled) return NextResponse.json({ skipped: true, reason: 'rss_disabled' })

  const summary = await fetchAllRssSources(svc)
  return NextResponse.json(summary)
}
