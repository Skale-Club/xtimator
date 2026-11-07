import { cookies } from 'next/headers'
import { TWA_COOKIE_NAME, isTwaCookieValue } from '@/lib/pwa/twa-signal'

export {
  TWA_COOKIE_NAME,
  TWA_OUT_OF_CREDITS_COPY,
  TWA_PURCHASE_BLOCKED_BODY,
  isTwaCookieValue,
  hasTwaLaunchSignal,
} from '@/lib/pwa/twa-signal'

/**
 * Server helper: is this request from the Android TWA (sticky `xt_twa` cookie
 * set by proxy.ts)? Never throws; outside a request scope it is false.
 */
export async function isTwaRequest(): Promise<boolean> {
  try {
    const store = await cookies()
    return isTwaCookieValue(store.get(TWA_COOKIE_NAME)?.value)
  } catch {
    return false
  }
}
