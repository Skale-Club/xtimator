/**
 * lib/notifications/web-push.ts
 *
 * Server-only. Sends Web Push notifications to a user's devices.
 *
 * 260928: the "phase 2" the NOTIF-09 scaffold deferred. The first use is the
 * estimate-ready notice: a contractor starts a generation, locks the phone, and
 * the phone buzzes when the estimate is done, even with the app closed.
 *
 * Configuration (runtime env, never committed):
 *   VAPID_PUBLIC_KEY   the application server key browsers subscribe with
 *   VAPID_PRIVATE_KEY  its private half, used to sign each push
 *   VAPID_SUBJECT      optional contact, `mailto:` or `https:` (default: site URL)
 * Generate a pair once with `npx web-push generate-vapid-keys`. Without both
 * keys every send is a no-op and the subscribe endpoint reports push as
 * unavailable, so the app never asks for a permission it cannot use.
 *
 * Best-effort like every notification channel: never throws. A device the
 * push service reports as gone (404/410) is removed from the user's list.
 */
import webpush from 'web-push'
import { getUserPreferences, upsertUserPreferences } from './preferences'
import {
  parsePushDevices,
  removePushDevices,
  serializePushDevices,
  type PushLanguage,
} from './push-devices'

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  const subject =
    process.env.VAPID_SUBJECT?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://xtimator.com'
  return { publicKey, privateKey, subject }
}

/** The public key for browsers, or null when push is not configured. */
export function getVapidPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null
}

export interface PushMessage {
  title: string
  body: string
  /** Opened when the notification is tapped. Same-origin path. */
  url: string
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string
}

export interface PushSendResult {
  sent: number
  removed: number
  skipped?: 'not_configured' | 'no_devices'
}

/**
 * Sends one message to every device of `userId`, in each device's language.
 * `build` is called once per language actually present.
 */
export async function sendPushToUser(
  userId: string,
  build: (lang: PushLanguage) => PushMessage
): Promise<PushSendResult> {
  try {
    const config = getVapidConfig()
    if (!config) return { sent: 0, removed: 0, skipped: 'not_configured' }

    const prefs = await getUserPreferences(userId)
    const devices = parsePushDevices(prefs?.push_subscription)
    if (devices.length === 0) return { sent: 0, removed: 0, skipped: 'no_devices' }

    const messages = new Map<PushLanguage, string>()
    const gone: string[] = []
    let sent = 0

    await Promise.all(
      devices.map(async (device) => {
        const lang = device.lang ?? 'en'
        let payload = messages.get(lang)
        if (!payload) {
          payload = JSON.stringify(build(lang))
          messages.set(lang, payload)
        }
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: device.keys },
            payload,
            {
              vapidDetails: {
                subject: config.subject,
                publicKey: config.publicKey,
                privateKey: config.privateKey,
              },
              // An estimate notice older than a day is noise, not news.
              TTL: 24 * 60 * 60,
              urgency: 'high',
            }
          )
          sent += 1
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) gone.push(device.endpoint)
          else console.warn('[web-push] send failed:', status ?? (err instanceof Error ? err.message : err))
        }
      })
    )

    if (gone.length > 0) {
      await upsertUserPreferences(userId, {
        push_subscription: serializePushDevices(removePushDevices(devices, gone)),
      })
    }
    return { sent, removed: gone.length }
  } catch (err) {
    console.warn('[web-push] unexpected failure:', err instanceof Error ? err.message : err)
    return { sent: 0, removed: 0 }
  }
}
