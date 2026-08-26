/**
 * Phase 193-01 — first-view owner-notification email, off the public
 * share-page request path.
 *
 * Trigger: event `estimate/viewed.notification`, emitted by
 * app/estimate/[token]/actions.ts's logEstimateView ONLY on an estimate's
 * first view AND only when the company has notify_on_view + an email on
 * file (that gate stays inline in the action — cheap, same-request read).
 * Everything past that — resolving the Resend key, branding, and the
 * project name, and the actual HTTP send — used to run inline on the
 * anonymous visitor's request; it now runs here instead.
 *
 * Re-derives company/project fresh from companyId/projectId rather than
 * trusting anything beyond ids in the event payload — same discipline as
 * notification-email-digest.ts's per-group user lookup.
 *
 * Best-effort: this is a "nice to know" email, not a product write. Any
 * failure (missing Resend key, provider error) is logged and swallowed —
 * Inngest should not retry a send that can never succeed for a company with
 * no key configured.
 */
import { inngest } from '@/lib/inngest/client'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'
import { emailFrom } from '@/lib/email/sender'
import {
  EVENT_ESTIMATE_VIEWED_NOTIFICATION,
  type EstimateViewedNotificationPayload,
} from '@/lib/inngest/events'

export const estimateViewedNotificationJob = inngest.createFunction(
  {
    id: 'estimate-viewed-notification',
    triggers: [{ event: EVENT_ESTIMATE_VIEWED_NOTIFICATION }],
  },
  async ({ event, step }) => {
    const data = event.data as EstimateViewedNotificationPayload

    const denied = await assertCompanyWritable(data.companyId)
    if (denied) return { sent: false, reason: 'demo_readonly' as const }

    const svc = requireServiceClient()

    const result = await step.run('send-view-notification-email', async () => {
      const { data: company } = await svc
        .from('companies')
        .select('notify_on_view, email, name')
        .eq('id', data.companyId)
        .single()

      // Re-check the gate here too — company prefs may have changed between
      // the request that emitted this event and this job actually running.
      if (!company?.notify_on_view || !company.email) {
        return { sent: false, reason: 'not_configured' as const }
      }

      const resendKey = await getIntegrationKey('resend')
      if (!resendKey) {
        return { sent: false, reason: 'no_resend_key' as const }
      }

      const { data: project } = await svc
        .from('projects')
        .select('name')
        .eq('id', data.projectId)
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
        return { sent: true as const }
      } catch (err) {
        console.warn(
          '[estimate-viewed-notification] send failed:',
          err instanceof Error ? err.message : String(err)
        )
        return { sent: false, reason: 'send_failed' as const }
      }
    })

    return result
  }
)
