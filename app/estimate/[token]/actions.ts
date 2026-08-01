'use server'

import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { emailFrom } from '@/lib/email/sender'
import { assertCompanyWritable, assertWritable } from '@/lib/demo/guard'
import { notifyEstimateResponse } from '@/lib/estimate/notify-response'

export async function logEstimateView(token: string): Promise<void> {
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

  // Check company notification preferences
  const { data: company } = await supabase
    .from('companies')
    .select('notify_on_view, email, name')
    .eq('id', estimateRow.company_id)
    .single()

  if (company?.notify_on_view && company.email) {
    // Load Resend key from DB-backed loader (ADMIN-06)
    const resendKey = await getIntegrationKey('resend')
    if (resendKey) {
      // Fetch project name for the email
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', estimateRow.project_id)
        .single()

      try {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        const branding = await getBranding()
        const appName = branding.appName
        await resend.emails.send({
          from: emailFrom(appName),
          to: company.email,
          subject: `Your estimate was viewed - ${project?.name ?? 'Unknown Project'}`,
          text: `Hi ${company.name},\n\nYour estimate for "${project?.name ?? 'Unknown Project'}" was just viewed by the client.\n\nLog in to ${appName} to see more details.`,
        })
      } catch {
        // Resend not installed yet or send failed — skip silently
      }
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
