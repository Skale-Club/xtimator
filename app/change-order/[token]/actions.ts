'use server'

/**
 * Client-side (anonymous) actions on a change order's public page.
 * CONTRACT STUB: the signature is final; the body is implemented by the
 * database/server work package. Accepting always goes through the sign route
 * (POST /api/change-orders/[id]/sign) so a signature is captured; this action
 * only declines.
 */
export async function declineChangeOrder(token: string): Promise<{ success: boolean; error?: string }> {
  void token
  return { success: false, error: 'not_implemented' }
}
