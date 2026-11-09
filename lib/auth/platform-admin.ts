import 'server-only'
import { cache } from 'react'
import { getAdminContext } from '@/lib/auth/admin-context'

/**
 * True when the signed-in user is a platform admin (a row in `platform_admins`).
 * The same check the app layout uses for `isAdmin`, memoized per request.
 * Server-only: never derive admin status on the client. Fails closed.
 */
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  try {
    return (await getAdminContext()) !== null
  } catch {
    return false
  }
})
