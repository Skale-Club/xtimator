import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueSignatureReceipt } from '@/lib/estimate/signature-receipt'

/** A successful response describes the stored signature, including lost-reply
 * retries. The browser must never substitute a new drawing or its own clock. */
export async function committedSigningResult(
  supabase: SupabaseClient,
  kind: 'estimate' | 'change_order',
  documentId: string,
  companyId: string,
  alreadySigned = false,
) {
  const table = kind === 'estimate' ? 'estimate_signatures' : 'change_order_signatures'
  const fk = kind === 'estimate' ? 'estimate_id' : 'change_order_id'
  const { data, error } = await supabase.from(table)
    .select('signer_name, signature_data, signed_at, signed_content')
    .eq(fk, documentId).eq('company_id', companyId)
    .order('signed_at', { ascending: false }).limit(1).maybeSingle()
  if (error || !data?.signer_name || !data?.signature_data || !data?.signed_at) {
    throw new Error('Committed signature evidence is temporarily unavailable')
  }
  // The outbox INSERT is atomic with signing. This call only wakes delivery;
  // a periodic drain recovers from lost wakeups and post-commit interruption.
  try {
    await enqueueSignatureReceipt({ kind, documentId, companyId })
  } catch {
    console.warn('[signature] receipt wakeup deferred')
  }
  return {
    ...(kind === 'estimate' ? { success: true } : { ok: true }),
    ...(alreadySigned ? { alreadySigned: true } : {}),
    signature: {
      signerName: data.signer_name as string,
      signedAt: data.signed_at as string,
      signatureDataUrl: data.signature_data as string,
    },
    ...(kind === 'change_order' ? { signedContract: data.signed_content?.contract ?? null } : {}),
  }
}
