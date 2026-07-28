// lib/pdf/render-estimate-pdf.ts
//
// PDFPAR-04 — the ONE shared in-process PDF renderer for all 3 call sites
// (download route, email send route, WhatsApp document delivery). Extracted
// verbatim from app/api/estimates/[id]/pdf/route.ts's already-correct
// pattern (template registry + signed-snapshot overlay [TRUST-01] +
// preparedBy + pre-resolved photo signed URLs).
//
// CRITICAL (mirrors lib/whatsapp/pdf-delivery.ts:5-8): this is a PLAIN
// function taking an injected SupabaseClient. NEVER call this via an
// internal HTTP fetch to /api/estimates/[id]/pdf — the Inngest/webhook
// execution context (lib/inngest/functions/whatsapp-process.ts, via
// requireServiceClient()) has no auth cookies, so an internal fetch would
// pass locally/in-browser and silently 401 only in production webhooks.
//
// Split into two functions so the download route's ETag 304 short-circuit
// stays cheap: resolveEstimatePdfContext() does only the DB reads needed to
// compute a cache key (estimate + signature-snapshot lookup + template
// resolution — no photos, no preparedBy, no render). renderEstimatePdf()
// does the full, expensive render and accepts an optional pre-resolved
// `context` to avoid re-fetching when the caller already has one.

import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEstimateWithContext, type EstimateWithSections } from '@/lib/queries/estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { loadLatestSignedSnapshot } from '@/lib/queries/share'
import { applySignedSnapshot } from '@/lib/estimate/signed-snapshot'
import { createStorage } from '@/lib/storage'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { isSupportedLanguage, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import {
  DEFAULT_ESTIMATE_TEMPLATE_ID,
  isEstimateTemplateId,
  type EstimateTemplateId,
} from '@/lib/estimate/templates/registry'

// Registry-keyed lookup — NOT if/else. Matches app/api/estimates/[id]/pdf/route.ts's
// existing PDF_TEMPLATE_COMPONENTS map exactly (kept local here so this module
// has zero dependency on that route file).
const PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, typeof EstimatePDF> = {
  classic: EstimatePDF,
  modern: EstimatePDFModern,
}

type EstimateContextResult = NonNullable<Awaited<ReturnType<typeof getEstimateWithContext>>>

export interface EstimatePdfContext {
  templateId: EstimateTemplateId
  estimateLanguage: EstimateLanguage
  contentKey: string
  /** Live row with the TRUST-01 signed-snapshot overlay already applied. */
  estimate: EstimateWithSections
  project: EstimateContextResult['project']
  /** NonNullable: the `if (!result || !result.company) return null` guard in
   * resolveEstimatePdfContext already makes this sound at runtime, but that
   * narrowing doesn't propagate through indexed access alone — the wrapper
   * is required for strict-mode `company.owner_name` reads downstream. */
  company: NonNullable<EstimateContextResult['company']>
  projectName: string
}

export interface RenderEstimatePdfResult {
  buffer: Buffer
  templateId: EstimateTemplateId
  contentKey: string
  projectName: string
}

/**
 * Cheap phase: resolves the estimate, applies the TRUST-01 signed-snapshot
 * overlay, and computes the template id + cache key. No photo signed-URL
 * resolution, no preparedBy lookup, no renderToBuffer — safe to call before
 * deciding whether an ETag 304 makes the expensive render unnecessary.
 */
export async function resolveEstimatePdfContext(
  estimateId: string,
  supabase: SupabaseClient
): Promise<EstimatePdfContext | null> {
  const result = await getEstimateWithContext(supabase, estimateId)
  if (!result || !result.company) return null
  const { estimate: liveEstimate, project, company } = result

  // TRUST-01: once a signature with a non-null snapshot exists, render from
  // the frozen content — never live rows. Same shared query/overlay
  // functions as lib/queries/share.ts's public share lookups — no second
  // implementation (Pitfall 12).
  const signatureServiceClient = requireServiceClient()
  const signedSnapshotRow = await loadLatestSignedSnapshot(signatureServiceClient, liveEstimate.id)
  const signedContent = signedSnapshotRow?.signed_content ?? null
  const estimate = applySignedSnapshot(liveEstimate, signedContent)

  const rawTemplateId = (company as { estimate_template_style?: string }).estimate_template_style
  const templateId: EstimateTemplateId = isEstimateTemplateId(rawTemplateId)
    ? rawTemplateId
    : DEFAULT_ESTIMATE_TEMPLATE_ID
  const estimateLanguage = isSupportedLanguage(estimate.language) ? estimate.language : 'en'
  const contentKey =
    signedSnapshotRow && signedSnapshotRow.signed_content
      ? `sig-${signedSnapshotRow.id}-${signedSnapshotRow.signed_at}`
      : `est-${estimate.id}-${estimate.updated_at}`

  return {
    templateId,
    estimateLanguage,
    contentKey,
    estimate,
    project,
    company,
    projectName: project?.name ?? 'Untitled Project',
  }
}

/**
 * Full render: preparedBy lookup + per-photo signed-URL pre-resolution +
 * renderToBuffer. Pass a pre-resolved `context` (from
 * resolveEstimatePdfContext) to skip re-fetching — used by the download
 * route after its ETag check misses. `send/route.ts` and
 * `pdf-delivery.ts` call this with no `context` (no caching need there).
 */
export async function renderEstimatePdf(
  estimateId: string,
  supabase: SupabaseClient,
  opts?: { context?: EstimatePdfContext }
): Promise<RenderEstimatePdfResult | null> {
  const context = opts?.context ?? (await resolveEstimatePdfContext(estimateId, supabase))
  if (!context) return null
  const { estimate, company, project, templateId, estimateLanguage, contentKey, projectName } = context

  const clientRaw = project?.client
  const client = Array.isArray(clientRaw) ? (clientRaw[0] ?? null) : (clientRaw ?? null)
  const projectType = project?.project_type ?? null

  // Resolve "Prepared by" — staff member who created the estimate, or company
  // owner name. Mirrors app/api/estimates/[id]/pdf/route.ts exactly.
  let preparedBy: string | null = company.owner_name ?? null
  if (estimate.created_by_user_id) {
    try {
      const svc = requireServiceClient()
      const { data: member } = await svc
        .from('company_members')
        .select('display_name')
        .eq('user_id', estimate.created_by_user_id)
        .eq('company_id', estimate.company_id)
        .single()
      if (member?.display_name) preparedBy = member.display_name
    } catch {
      // non-fatal: fall back to owner_name already set above
    }
  }

  // Resolve signed URLs for attached photos server-side BEFORE constructing
  // the element tree (Pitfall 9 — pre-resolve-then-render).
  const storage = createStorage(supabase)
  const attachedPhotos = await Promise.all(
    (estimate.attachedPhotos ?? []).map(async (photo) => ({
      url: await storage.getSignedUrl('photos', photo.storage_path, 3600),
      caption: photo.caption,
    }))
  )

  const PDFComponent = PDF_TEMPLATE_COMPONENTS[templateId]
  const element = createElement(PDFComponent, {
    estimate,
    company,
    client,
    projectName,
    projectType,
    language: estimateLanguage,
    preparedBy,
    attachedPhotos,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  return { buffer: Buffer.from(pdfBuffer), templateId, contentKey, projectName }
}
