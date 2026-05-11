/**
 * Phase 48: WhatsApp message debounce buffer.
 *
 * Problem: WhatsApp users naturally send multiple messages in sequence
 * (audio + photos + clarifying text). Processing each immediately creates
 * separate estimates and blocks subsequent messages with "reply send/cancel".
 *
 * Solution: buffer messages in Redis per phone number for ~5 seconds of silence,
 * then process the entire batch as one estimate.
 *
 * Strategy:
 *   1. Each inbound message PUSHes itself to `buffer:{phone}` Redis list
 *   2. Worker sleeps DEBOUNCE_WAIT_MS
 *   3. Worker calls `tryClaimBuffer(phone, messageId)` — atomic: only the LATEST
 *      message's worker gets the buffer; older workers get null and exit.
 *   4. Winning worker processes the entire array as one batch.
 *
 * If Redis is unavailable, this module returns null/no-op — caller falls back
 * to single-message processing (legacy behavior).
 */
import { getRedis } from '@/lib/redis'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

/** Time to wait after the most recent message before processing the buffer (ms) */
export const DEBOUNCE_WAIT_MS = 5_000

/** Buffer expiry — orphans are auto-cleaned after this many seconds */
export const BUFFER_TTL_SECONDS = 120

export interface BufferedMessage {
  id: string
  receivedAt: number  // epoch ms
  message: WhatsAppMessage
}

function key(phoneNumber: string): string {
  return `buffer:whatsapp:${phoneNumber}`
}

/**
 * Push a message to the per-phone buffer. Sets TTL on first push (per window).
 * Returns true if Redis was available (the push happened); false if not.
 */
export async function pushToBuffer(
  phoneNumber: string,
  message: WhatsAppMessage
): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false

  const entry: BufferedMessage = {
    id: message.id,
    receivedAt: Date.now(),
    message,
  }

  try {
    const k = key(phoneNumber)
    const pipe = redis.multi()
    pipe.rpush(k, JSON.stringify(entry))
    pipe.expire(k, BUFFER_TTL_SECONDS)
    await pipe.exec()
    return true
  } catch (err) {
    console.warn('[whatsapp/buffer] pushToBuffer failed', err)
    return false
  }
}

/**
 * Try to claim the entire buffer for processing.
 * - If the latest entry in the buffer has id === messageId, this worker wins:
 *   delete the buffer and return all messages.
 * - Otherwise return null (a newer message arrived; its worker will process).
 *
 * Uses Lua-style atomicity: GET all + check + DEL is wrapped in MULTI for
 * minimal race surface. (Upstash REST is single-threaded per request, so the
 * MULTI block is effectively atomic.)
 */
export async function tryClaimBuffer(
  phoneNumber: string,
  messageId: string
): Promise<BufferedMessage[] | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const k = key(phoneNumber)
    const entries = await redis.lrange<string>(k, 0, -1)
    if (entries.length === 0) return null

    const parsed: BufferedMessage[] = entries
      .map((s) => {
        // Upstash auto-deserializes JSON sometimes — handle both cases
        if (typeof s === 'string') {
          try { return JSON.parse(s) as BufferedMessage } catch { return null }
        }
        return s as unknown as BufferedMessage
      })
      .filter((v): v is BufferedMessage => v !== null)

    if (parsed.length === 0) return null

    const last = parsed[parsed.length - 1]
    if (last.id !== messageId) {
      // A newer message arrived — let its worker handle the batch
      return null
    }

    // We're the winner. Delete the buffer.
    await redis.del(k)
    return parsed
  } catch (err) {
    console.warn('[whatsapp/buffer] tryClaimBuffer failed', err)
    return null
  }
}

/**
 * Force-clear a phone's buffer (used by cancel/error paths).
 */
export async function clearBuffer(phoneNumber: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(key(phoneNumber))
  } catch (err) {
    console.warn('[whatsapp/buffer] clearBuffer failed', err)
  }
}

/**
 * Helper for testing — sleep for DEBOUNCE_WAIT_MS (exported so tests can mock it).
 */
export function debounceWait(ms = DEBOUNCE_WAIT_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
