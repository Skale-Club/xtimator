import { requireServiceClient } from '@/lib/supabase/service'
import type { SignedContentSnapshot } from '@/lib/estimate/signed-snapshot'

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
  const { data } = await supabase
    .from('estimate_signatures')
    .select('id, signer_name, signature_data, signed_at, signed_content, signed_total')
    .eq('estimate_id', estimateId)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as LatestSignedSnapshotRow | null) ?? null
}
