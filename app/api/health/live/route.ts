/**
 * Liveness probe — GET /api/health/live.
 *
 * This is the probe the container orchestrator (Docker HEALTHCHECK +
 * Coolify/Traefik) uses to decide whether to ROUTE TRAFFIC to this container.
 * It MUST stay a pure liveness check: it only proves the Node process is up and
 * answering HTTP. It performs ZERO external calls.
 *
 * CRITICAL — never add a DB, storage, or any downstream-dependency probe here.
 * The deep readiness check lives at /api/health (DB + storage). If the proxy
 * health gate ever depends on Supabase again, a transient Supabase blip marks
 * the container "unhealthy", Coolify pulls it from the proxy, and the site
 * returns "no available server" even though the app itself is perfectly fine.
 * Liveness (route traffic?) and readiness (is everything wired?) are separate
 * concerns and must stay separate probes.
 *
 * `commit` echoes process.env.GIT_SHA purely so `curl /api/health/live` can
 * confirm which build is live; it never gates the 200.
 */

import { NextResponse } from 'next/server'

// Never cached — must reflect the live process, not a build-time snapshot.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export function GET() {
  return NextResponse.json(
    { ok: true, live: true, commit: process.env.GIT_SHA ?? 'unknown' },
    { status: 200 },
  )
}
