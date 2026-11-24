import 'server-only'
import { findActiveWhatsAppSender } from '@/lib/whatsapp/account-registry'

/** Re-read authority at execution: queued payloads are never a lasting permission. */
export async function isWhatsAppJobAuthorized(
  companyId: string, ownerPhone: string, senderUserId?: string | null,
): Promise<boolean> {
  // Pre-migration events lack an authenticated actor snapshot. A current phone
  // match cannot prove that a queued command belongs to its present account.
  if (senderUserId === undefined) return false
  const current = await findActiveWhatsAppSender(ownerPhone, { throwOnError: true })
  return Boolean(current && current.companyId === companyId &&
    current.userId === senderUserId)
}
