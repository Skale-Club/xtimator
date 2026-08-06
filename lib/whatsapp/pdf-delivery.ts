/**
 * Phase 53: PDF Attachment Delivery
 * Generates an estimate PDF via the shared renderEstimatePdf() resolver,
 * uploads it to Supabase Storage (pdfs bucket), and returns a 24-hour
 * signed URL for Meta Cloud API document delivery.
 *
 * CRITICAL: Do NOT call /api/estimates/[id]/pdf internally — that route
 * uses createClient() which requires auth cookies unavailable in webhook
 * context. Instead, call the shared renderEstimatePdf() resolver
 * (lib/pdf/render-estimate-pdf.ts), which itself calls renderToBuffer +
 * getEstimateWithContext directly (Phase 41 pattern, centralized in Phase 182).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'
import { serverStorage } from '@/lib/storage/server'

/**
 * Generate a PDF buffer for the given estimate, upload it to the `pdfs`
 * Supabase Storage bucket, and return a 24-hour signed URL and filename.
 *
 * @param estimateId - UUID of the estimate to render
 * @param companyId  - Company ID for storage path scoping
 * @param supabase   - Service-role SupabaseClient (passed from handleSend — do NOT create internally)
 * @param clientName - Client name for filename generation (may be null)
 * @returns { signedUrl: string, filename: string }
 * @throws Error if generation, upload, or signing fails — caller should catch and fall back to share_link
 */
export async function generateAndUploadEstimatePDF(
  estimateId: string,
  companyId: string,
  supabase: SupabaseClient,
  clientName: string | null,
): Promise<{ signedUrl: string; filename: string }> {
  // PDFPAR-04: template + signed-snapshot (TRUST-01) + preparedBy + attached
  // photos now resolve through the SAME shared in-process renderer as the
  // download route and the email send route — see this module's header
  // comment for why this must stay a plain function call, never an internal
  // HTTP fetch to /api/estimates/[id]/pdf.
  const rendered = await renderEstimatePdf(estimateId, supabase)
  if (!rendered) {
    throw new Error('Estimate not found for PDF generation')
  }

  // Upload to pdfs bucket (service role bypasses RLS).
  //    Path: {companyId}/whatsapp-pdf/{estimateId}-{timestamp}.pdf
  //    Timestamp ensures Meta URL cache uniqueness (Meta caches by URL string ~10min)
  // Phase 188 (PROV-01): server-wide provider selection; Supabase mode keeps
  // this caller-supplied client and its RLS scoping.
  const storage = serverStorage(supabase)
  const storagePath = `${companyId}/whatsapp-pdf/${estimateId}-${Date.now()}.pdf`

  try {
    await storage.upload('pdfs', storagePath, rendered.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    throw new Error(`PDF upload failed: ${message}`)
  }

  // Create 24-hour signed URL (86400 seconds) — STORAGE-04: explicit expiry.
  // This is a DIFFERENT TTL decision than the resolver's internal 3600s
  // per-photo TTL (Pitfall 4) — this one is for the delivered PDF document
  // itself, which must survive Meta's WhatsApp delivery queue.
  let signedUrl: string
  try {
    signedUrl = await storage.getSignedUrl('pdfs', storagePath, 86400)
  } catch {
    throw new Error('Failed to create signed URL for PDF')
  }

  const filename = buildPdfFilename(clientName)
  return { signedUrl, filename }
}

/**
 * Build a descriptive PDF filename for WhatsApp document delivery.
 * Format: Estimate-ClientName-YYYY-MM-DD.pdf
 * Sanitizes client name: strips non-alphanumeric/space/hyphen chars,
 * collapses whitespace to hyphens, truncates to 30 chars.
 */
export function buildPdfFilename(clientName: string | null, date = new Date()): string {
  const datePart = date.toISOString().slice(0, 10) // "2026-05-11"
  if (!clientName) return `Estimate-${datePart}.pdf`
  const safeName = clientName
    .replace(/\s/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 30)
  return `Estimate-${safeName}-${datePart}.pdf`
}
