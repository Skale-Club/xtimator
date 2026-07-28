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
import { loadLatestSignedSnapshot } from '@/lib/queries/estimate-signature'
import { applySignedSnapshot } from '@/lib/estimate/signed-snapshot'
import { createStorage } from '@/lib/storage'
import type { DocumentSignature } from '@/lib/estimate/document/model'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { isSupportedLanguage, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import {
  DEFAULT_ESTIMATE_TEMPLATE_ID,
  isEstimateTemplateId,
  type EstimateTemplateId,
} from '@/lib/estimate/templates/registry'
import { LABELS as PDF_LABELS } from '@/lib/estimate/document/labels'
import { createFontkitMeasurementProvider } from '@/lib/estimate/pagination/measure/estimator'
import { blocksFromModel } from '@/lib/estimate/pagination/blocks-from-model'
import { computePageBreaks } from '@/lib/estimate/pagination/engine'
import { computeEstimatePageConstraints } from '@/lib/estimate/pagination/page-constraints'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { resolvePresentationSettings } from '@/lib/estimate/presentation-settings'

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
  /** PDFPAR-02 — signature-display data (signer name, signed date, signature
   *  image), threaded from the widened loadLatestSignedSnapshot query.
   *  null = unsigned estimate: renderers must show NO signature block. */
  signature: DocumentSignature | null
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

  // PDFPAR-02 — both signer_name/signature_data are NOT NULL on the table, so
  // any existing signature row always has them; the `&&` guard here only
  // ever trips to null when signedSnapshotRow itself is null (no signature).
  const signature: DocumentSignature | null =
    signedSnapshotRow?.signer_name && signedSnapshotRow?.signature_data
      ? {
          signerName: signedSnapshotRow.signer_name,
          signedAt: signedSnapshotRow.signed_at,
          signatureDataUrl: signedSnapshotRow.signature_data,
        }
      : null

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
    signature,
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
  const { estimate, signature, company, project, templateId, estimateLanguage, contentKey, projectName } = context

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

  // Phase 184 Plan 05 (PGBRK-01/03/04) — compute the deterministic page
  // breaks via the SAME pipeline both this PDF renderer and (Phase 185) the
  // future web measurement provider call: blocksFromModel() ->
  // computePageBreaks(). Must run AFTER attachedPhotos/preparedBy are
  // resolved (blocksFromModel needs the final photos array) and BEFORE
  // createElement — the templates render exactly `pages.length` <Page>
  // elements, replacing the single implicit Yoga `wrap`.
  // Phase 185 Plan 01 (PGBRK-01/04) — constraints now derived via the ONE
  // shared function also used by tests/unit/pdf/_pages-for-fixture.ts (and,
  // starting Plan 185-03, the web preview) — never a second, independently-
  // maintained derivation (see 185-RESEARCH.md's constraints-parity finding).
  const constraints = computeEstimatePageConstraints(company, templateId)
  const L = PDF_LABELS[estimateLanguage] ?? PDF_LABELS.en
  const blocks = blocksFromModel({
    sections: estimate.sections,
    summary: estimate.summary,
    timeline: estimate.timeline,
    payment_terms: estimate.payment_terms,
    warranty_terms: estimate.warranty_terms,
    notes: estimate.notes,
    company,
    discount_amount: estimate.discount_amount,
    tax_amount: estimate.tax_amount,
    dep: deriveDepositDisplay(estimate),
    signature,
    photos: attachedPhotos,
    resolvedSettings: resolvePresentationSettings(
      (estimate as { presentation_settings?: unknown }).presentation_settings
    ),
    preparedBy,
    L,
    templateId,
  })
  const pages = computePageBreaks(blocks, constraints, createFontkitMeasurementProvider())

  // `EstimatePDFProps` declares `signature?: DocumentSignature | null` for
  // real as of Plan 183-06 (both template files now own the field) — no
  // widening cast needed here anymore.
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
    signature,
    pages,
  })
  const pdfBuffer = await renderToBuffer(element as any)

  return { buffer: Buffer.from(pdfBuffer), templateId, contentKey, projectName }
}
