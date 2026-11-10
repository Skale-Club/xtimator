import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getOwnerLastInboundAt, sendOwnerWhatsApp } from '@/lib/whatsapp/owner-send'
import { resolveOwnerLanguage } from '@/lib/whatsapp/owner-language'
import { getOwnerUpdateTemplate } from '@/lib/notifications/whatsapp-registry'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { notifyOps } from '@/lib/observability/ops-alert'
import { recordCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { assertCompanyWritable } from '@/lib/demo/guard'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = requireServiceClient()

    // Find expired awaiting_confirm sessions
    const { data: expiredSessions, error } = await supabase
      .from('whatsapp_sessions')
      .select('id, phone_number, draft_project_id, company_id')
      .eq('state', 'awaiting_confirm')
      .lt('expires_at', new Date().toISOString())

    if (error) {
      void notifyOps({
        kind: 'cron_failed',
        title: 'Cron cleanup-whatsapp-sessions failed',
        message: error.message,
        severity: 'error',
        dedupeKey: 'cron:cleanup-whatsapp-sessions',
        suppressWindowSec: 3600,
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const sessions = expiredSessions ?? []

    // Notify each owner and delete their session
    await Promise.allSettled(
      sessions.map(async (session) => {
        const body =
          '⏰ Your estimate confirmation window has expired.\n\nSend a new audio, text, or photo to create a fresh estimate.'
        const demoBlocked = await assertCompanyWritable(session.company_id as string)
        if (!demoBlocked) {
          try {
            // Business-initiated: free-form only inside the owner's 24h window,
            // otherwise (or on Meta 131047) the generic owner_update template.
            const companyId = session.company_id as string
            const ownerPhone = session.phone_number as string
            const language = await resolveOwnerLanguage(supabase, companyId)
            const sent = await sendOwnerWhatsApp({
              to: ownerPhone,
              companyId,
              text: body,
              template: getOwnerUpdateTemplate(
                { title: 'Estimate confirmation expired', body: 'Send a new audio, text or photo to create a fresh estimate.' },
                language,
              ),
              meta: { companyId, purpose: 'owner_notification', billable: true },
              lastInboundAt: await getOwnerLastInboundAt(supabase, companyId, ownerPhone),
            })
            if (!sent.ok) throw new Error(sent.message ?? sent.error)
            const wamid = sent.wamid
            logOutboundMessage(supabase, {
              companyId: session.company_id as string,
              contactPhone: session.phone_number as string,
              body,
              msgType: 'text',
              waMessageId: wamid,
              status: 'sent',
            }).catch(() => undefined)
          } catch {
            // The notification is best-effort; maintenance still deletes the session.
          }
        }

        // Session retention is machine-authorized maintenance; only the
        // customer-facing notification above is a tenant product effect.
        await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
      })
    )

    // Deadman: record that this job actually ran to completion. Success path
    // only — a failed run must leave the heartbeat stale so the external probe
    // can still see the silence. Awaited (not fire-and-forget) so the write
    // isn't cut off when the serverless invocation ends; it never throws.
    await recordCronHeartbeat('cleanup-whatsapp-sessions', {
      cleaned: sessions.length,
    })

    return NextResponse.json({ cleaned: sessions.length }, { status: 200 })
  } catch (err) {
    void notifyOps({
      kind: 'cron_failed',
      title: 'Cron cleanup-whatsapp-sessions failed',
      message: (err as Error).message ?? 'Cleanup failed',
      severity: 'error',
      dedupeKey: 'cron:cleanup-whatsapp-sessions',
      suppressWindowSec: 3600,
    })
    return NextResponse.json(
      { error: (err as Error).message ?? 'Cleanup failed' },
      { status: 500 }
    )
  }
}
