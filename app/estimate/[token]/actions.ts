'use server'

import { headers } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { notifyEstimateResponse } from '@/lib/estimate/notify-response'
import { resolveClientIp } from '@/lib/http/client-ip'
import { rateLimit } from '@/lib/ratelimit'
import { inngest } from '@/lib/inngest/client'
import { EVENT_ESTIMATE_VIEWED_NOTIFICATION } from '@/lib/inngest/events'
import { sha256Hex, setUnlockCookie, verifySharePassword } from '@/lib/auth/share-password'

export async function logEstimateView(token: string): Promise<void> {
  // Phase 193-01 — this is called fire-and-forget from an anonymous share
  // page's initial render (app/estimate/[token]/page.tsx and its
  // friendly-URL sibling), so it needs the same throttle-before-anything
  // discipline as the public track/sign endpoints. Shares the
  // trackEstimatePerMinute bucket with app/api/track/estimate/route.ts — one
  // real page load fires both, so a single generous bucket is simpler than
  // two separate ones. Silent drop on exceed: this is a best-effort view
  // log, never something to surface an error for.
  let ip: string | null = null
  try {
    const headersList = await headers()
    ip = resolveClientIp(headersList)
  } catch {
    // headers() throws when called outside a request scope. logEstimateView
    // is always invoked from within a request in production (the two share
    // pages, fire-and-forget), but degrade to the shared "no-ip" bucket
    // rather than let a harness quirk turn "log this view" into "crash".
    ip = null
  }
  const rl = await rateLimit('trackEstimatePerMinute', ip ?? 'no-ip')
  if (!rl.allowed) return

  const supabase = requireServiceClient()

  // Look up estimate by share_token. Select extra fields needed for the
  // in-app notification copy (Phase 77 NOTIF-04).
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, viewed_at, estimate_number, client_name')
    .eq('share_token', token)
    .single()

  if (!estimate) return

  const estimateRow = estimate as {
    id: string
    project_id: string
    company_id: string
    viewed_at: string | null
    estimate_number?: string | null
    client_name?: string | null
  }

  const denied = (await assertWritable()) ?? await assertCompanyWritable(estimateRow.company_id)
  if (denied) return

  // Update viewed_at only on first view
  if (!estimateRow.viewed_at) {
    await supabase
      .from('estimates')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', estimateRow.id)
  }

  // Log view activity
  await supabase.from('estimate_activity').insert({
    project_id: estimateRow.project_id,
    company_id: estimateRow.company_id,
    estimate_id: estimateRow.id,
    event_type: 'estimate_viewed',
    metadata: {},
  })

  // Phase 77 NOTIF-04: fire in-app notification. Best-effort — notify() never
  // throws. Dedupe key is per estimate per day so repeated views by the same
  // client only ping the owner once a day.
  try {
    const ymd = new Date().toISOString().slice(0, 10)
    const ctx = {
      estimateNumber: estimateRow.estimate_number ?? undefined,
      clientName: estimateRow.client_name ?? undefined,
    }
    const copy = buildNotificationCopy('estimate.viewed', ctx)
    void notify({
      companyId: estimateRow.company_id,
      userId: null, // company-wide row — every member sees it
      eventType: 'estimate.viewed',
      title: copy.title,
      body: copy.body,
      linkUrl: `/projects/${estimateRow.project_id}/estimates/${estimateRow.id}`,
      resourceType: 'estimate',
      resourceId: estimateRow.id,
      metadata: {
        dedupe_key: `estimate-viewed-${estimateRow.id}-${ymd}`,
      },
      copyContext: ctx,
    })
  } catch {
    /* best-effort */
  }

  // Check company notification preferences. The gate itself stays inline
  // (one cheap read, avoids emitting an event for companies that don't want
  // one) — but Phase 193-01 moved the actual Resend HTTP call OFF this
  // anonymous request path: it now runs in
  // lib/inngest/functions/estimate-viewed-notification.ts, which re-derives
  // company/project fresh rather than trusting anything from this event
  // beyond the two ids.
  const { data: company } = await supabase
    .from('companies')
    .select('notify_on_view, email')
    .eq('id', estimateRow.company_id)
    .single()

  if (company?.notify_on_view && company.email) {
    try {
      await inngest.send({
        name: EVENT_ESTIMATE_VIEWED_NOTIFICATION,
        data: {
          companyId: estimateRow.company_id,
          projectId: estimateRow.project_id,
        },
      })
    } catch (err) {
      // Best-effort — a dispatch failure must never surface to the
      // anonymous visitor whose page render triggered this.
      console.warn('[logEstimateView] failed to dispatch view-notification event:', err)
    }
  }
}

