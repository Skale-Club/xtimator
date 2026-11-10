import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getAuthClaims } from '@/lib/queries/auth'
import { requireServiceClient } from '@/lib/supabase/service'
import { loadSigningKey } from '@/lib/auth/share-password'

/**
 * Owner-visit detection for the public estimate share page.
 *
 * The business owner (or a teammate) opening their own share link must not
 * count as a client view: it would stamp viewed_at, fire the "estimate viewed"
 * notification and pollute Insights. Two layers, cheapest first:
 *   1. A signed `xt_owner_device` cookie, set once by the workspace for every
 *      company the user belongs to. It survives logging out and works in the
 *      browser the owner previews from, even when the session is gone.
 *   2. The live session: a signed-in user who is a member of the estimate's
 *      company.
 * The cookie only ever EXCLUDES a visit from tracking, so forging one buys an
 * attacker nothing beyond hiding their own view; it is still HMAC-signed so
 * a client cannot opt out of tracking for a company by guessing ids.
 */

export const OWNER_DEVICE_COOKIE = 'xt_owner_device'
export const OWNER_DEVICE_MAX_COMPANIES = 10
export const OWNER_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface OwnerDevicePayload {
  c: string[]
  t: number
}

function sign(payloadB64: string): string {
  return createHmac('sha256', loadSigningKey()).update(payloadB64).digest('hex')
}

/** `payloadB64.signature` for the given company ids (deduped, capped at 10). */
export function signOwnerDeviceCookie(companyIds: string[], now: number = Date.now()): string {
  const unique = Array.from(new Set(companyIds.filter((id) => typeof id === 'string' && id)))
  const payload: OwnerDevicePayload = { c: unique.slice(-OWNER_DEVICE_MAX_COMPANIES), t: now }
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Company ids inside a valid cookie; [] for anything tampered, malformed or missing. */
export function readOwnerDeviceCompanyIds(rawValue: string | undefined | null): string[] {
  try {
    if (!rawValue) return []
    const parts = rawValue.split('.')
    if (parts.length !== 2) return []
    const [payloadB64, receivedSig] = parts
    const expectedBuf = Buffer.from(sign(payloadB64))
    const receivedBuf = Buffer.from(receivedSig)
    // timingSafeEqual throws on a length mismatch, so guard first.
    if (expectedBuf.length !== receivedBuf.length) return []
    if (!timingSafeEqual(expectedBuf, receivedBuf)) return []
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Partial<OwnerDevicePayload>
    if (!parsed || !Array.isArray(parsed.c)) return []
    return parsed.c
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, OWNER_DEVICE_MAX_COMPANIES)
  } catch {
    return []
  }
}

/**
 * True when the current request is the estimate owner's own visit. Never
 * throws: if detection fails, the visit is counted as a normal client view.
 */
export async function isOwnerVisit(companyId: string): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const marked = readOwnerDeviceCompanyIds(cookieStore.get(OWNER_DEVICE_COOKIE)?.value)
    if (marked.includes(companyId)) return true

    const claims = await getAuthClaims()
    const userId = (claims?.sub as string | undefined) ?? null
    if (!userId) return false

    const { data } = await requireServiceClient()
      .from('company_members')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .limit(1)
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
