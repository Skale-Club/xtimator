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
 *
 * XTIMATOR-8 noise fix: forwarding EVERY report to Sentry as a captureMessage
 * fired a "New Alert" per page-view for violations we can't act on — almost
 * all of them caused by browser extensions injecting scripts/styles into the
 * page. Extension-originated reports are now logged to stdout only; genuine
 * app-originated violations still reach Sentry, fingerprinted by
 * directive+blocked-uri so each unique violation is ONE grouped issue.
 */
export const dynamic = 'force-dynamic'

/** Sources that browsers report for extension/injected content — not actionable. */
const EXTENSION_URI_RE =
  /^(chrome-extension|moz-extension|safari-extension|safari-web-extension|chrome|about|resource):/i

type CspReportFields = {
  'blocked-uri'?: string
  'source-file'?: string
  'violated-directive'?: string
  'effective-directive'?: string
  // Reporting API (application/reports+json) uses camelCase
  blockedURL?: string
  sourceFile?: string
  effectiveDirective?: string
}

/** Normalizes both the legacy csp-report shape and the Reporting API shape. */
function extractReport(body: unknown): CspReportFields {
  if (!body || typeof body !== 'object') return {}
  if (Array.isArray(body)) {
    const first = body[0] as Record<string, unknown> | undefined
    if (first?.body && typeof first.body === 'object') return first.body as CspReportFields
    return {}
  }
  const b = body as Record<string, unknown>
  if (b['csp-report'] && typeof b['csp-report'] === 'object') {
    return b['csp-report'] as CspReportFields
  }
  return b as CspReportFields
}

function isExtensionNoise(r: CspReportFields): boolean {
  const blocked = r['blocked-uri'] ?? r.blockedURL ?? ''
  const source = r['source-file'] ?? r.sourceFile ?? ''
  if (EXTENSION_URI_RE.test(blocked) || EXTENSION_URI_RE.test(source)) return true
  // `inline`/`eval` script-src reports are NOT actionable per-request in the
  // current report-only policy, regardless of source-file:
  //   • script-src already grants 'unsafe-inline', so an `inline` report is
  //     contradictory noise.
  //   • `eval` originates from bundled third-party code (a dependency using
  //     new Function/eval, surfaced from a first-party _next/ chunk). It can
  //     only be addressed wholesale — add 'unsafe-eval' OR drop the dep —
  //     BEFORE flipping CSP to enforcing, never fixed per page-view.
  // These were firing one escalating Sentry issue each on every page load
  // (XTIMATOR-A / XTIMATOR-8). Still logged to stdout above for visibility.
  if (blocked === 'inline' || blocked === 'eval' || blocked === '') return true
  return false
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (body) {
      // Never let a malformed/huge report crash logging — truncate defensively.
      const summary = JSON.stringify(body).slice(0, 4000)
      console.warn('[csp-report]', summary)

      const report = extractReport(body)
      if (!isExtensionNoise(report)) {
        const directive =
          report['effective-directive'] ?? report.effectiveDirective ?? report['violated-directive'] ?? 'unknown'
        const blocked = report['blocked-uri'] ?? report.blockedURL ?? 'unknown'
        Sentry.captureMessage(`CSP violation: ${directive} → ${blocked}`, {
          level: 'warning',
          fingerprint: ['csp-violation', directive, blocked],
          extra: { report: body },
        })
      }
    }
  } catch (err) {
    console.warn('[csp-report] failed to process report:', err)
  }

  // 204 — browsers don't do anything with the response body for CSP reports.
  return new NextResponse(null, { status: 204 })
}
