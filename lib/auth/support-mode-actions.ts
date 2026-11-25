'use server'

import { endSupportSession } from '@/lib/auth/support-mode'

/**
 * Server Action bound by the Support Mode banner's "Exit view" form.
 * lib/auth/support-mode.ts is a server-only module, not a 'use server' file, so its
 * functions are not Server References: passing endSupportSession straight to a
 * <form action> made the support layout fail to render ("Functions cannot be passed
 * directly to Client Components"). It clears only the caller's own cookie and
 * redirects to /admin/companies.
 */
export async function endSupportSessionAction(): Promise<void> {
  await endSupportSession()
}
