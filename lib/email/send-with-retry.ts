// lib/email/send-with-retry.ts
//
// Owner-notification email send: one retry on a transient failure, and a log line with
// context on every failure. It never throws (a notification problem must never turn a
// client's successful answer into an error). Log context carries ids and the channel
// only, never an address, name or message text.
import 'server-only'

export interface SendEmailClient {
  emails: {
    send: (payload: { from: string; to: string; subject: string; text: string }) => Promise<{
      data?: unknown
      error?: { name?: string; message?: string; statusCode?: number | null } | null
    }>
  }
}

export interface SendRetryContext {
  /** e.g. 'estimate' | 'change_order' */
  resourceType: string
  resourceId: string
  /** e.g. 'owner_email' */
  channel: string
}

function isTransientStatus(status: number | null | undefined): boolean {
  if (status == null) return true // no HTTP status: network / unknown, worth one retry
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
}

function errorStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const e = err as { statusCode?: unknown; status?: unknown }
    if (typeof e.statusCode === 'number') return e.statusCode
    if (typeof e.status === 'number') return e.status
  }
  return null
}

export async function sendOwnerEmailWithRetry(
  client: SendEmailClient,
  payload: { from: string; to: string; subject: string; text: string },
  ctx: SendRetryContext,
  opts: { retryDelayMs?: number } = {},
): Promise<boolean> {
  const delay = opts.retryDelayMs ?? 750
  for (let attempt = 1; attempt <= 2; attempt++) {
    let transient = true
    let reason = 'unknown'
    try {
      const result = await client.emails.send(payload)
      if (!result?.error) return true
      const status = result.error.statusCode ?? null
      transient = isTransientStatus(status)
      reason = `${result.error.name ?? 'error'}${status != null ? ` (${status})` : ''}`
    } catch (err) {
      transient = isTransientStatus(errorStatus(err))
      reason = err instanceof Error ? err.name : 'thrown'
    }
    const willRetry = attempt === 1 && transient
    console.warn(
      `[notify] ${ctx.channel} failed for ${ctx.resourceType} ${ctx.resourceId} (attempt ${attempt}, ${reason})${willRetry ? ', retrying' : ''}`,
    )
    if (!willRetry) return false
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
  }
  return false
}
