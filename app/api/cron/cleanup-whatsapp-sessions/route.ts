import { NextResponse } from 'next/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { isAuthorizedCron } from '@/lib/auth/cron-auth'
import { notifyOps } from '@/lib/observability/ops-alert'

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
        try {
          await sendWhatsAppMessage(session.phone_number as string, {
            type: 'text',
            text: { body },
          })
          logOutboundMessage(supabase, {
            companyId: session.company_id as string,
            contactPhone: session.phone_number as string,
            body,
            msgType: 'text',
            status: 'sent',
          }).catch(() => undefined)
        } catch {
          // Non-fatal — still delete the session
        }

        await supabase.from('whatsapp_sessions').delete().eq('id', session.id)
      })
    )

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
