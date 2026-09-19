/**
 * Auto-blog generation over HTTP (autoblog-parity XT-10 / MASTER D-07).
 *
 * The scheduled path is the Inngest sweep (lib/inngest/functions/autoblog.ts).
 * This is the same work behind CRON_SECRET, for two reasons:
 *
 *   - Every product in the org answers this URL, so one scheduler configuration
 *     drives all five.
 *   - This repo has a documented history of a missed Inngest re-sync silently
 *     stopping every event-triggered job. When that happens the blog should be
 *     one curl away from running, not one deploy.
 *
 * Running both paths at once is survivable because the generator takes a
 * database lock; it is still not the plan.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { generateBlogPost } from '@/lib/blog/generator'

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron semantics by default, so a scheduled call stays subject to every
  // cadence gate. ?manual=1 opts into the same bypass the admin button has,
  // which is what makes this usable as a break-glass trigger: with a posting
  // hour set, a cron-semantics call outside that hour can only ever answer
  // "skipped", precisely when it is least helpful.
  const manual = new URL(request.url).searchParams.get('manual') === '1'
  const result = await generateBlogPost({ trigger: manual ? 'manual' : 'cron' })

  if (result.status === 'failed') return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
