/**
 * Phase 53: PDF Attachment Delivery
 * Generates an estimate PDF, uploads to Supabase Storage (pdfs bucket),
 * and returns a 24-hour signed URL for Meta Cloud API document delivery.
 *
 * CRITICAL: Do NOT call /api/estimates/[id]/pdf internally — that route
 * uses createClient() which requires auth cookies unavailable in webhook context.
 * Instead, call renderToBuffer + getEstimateWithContext directly (Phase 41 pattern).
 */
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'

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
  // 1. Fetch estimate context (mirrors app/api/estimates/[id]/pdf/route.ts)
  const result = await getEstimateWithContext(supabase, estimateId)
  if (!result || !result.company) {
    throw new Error('Estimate not found for PDF generation')
  }

  const { estimate, project, company } = result
  const projectName = project?.name ?? 'Untitled Project'
  const clientRaw = project?.client
  const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

  // 2. Render PDF buffer
  const element = createElement(EstimatePDF, {
    estimate,
    company,
    client,
    projectName,
    projectType: project?.project_type ?? null,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  // 3. Upload to pdfs bucket (service role bypasses RLS)
  //    Path: {companyId}/whatsapp-pdf/{estimateId}-{timestamp}.pdf
  //    Timestamp ensures Meta URL cache uniqueness (Meta caches by URL string ~10min)
  const storagePath = `${companyId}/whatsapp-pdf/${estimateId}-${Date.now()}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(storagePath, Buffer.from(pdfBuffer), { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    throw new Error(`PDF upload failed: ${uploadError.message}`)
  }

  // 4. Create 24-hour signed URL (86400 seconds)
  const { data: signedData } = await supabase.storage
    .from('pdfs')
    .createSignedUrl(storagePath, 86400)

  if (!signedData?.signedUrl) {
    throw new Error('Failed to create signed URL for PDF')
  }

  const filename = buildPdfFilename(clientName)
  return { signedUrl: signedData.signedUrl, filename }
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
