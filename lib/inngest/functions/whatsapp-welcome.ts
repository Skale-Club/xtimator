/**
 * Phase 98 — proactive WhatsApp welcome worker.
 *
 * Trigger: event `whatsapp/welcome.requested` (from lib/actions/settings.ts::updateProfile
 * when the owner adds/changes their profile phone — their WhatsApp line).
 *
 * Sends the approved welcome TEMPLATE. This is business-initiated (the owner saved
 * a number; they did NOT message us first), so a free-form message would be rejected
 * by Meta — only a pre-approved template can open the conversation. Once the owner
 * replies, the existing free-form handler takes over (estimates, images, audio, Q&A).
 *
 * Send-once: `claimWhatsAppWelcome` atomically flips welcome_sent_at NULL→now and
 * only the winner sends, so re-saving the same number never double-welcomes. The
 * flag is reset by `syncOwnerPhone` when the number actually changes.
 *
 * Best-effort: a non-WhatsApp number / unapproved template fails the send and is
 * logged — we return a status rather than throwing, so Inngest doesn't retry a
 * send that can never succeed.
 *
 * company_whatsapp / whatsapp_* are RLS deny-all — always use the service client.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/client'
import { claimWhatsAppWelcome } from '@/lib/whatsapp/send-welcome'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import {
  EVENT_WHATSAPP_WELCOME,
  type WhatsAppWelcomePayload,
} from '@/lib/inngest/events'

/**
 * ⚠️ PROVISIONAL — must match the template authored + APPROVED in Meta WhatsApp
 * Manager under Xtimator's WABA (category MARKETING). The approved body is fully
 * static (no {{n}} variables), so no parameters are sent. WELCOME_PREVIEW is only
 * the inbox thread preview, not the delivered content (Meta owns that).
 */
const WELCOME_TEMPLATE_NAME = 'xtimator_welcome'
const WELCOME_TEMPLATE_LANG = 'en_US'
const WELCOME_PREVIEW =
  '👋 Welcome to Xtimator — reply here to build estimates by voice, photo, or text.'

export const whatsAppWelcomeJob = inngest.createFunction(
  {
    id: 'whatsapp-welcome',
    idempotency: 'event.data.companyId',
    triggers: [{ event: EVENT_WHATSAPP_WELCOME }],
  },
  async ({ event, step }) => {
    const { companyId, toPhone } = event.data as WhatsAppWelcomePayload
    if (!toPhone) return { skipped: 'no_phone' }

    // Atomically claim the welcome slot — only the winner sends.
    const claimed = await step.run('claim-welcome', async () => {
      const svc = requireServiceClient()
      return claimWhatsAppWelcome(svc, companyId)
    })
    if (!claimed) return { skipped: 'already_welcomed', companyId }

    try {
      await step.run('send-welcome-template', async () => {
        await sendWhatsAppTemplate(toPhone, {
          name: WELCOME_TEMPLATE_NAME,
          languageCode: WELCOME_TEMPLATE_LANG,
        })
      })
    } catch (e) {
      console.warn(
        '[whatsapp-welcome] send failed:',
        e instanceof Error ? e.message : String(e),
      )
      return { ok: false, error: 'send_failed', companyId }
    }

    await step.run('log-outbound', async () => {
      const svc = requireServiceClient()
      await logOutboundMessage(svc, {
        companyId,
        contactPhone: toPhone,
        body: WELCOME_PREVIEW,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
    })

    return { ok: true, companyId }
  },
)