export async function respondToEstimate(
  token: string,
  response: 'accepted' | 'declined'
): Promise<{ success: boolean; error?: string }> {
  const supabase = requireServiceClient()

  // Look up estimate
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, project_id, company_id, client_response, estimate_number, client_name')
    .eq('share_token', token)
    .single()

  if (!estimate) {
    return { success: false, error: 'Estimate not found' }
  }

  const est = estimate as {
    id: string
    project_id: string
    company_id: string
    client_response: string | null
    estimate_number?: string | null
    client_name?: string | null
  }

  const denied = (await assertWritable()) ?? await assertCompanyWritable(est.company_id)
  if (denied) return { success: false, error: denied.error }

  if (est.client_response) {
    return { success: false, error: 'This estimate has already been responded to' }
  }

  // Security-hardening S2 (audit finding b1 — sign-vs-decline race): the
  // pre-check above can go stale between its SELECT and this UPDATE (a
  // concurrent sign request — app/api/estimates/[id]/sign/route.ts, whose
  // sign_estimate_atomic RPC ALSO writes client_response='accepted' — can
  // land in that exact window). Adding `.is('client_response', null)` makes
  // this UPDATE itself the check-and-set: Postgres only matches rows where
  // client_response is STILL null at write time. `.select('id')` on the
  // result is how we detect a lost race — zero returned rows means this
  // call's WHERE clause matched nothing (someone else responded first), so
  // we must not proceed to the project/activity/notify side effects below.
  const { data: updatedRows, error: updateError } = await supabase
    .from('estimates')
    .update({
      client_response: response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', est.id)
    .is('client_response', null)
    .select('id')

  if (updateError || !updatedRows || updatedRows.length === 0) {
    return { success: false, error: 'This estimate has already been responded to' }
  }

  // Update project status to match response
  await supabase
    .from('projects')
    .update({ status: response })
    .eq('id', est.project_id)

  // Log activity
  await supabase.from('estimate_activity').insert({
    project_id: est.project_id,
    company_id: est.company_id,
    estimate_id: est.id,
    event_type: `estimate_${response}`,
    metadata: {},
  })

  await notifyEstimateResponse(est, response)

  return { success: true }
}

// ---------------------------------------------------------------------------
// unlockEstimate — Phase 193-02: verify a share-link password and, on
// success, mint the signed unlock cookie for this estimate.
// ---------------------------------------------------------------------------

const UNLOCK_GENERIC_ERROR = 'Incorrect password. Please try again.'
const UNLOCK_RATE_LIMITED_ERROR = 'Too many attempts. Please wait a minute and try again.'

export async function unlockEstimate(
  token: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Rate limit FIRST — before any lookup or verification work, mirroring
  // app/api/estimates/[id]/sign/route.ts and app/api/track/estimate's
  // ordering discipline. Keyed by ip + a truncated token hash (never the raw
  // token in a Redis key), so throttling is per-visitor-per-estimate.
  let ip: string | null = null
  try {
    const headersList = await headers()
    ip = resolveClientIp(headersList)
  } catch {
    ip = null
  }
  const tokenKeyFragment = sha256Hex(token).slice(0, 16)
  const rl = await rateLimit('estimateUnlockPerMinute', `${ip ?? 'no-ip'}:${tokenKeyFragment}`)
  if (!rl.allowed) {
    return { success: false, error: UNLOCK_RATE_LIMITED_ERROR }
  }

  // 2. Resolve the estimate by its share_token. Deliberately selects only
  // the 3 columns needed here -- never the full document.
  const supabase = requireServiceClient()
  const { data } = await supabase
    .from('estimates')
    .select('id, company_id, share_password_hash')
    .eq('share_token', token)
    .maybeSingle()

  const estimate = data as
    | { id: string; company_id: string; share_password_hash: string | null }
    | null

  // Demo-tenant posture mirrors logEstimateView/respondToEstimate above:
  // assertWritable() covers the (rare) case of an authenticated demo browser
  // session hitting this anonymous action; assertCompanyWritable(companyId)
  // covers a demo-owned estimate regardless of caller session. Neither
  // blocks the password check/cookie itself (a demo tenant can never HAVE a
  // password set -- setEstimateSharePassword in lib/actions/estimate.ts
  // gates on the same two checks) -- it only suppresses the engagement-event
  // write, matching the 193-01 collector's demo posture.
  const denied = (await assertWritable()) ?? (estimate ? await assertCompanyWritable(estimate.company_id) : null)

  async function recordUnlockEvent(eventType: 'unlock_ok' | 'unlock_fail'): Promise<void> {
    if (!estimate || denied) return
    try {
      await supabase.from('estimate_engagement_events').insert({
        estimate_id: estimate.id,
        company_id: estimate.company_id,
        // Server-emitted event -- no real visitor/session id exists for it
        // (the public collector at app/api/track/estimate deliberately
        // rejects these two event types from anonymous callers).
        visitor_id: 'server-unlock',
        session_id: `unlock-${Date.now()}`,
        event_type: eventType,
        metadata: {},
      })
    } catch (err) {
      // Best-effort telemetry -- never let a logging failure change the
      // unlock/deny outcome already decided below.
      console.warn('[unlockEstimate] failed to record engagement event:', err)
    }
  }

  // 3. No oracle: an unknown token, an estimate with no password set, and a
  // wrong password all return the SAME generic error.
  if (!estimate || !estimate.share_password_hash) {
    await recordUnlockEvent('unlock_fail')
    return { success: false, error: UNLOCK_GENERIC_ERROR }
  }

  if (!verifySharePassword(password, estimate.share_password_hash)) {
    await recordUnlockEvent('unlock_fail')
    return { success: false, error: UNLOCK_GENERIC_ERROR }
  }

  await setUnlockCookie(token)
  await recordUnlockEvent('unlock_ok')
  return { success: true }
}
