import { cookies, headers } from 'next/headers'
import { resolveClientIp } from '@/lib/http/client-ip'
import { ESTIMATE_UNLOCK_COOKIE, hasValidUnlock } from '@/lib/auth/share-password'
import { isShareLinkExpired } from '@/lib/estimates/share-link'

/**
 * Access gate for the public (anonymous) WRITE paths on an estimate share link
 * (decline action, sign route). The public page already refuses an expired link
 * and a password-protected link without an unlock cookie; those paths must
 * enforce the same rules, otherwise anyone holding just the token could answer
 * an estimate the page would never show them.
 */

export type ShareAccess = 'ok' | 'expired' | 'locked'

export interface ShareAccessRow {
  share_token?: string | null
  share_expires_at?: string | null
  share_password_hash?: string | null
}

/**
 * Pure decision. `shareToken` is the token the unlock cookie was minted for
 * (the row's own share_token). Expiry wins over the password check, matching
 * the page.
 */
export function evaluateShareAccess(
  row: ShareAccessRow,
  shareToken: string,
  unlockCookieValue: string | undefined | null,
): ShareAccess {
  if (isShareLinkExpired(row.share_expires_at)) return 'expired'
  if (row.share_password_hash && !hasValidUnlock(unlockCookieValue, shareToken)) return 'locked'
  return 'ok'
}

/** Reads the unlock cookie of the current request; undefined outside a request scope. */
export async function readUnlockCookie(): Promise<string | undefined> {
  try {
    const store = await cookies()
    return store.get(ESTIMATE_UNLOCK_COOKIE)?.value
  } catch {
    return undefined
  }
}

/** Resolved client IP of the current request; null outside a request scope. */
export async function readClientIp(): Promise<string | null> {
  try {
    return resolveClientIp(await headers())
  } catch {
    return null
  }
}

/** Convenience: evaluate access using the current request's unlock cookie. */
export async function checkShareAccess(row: ShareAccessRow, shareToken: string): Promise<ShareAccess> {
  if (!row.share_password_hash) return evaluateShareAccess(row, shareToken, undefined)
  return evaluateShareAccess(row, shareToken, await readUnlockCookie())
}
