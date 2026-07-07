import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

/**
 * Pre-launch audit fix: next.config.ts ships a Content-Security-Policy in
 * REPORT-ONLY mode specifically so violations can be observed before
 * flipping to enforcing — but there was no `report-uri`/collector at all, so
 * violations were never actually collected anywhere, and the policy would
 * have stayed report-only forever with no way to know it was safe to enforce.
 *
 * Browsers POST a `Content-Type: application/csp-report` (or
 * `application/reports+json` for the newer Reporting API) body here whenever
 * a request would have violated the policy. No auth — this is an
 * unauthenticated browser-initiated report, exempted in proxy.ts's
 * isPublicRoute() the same way webhooks are.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (body) {
      // Never let a malformed/huge report crash logging — truncate defensively.
      const summary = JSON.stringify(body).slice(0, 4000)
      console.warn('[csp-report]', summary)
      Sentry.captureMessage('CSP violation', {
        level: 'warning',
        extra: { report: body },
      })
    }
  } catch (err) {
    console.warn('[csp-report] failed to process report:', err)
  }

  // 204 — browsers don't do anything with the response body for CSP reports.
  return new NextResponse(null, { status: 204 })
}
