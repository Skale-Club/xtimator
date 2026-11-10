import { parseTrackBody, resolveEstimateByToken, type TrackEvent } from "@/lib/estimates/tracking-payload"
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { resolveClientIp } from '@/lib/http/client-ip'
import { requireServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/ratelimit'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { isOwnerVisit } from '@/lib/estimates/owner-visit'

/**
 * Phase 193-01 — public engagement-tracking beacon collector.
 *
 * Anonymous share-page visitors POST batched view/click/scroll/section
 * events here via navigator.sendBeacon (fallback fetch keepalive) — see
 * hooks/use-estimate-tracking.ts. No auth: the caller only ever holds the
 * share_token or public_slug_token already embedded in the page it loaded.
 *
 * Modeled on app/api/csp-report/route.ts: POST only, force-dynamic, ALWAYS
 * returns 204, and NEVER throws or otherwise leaks whether a token exists,
 * is expired, is rate-limited, or belongs to a demo tenant — any of those
 * would turn this into an oracle for enumerating estimates. Every early
 * return in this file funnels through noContent() for that reason.
 *
 * Ordering discipline mirrors app/api/estimates/[id]/sign/route.ts
 * (~lines 137-146): rate limiting runs FIRST, before the body is even read,
 * so an attacker cannot spend arbitrary CPU/DB budget by exceeding the
 * limiter. Demo guard runs AFTER token resolution (it needs company_id from
 * the resolved estimate) but STILL before any write.
 */
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 32 * 1024

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: Request) {
  try {
    // Rate limit FIRST — before reading the body, before any DB lookup.
    const headersList = await headers()
    const ip = resolveClientIp(headersList)
    const rl = await rateLimit('trackEstimatePerMinute', ip ?? 'no-ip')
    if (!rl.allowed) return noContent()

    // Cheap header-based size check before reading the body; the byte-length
    // check on the actual text below is the authoritative backstop (a caller
    // can omit or lie about Content-Length).
    const declaredLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return noContent()
    }

    const rawText = await request.text().catch(() => null)
    if (rawText === null || rawText.length > MAX_BODY_BYTES) return noContent()

    let json: unknown
    try {
      json = JSON.parse(rawText)
    } catch {
      return noContent()
    }

    const body = parseTrackBody(json)
    if (!body) return noContent()

    const supabase = requireServiceClient()

    // Token resolution — unknown/expired tokens drop silently (no oracle).
    const estimate = await resolveEstimateByToken(supabase, body.token)
    if (!estimate) return noContent()

    // Demo guard runs before any write, after we know which company owns
    // the resolved estimate (mirrors logEstimateView's demo-write posture).
    const denied = await assertCompanyWritable(estimate.company_id)
    if (denied) return noContent()

    // The owner previewing their own link is not engagement. Same silent 204 as
    // every other early return so this can't be probed as an oracle.
    if (await isOwnerVisit(estimate.company_id)) return noContent()

    const rows = body.events.map((event: TrackEvent) => ({
      estimate_id: estimate.id,
      company_id: estimate.company_id,
      visitor_id: body.visitor_id,
      session_id: body.session_id,
      event_type: event.event_type,
      target: event.target ?? null,
      x_pct: event.x_pct ?? null,
      y_px: event.y_px ?? null,
      doc_h: event.doc_h ?? null,
      viewport_w: event.viewport_w ?? null,
      device: event.device ?? null,
      metadata: event.metadata ?? {},
    }))

    await supabase.from('estimate_engagement_events').insert(rows)

    // `estimates.viewed_at` (set once, first-view semantics) is owned by
    // logEstimateView — this route only maintains the new counters.
    const viewEventCount: number = body.events.filter(
      (e: TrackEvent) => e.event_type === 'view'
    ).length
    if (viewEventCount > 0) {
      // Atomic increment via RPC (migration 20260825000002). Two things this
      // buys over a read-then-write UPDATE here: concurrent visitors can't lose
      // each other's increments, and — critically — the counter write does NOT
      // restamp estimates.updated_at. That column is an optimistic-concurrency
      // token (p_expected_updated_at in lib/actions/estimate.ts and
      // sign_estimate_atomic) and a PDF cache key, so letting a prospect's page
      // view move it would spuriously fail the owner's save and the client's
      // own signature attempt.
      await supabase.rpc('bump_estimate_view_count', {
        p_estimate_id: estimate.id,
        p_delta: viewEventCount,
      })
    }
  } catch (err) {
    // Never let a malformed beacon or DB hiccup surface to the browser —
    // this is a fire-and-forget collector (mirrors csp-report's posture).
    console.warn('[track-estimate] failed to process beacon:', err)
  }

  return noContent()
}
