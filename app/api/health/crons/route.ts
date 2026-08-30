/**
 * GET /api/health/crons — deadman status for the scheduled jobs.
 *
 * Read by .github/workflows/uptime-probe.yml, which runs OUTSIDE this server so
 * it still works when the app cannot report on itself.
 *
 * Why this is separate from /api/health:
 *   - /api/health is the deploy gate. build-deploy.yml polls it to decide when
 *     the new container is serving, and Docker's HEALTHCHECK reads it. Adding
 *     cron staleness there would mean a silent VPS crontab could fail a deploy
 *     or mark a perfectly healthy container unhealthy. Liveness, readiness and
 *     schedule-liveness are three different questions and must not share a gate.
 *   - /api/health/live must stay dependency-free (see its own docblock).
 *
 * Contract:
 *   200 + { ok: true,  jobs: [...] }  every watched job has a recent heartbeat
 *   200 + { ok: false, jobs: [...] }  at least one job is stale
 *
 * ALWAYS 200, never 503, even when ok:false. The probe reads the `ok` field.
 * A non-2xx here would be indistinguishable from "the app is down" to any
 * generic HTTP monitor, and a silent crontab is emphatically not the app being
 * down — conflating them would send the wrong alert and the wrong runbook.
 *
 * Unauthenticated on purpose, matching /api/health: it exposes only job names
 * and timestamps — no tenant data, no counts of anything customer-owned.
 */

import { NextResponse } from 'next/server'
import { getCronHeartbeats } from '@/lib/observability/cron-heartbeat'

// Never cached — a cached heartbeat age is a lie that grows with time.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const jobs = await getCronHeartbeats()
  const ok = jobs.every((j) => !j.stale)
  return NextResponse.json({ ok, jobs }, { status: 200 })
}
