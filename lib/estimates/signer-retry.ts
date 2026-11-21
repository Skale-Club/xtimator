// lib/estimates/signer-retry.ts
//
// Idempotent sign retry. If a sign request committed but the client never got the reply, the
// client sends the same signature again and the document is already accepted. That is a
// success for the same signer, and still a 409 for anyone else.
import type { SupabaseClient } from '@supabase/supabase-js'

export type SignatureTable = 'estimate_signatures' | 'change_order_signatures'

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * True when the latest signature row of this document was made by the same signer: same
 * name, and the same email when both the stored row and the request carry one.
 */
export async function isSameSignerRetry(
  supabase: Pick<SupabaseClient, 'from'>,
  table: SignatureTable,
  documentId: string,
  signerName: string,
  signerEmail: string | null,
): Promise<boolean> {
  try {
    const fk = table === 'estimate_signatures' ? 'estimate_id' : 'change_order_id'
    const { data, error } = await supabase
      .from(table)
      .select('signer_name, signer_email')
      .eq(fk, documentId)
      .order('signed_at', { ascending: false })
      .limit(1)
    if (error || !data || data.length === 0) return false
    const row = data[0] as { signer_name: string | null; signer_email: string | null }
    if (norm(row.signer_name) !== norm(signerName)) return false
    if (row.signer_email && signerEmail && norm(row.signer_email) !== norm(signerEmail)) return false
    return true
  } catch {
    return false
  }
}
