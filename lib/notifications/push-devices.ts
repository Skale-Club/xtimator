/**
 * lib/notifications/push-devices.ts
 *
 * The Web Push devices of one user, as stored in
 * `notification_preferences.push_subscription` (JSONB).
 *
 * 260928: that column held ONE subscription (Phase 77 NOTIF-09 scaffold), so
 * enabling push on a laptop silently unsubscribed the phone. It now holds a
 * small list of devices: `{ v: 2, devices: [...] }`. No migration: same column,
 * new shape, and every older shape still reads cleanly:
 *   - `null` / `{}` (the scaffold stored `{}` when no VAPID key existed) → none;
 *   - a bare PushSubscription JSON `{ endpoint, keys }` → one device.
 *
 * Pure module: parsing, merging and serializing only. No I/O.
 */

export type PushLanguage = 'en' | 'pt' | 'es'

export interface PushDevice {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /** App language on that device when it subscribed: the notification's language. */
  lang?: PushLanguage
  /** ISO time the device subscribed (or last re-subscribed). */
  addedAt?: string
}

/** A user rarely has more than a phone and a laptop; the oldest falls off past this. */
export const MAX_PUSH_DEVICES = 5

function isLanguage(v: unknown): v is PushLanguage {
  return v === 'en' || v === 'pt' || v === 'es'
}

function toDevice(v: unknown): PushDevice | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const keys = o.keys as Record<string, unknown> | undefined
  if (typeof o.endpoint !== 'string' || !o.endpoint.startsWith('https://')) return null
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null
  return {
    endpoint: o.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    ...(isLanguage(o.lang) ? { lang: o.lang } : {}),
    ...(typeof o.addedAt === 'string' ? { addedAt: o.addedAt } : {}),
  }
}

/** Every stored device, whatever shape the column holds. Never throws. */
export function parsePushDevices(raw: unknown): PushDevice[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  if (Array.isArray(o.devices)) {
    return o.devices.map(toDevice).filter((d): d is PushDevice => d !== null)
  }
  const single = toDevice(raw)
  return single ? [single] : []
}

/** Adds (or refreshes) a device. Same endpoint replaces; newest last; capped. */
export function addPushDevice(devices: PushDevice[], device: PushDevice): PushDevice[] {
  const rest = devices.filter((d) => d.endpoint !== device.endpoint)
  return [...rest, device].slice(-MAX_PUSH_DEVICES)
}

export function removePushDevices(devices: PushDevice[], endpoints: Iterable<string>): PushDevice[] {
  const drop = new Set(endpoints)
  return devices.filter((d) => !drop.has(d.endpoint))
}

/** Column value for a device list: `null` when empty, so `push_enabled` reads false. */
export function serializePushDevices(devices: PushDevice[]): { v: 2; devices: PushDevice[] } | null {
  return devices.length > 0 ? { v: 2, devices } : null
}

/** Validates a device coming from the browser (PushSubscription.toJSON() + lang). */
export function deviceFromClient(subscription: unknown, lang: unknown, nowIso: string): PushDevice | null {
  const device = toDevice(subscription)
  if (!device) return null
  return { ...device, ...(isLanguage(lang) ? { lang } : {}), addedAt: nowIso }
}
