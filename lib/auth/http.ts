import 'server-only'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { getDemoAppOrigin } from '@/lib/demo/config'

export function sameAuthOrigin(request: Request, allowDemo = false): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const protocol = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  if (origin !== `${protocol}://${host}`) return false
  if (origin === new URL(getCanonicalBaseUrl()).origin) return true
  if (allowDemo && origin === getDemoAppOrigin()?.origin) return true
  if (process.env.NODE_ENV !== 'production') {
    return ['localhost', '127.0.0.1'].includes(url.hostname) && origin === url.origin
  }
  return false
}

export function safeInviteDestination(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || value.includes('\\')) return null
  try {
    const url = new URL(value, 'https://xtimator.invalid')
    return url.origin === 'https://xtimator.invalid' && url.pathname === '/invite/accept' ? `${url.pathname}${url.search}` : null
  } catch { return null }
}

export const noStore = { 'Cache-Control': 'no-store, max-age=0', Vary: 'Cookie' }
