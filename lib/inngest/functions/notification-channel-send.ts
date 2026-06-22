/**
 * Phase 104 (NOTIF-03 / NOTIF-04 / NOTIF-07) — async owner-notification channel send.
 *
 * Triggers: events `notification/whatsapp.send` + `notification/sms.send` (from
 * lib/notifications/dispatch.ts). Branches on `data.channel`:
 *   - 'whatsapp' → sendWhatsAppTemplate(to, { name, languageCode, bodyVariables })
 *   - 'sms'      → sendSms(to, body)
 *
 * Best-effort posture (mirrors the email digest worker): a failing send is caught
 * + logged and the function returns a status object rather than throwing — Inngest
 * should NOT retry a send that can never succeed (bad number, unconfigured provider).
 * This runs OFF the request path, so a throw here can never block the in-app insert
 * or the other channel (the dispatch branch already ran best-effort).
 *
 * Secrets: WhatsApp/Twilio creds resolve inside sendWhatsAppTemplate / sendSms via
 * the platform config — none are passed through the event payload.
 */
import { inngest } from '@/lib/inngest/client'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/client'
import { sendSms } from '@/lib/sms/client'
import {
  EVENT_NOTIFICATION_WHATSAPP_SEND,
  EVENT_NOTIFICATION_SMS_SEND,
  type NotificationChannelSendPayload,
} from '@/lib/inngest/events'

export const notificationChannelSend = inngest.createFunction(
  {
    id: 'notification-channel-send',
    triggers: [
      { event: EVENT_NOTIFICATION_WHATSAPP_SEND },
      { event: EVENT_NOTIFICATION_SMS_SEND },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as NotificationChannelSendPayload

    if (data.channel === 'whatsapp') {
      try {
        await step.run('send-whatsapp-template', async () => {
          await sendWhatsAppTemplate(data.to, {
            name: data.templateName,
            languageCode: data.languageCode,
            bodyVariables: data.variables,
          })
        })
        return { ok: true, channel: 'whatsapp' as const }
      } catch (e) {
        console.warn(
          '[notification-channel-send] whatsapp send failed:',
          e instanceof Error ? e.message : String(e),
        )
        return { ok: false, channel: 'whatsapp' as const, error: 'send_failed' }
      }
    }

    if (data.channel === 'sms') {
      const result = await step.run('send-sms', async () => {
        // sendSms is itself never-throw → returns { ok, sid?, error? }.
        return sendSms(data.to, data.body)
      })
      if (!result.ok) {
        console.warn(
          '[notification-channel-send] sms send failed:',
          result.error ?? 'unknown',
        )
      }
      return { ok: result.ok, channel: 'sms' as const, sid: result.sid }
    }

    return { ok: false, error: 'unknown_channel' }
  },
)
