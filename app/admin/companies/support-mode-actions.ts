'use server'

import { startSupportSession } from '@/lib/auth/support-mode'

export async function startSupportSessionAction(companyId: string): Promise<void> {
  await startSupportSession(companyId)
}
