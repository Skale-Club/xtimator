import { requireServiceClient } from '@/lib/supabase/service'
import type { SignedContentSnapshot } from '@/lib/estimate/signed-snapshot'
import {
  buildSignatureEvidence,
  SIGNATURE_EVIDENCE_COLUMNS,
  verifySignatureIntegrity,
  type SignatureEvidence,
  type SignatureEvidenceRow,
} from '@/lib/estimate/signature-evidence'

/**
 * PDFPAR-02 (v4.23) — the ONE shared "latest signature" query, extracted out
 * of lib/queries/share.ts into its own dependency-free file.
 *
 * This is NOT a circular-import fix: share.ts's import of estimate.ts's types
 * (Estimate/EstimateSection/EstimateItem/EstimateWithSections) is a
 * `import type`, erased entirely at compile time, so it was never a runtime
 * cycle risk even with lib/queries/estimate.ts also calling this function.
 * The real reason for the extraction is dependency hygiene: this query only
 * ever needed `requireServiceClient` + `SignedContentSnapshot`, never
 * share.ts's much larger import graph (`createStorage`, `toMinorUnits`,
 * `getEstimatePhotos`, etc.) — pulling that whole graph into
 * lib/queries/estimate.ts just to reuse one small query would be the wrong
 * direction of coupling for a file every other query module already depends
 * on.
 *
 * Widened (PDFPAR-02) to also select `signer_name`/`signature_data` so every
 * consumer — share webview, workspace editor, both PDF templates via the
 * shared resolver — can render signer name, signed date, and the signature
 * image, not just a boolean "is signed" flag. Both columns are NOT NULL on
 * the estimate_signatures table, so any row that exists always carries them;
 * only a `null` row (no signature at all) should read as "no signature".
 */
export interface LatestSignedSnapshotRow {
  id: string
  signer_name: string | null
  signature_data: string | null
  signed_at: string
  signed_content: SignedContentSnapshot | null
  signed_total: number | null
}

/**
 * Shared query used by the share lookups (lib/queries/share.ts), the
 * workspace-editor loader (lib/queries/estimate.ts), AND the PDF resolver
 * (lib/pdf/render-estimate-pdf.ts) so the "latest signature" lookup never
 * drifts between any of the 4 document surfaces.
 */
export async function loadLatestSignedSnapshot(
  supabase: ReturnType<typeof requireServiceClient>,
  estimateId: string
): Promise<LatestSignedSnapshotRow | null> {
  const { data, error } = await supabase
    .from('estimate_signatures')
    .select('id, signer_name, signature_data, signed_at, signed_content, signed_total, snapshot_sha256')
    .eq('estimate_id', estimateId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Could not load the estimate signature', { cause: error })
  const snapshot = data?.signed_content as SignedContentSnapshot | null | undefined
  if (
    (data?.snapshot_sha256 && verifySignatureIntegrity(snapshot, data.snapshot_sha256) !== 'verified') ||
    (snapshot?.version === 3 && (!data?.snapshot_sha256 || !snapshot.identity ||
      data.signed_total == null || Number(data.signed_total) !== snapshot.total))
  ) {
    throw new Error('The estimate signature does not match its signed document')
  }
  return (data as LatestSignedSnapshotRow | null) ?? null
}

/**
 * The evidence of the latest signature (signer email, IP, device, stored hash),
 * verified against the stored snapshot. Deliberately separate from
 * loadLatestSignedSnapshot: that one feeds the PUBLIC share payload, which must
 * never carry the signer's IP or email. Callers: the owner's editor (read-only
 * action) and the PDF certificate page.
 */
export async function loadSignatureEvidence(
  supabase: ReturnType<typeof requireServiceClient>,
  estimateId: string,
  signatureId?: string,
): Promise<SignatureEvidence | null> {
  let query = supabase
    .from('estimate_signatures')
    .select(SIGNATURE_EVIDENCE_COLUMNS)
    .eq('estimate_id', estimateId)
  if (signatureId) query = query.eq('id', signatureId)
  const { data, error } = await query
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Could not load the estimate signature evidence', { cause: error })
  if (!data) return null
  return buildSignatureEvidence(data as unknown as SignatureEvidenceRow)
}
