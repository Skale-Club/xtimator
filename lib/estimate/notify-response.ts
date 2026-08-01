// lib/estimate/notify-response.ts
//
// Security-hardening S2: extracted from app/estimate/[token]/actions.ts's
// respondToEstimate — the in-app notification + Resend email side effects
// that run AFTER an estimate's client_response state transition (accepted or
// declined) has already been committed. Split into its own module so BOTH
// callers that can legitimately produce that transition — the public
// Accept/Decline buttons (respondToEstimate) and a signature submission
// (app/api/estimates/[id]/sign/route.ts, where a signature IS acceptance)
// — share ONE notification code path, instead of the sign route reaching
// into a 'use server' actions file to call a Server Action as a plain
// function.
//
// Deliberately NOT a 'use server' file: a 'use server' export becomes a
// callable Server Action reachable from the client bundle. This module has
// no business being invoked from the browser — it is a plain server-only
// helper, imported directly by server-side callers.
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { emailFrom } from '@/lib/email/sender'

export interface NotifyResponseEstimate {
  id: string
  project_id: string
  company_id: string
  estimate_number?: string | null
  client_name?: string | null
}

/**
 * Fires the in-app notification + (if enabled) the Resend owner email for an
 * estimate's client_response transition. Best-effort throughout — mirrors the
 * try/catch-swallow discipline the original respondToEstimate body used for
 * both the in-app notify() call and the email send, so a notification/email
 * failure here can never surface as a failure of the state transition that
 * already committed before this function is called (both callers invoke this
 * AFTER their own atomic write has succeeded).
 */
export async function notifyEstimateResponse(
  estimate: NotifyResponseEstimate,
  response: 'accepted' | 'declined'
): Promise<void> {
  const supabase = requireServiceClient()

  // Phase 77 NOTIF-04: in-app notification on client response. Best-effort.
  try {
    const eventType = response === 'accepted' ? 'estimate.accepted' : 'estimate.declined'
    const ctx = {
      estimateNumber: estimate.estimate_number ?? undefined,
      clientName: estimate.client_name ?? undefined,
    }
    const copy = buildNotificationCopy(eventType, ctx)
    void notify({
      companyId: estimate.company_id,
      userId: null,
      eventType,
      title: copy.title,
      body: copy.body,
      linkUrl: `/projects/${estimate.project_id}/estimates/${estimate.id}`,
      resourceType: 'estimate',
      resourceId: estimate.id,
      copyContext: ctx,
    })
  } catch {
    /* best-effort */
  }

  // Send notification email if enabled
  const { data: company } = await supabase
    .from('companies')
    .select('notify_on_accept, notify_on_decline, email, name')
    .eq('id', estimate.company_id)
    .single()

  const shouldNotify =
    response === 'accepted'
      ? company?.notify_on_accept
      : company?.notify_on_decline

  if (shouldNotify && company?.email) {
    // Load Resend key from DB-backed loader (ADMIN-06)
    const resendKey = await getIntegrationKey('resend')
    if (resendKey) {
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', estimate.project_id)
        .single()

      try {
        const { Resend } = await import('resend')
        const resend = new Resend(resendKey)
        const branding = await getBranding()
        const appName = branding.appName
        await resend.emails.send({
          from: emailFrom(appName),
          to: company.email,
          subject: `Estimate ${response} - ${project?.name ?? 'Unknown Project'}`,
          text: `Hi ${company.name},\n\nYour estimate for "${project?.name ?? 'Unknown Project'}" has been ${response} by the client.\n\nLog in to ${appName} to see more details.`,
        })
      } catch {
        // Resend not installed yet or send failed — skip silently
      }
    }
  }
}
