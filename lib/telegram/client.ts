import 'server-only'
import { getTelegramConfig } from '@/lib/platform-config'

/**
 * Server-only outbound Telegram client for the platform-owner ops-alert channel.
 *
 * Mirrors lib/whatsapp/client.ts: a thin typed wrapper around the provider API
 * that reads credentials from the encrypted platform-config and throws on a
 * non-2xx response with the response body attached.
 *
 * Dormant-until-configured: when no bot token OR chat_id is set, getTelegramConfig()
 * returns null and this throws a clear '[Telegram] not configured' error — nothing
 * is sent. The bot token is NEVER logged or interpolated into any error message.
 *
 * Never import from a client component.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const config = await getTelegramConfig()
  if (!config) {
    throw new Error(
      '[Telegram] not configured — set a bot token and chat_id in /admin/integrations'
    )
  }
  const res = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'HTML' }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[Telegram] sendMessage failed ${res.status}: ${body}`)
  }
}
