import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import { loadLatestSignedSnapshot } from '@/lib/queries/share'
import { applySignedSnapshot } from '@/lib/estimate/signed-snapshot'
import { createStorage } from '@/lib/storage'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import EstimatePDFModern from '@/components/pdf/estimate-pdf-modern'
import { isSupportedLanguage } from '@/lib/i18n/resolve-estimate-language'
import {
  DEFAULT_ESTIMATE_TEMPLATE_ID,
  isEstimateTemplateId,
  type EstimateTemplateId,
} from '@/lib/estimate/templates/registry'

// Registry-keyed component lookup — NOT if/else. Adding a future 3rd template is one
// registry entry (lib/estimate/templates/registry.ts) + one map entry here + one new
// component file.
const PDF_TEMPLATE_COMPONENTS: Record<EstimateTemplateId, typeof EstimatePDF> = {
  classic: EstimatePDF,
  modern: EstimatePDFModern,
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Fetch estimate with all context
    const result = await getEstimateWithContext(supabase, id)
    if (!result || !result.company) {
      return NextResponse.json(
        { error: 'Estimate not found' },
        { status: 404 }
      )
    }

    const { estimate: liveEstimate, project, company } = result

    // TRUST-01: once a signature with a non-null snapshot exists, render from
    // the frozen content — never live rows. Same REPLACE-not-merge overlay,
    // and the SAME shared query/overlay functions, as lib/queries/share.ts's
    // two lookup functions — no second implementation.
    const signatureServiceClient = requireServiceClient()
    const signedSnapshotRow = await loadLatestSignedSnapshot(
      signatureServiceClient,
      liveEstimate.id
    )
    const signedContent = signedSnapshotRow?.signed_content ?? null
    const estimate = applySignedSnapshot(liveEstimate, signedContent)

    // PDF caching (lightweight ETag / 304 approach — see summary): the rendered
    // bytes are a function of the estimate content, the selected template, and
    // the label language. Emit an ETag over exactly those inputs; when the
    // client re-requests an UNCHANGED estimate we answer 304 and skip the
    // expensive renderToBuffer AND the preparedBy lookup + per-photo
    // signed-URL resolution below. A full storage-object cache was
    // deliberately avoided: this route's PDF varies by company branding /
    // preparedBy / attached photos (none captured by estimate.updated_at) and is
    // a DIFFERENT render than the send route's attachment, so a shared
    // updated_at-keyed object would risk serving stale/wrong PDFs.
    //
    // TRUST-01: once a snapshot is used, the render is a pure function of the
    // FROZEN signature (id + signed_at) — a post-sign edit bumping
    // updated_at must NOT invalidate an already-correct cached signed PDF, so
    // the key switches off updated_at entirely in that case.
    const rawTemplateId = (company as { estimate_template_style?: string }).estimate_template_style
    const templateId: EstimateTemplateId = isEstimateTemplateId(rawTemplateId)
      ? rawTemplateId
      : DEFAULT_ESTIMATE_TEMPLATE_ID
    const estimateLanguage = isSupportedLanguage(estimate.language) ? estimate.language : 'en'
    const contentKey =
      signedSnapshotRow && signedSnapshotRow.signed_content
        ? `sig-${signedSnapshotRow.id}-${signedSnapshotRow.signed_at}`
        : `est-${estimate.id}-${estimate.updated_at}`
    const etag = `"${contentKey}-${templateId}-${estimateLanguage}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const projectName = project?.name ?? 'Untitled Project'
    const projectType = project?.project_type ?? null

    // Supabase returns client as an array from the join; extract first element
    const clientRaw = project?.client
    const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

    // Resolve "Prepared by" — staff member who created the estimate, or company owner name
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

    // Resolve signed URLs for attached photos server-side before rendering —
    // estimate.attachedPhotos carries raw storage_path rows, not signed URLs.
    const storage = createStorage(supabase)
    const attachedPhotos = await Promise.all(
      (estimate.attachedPhotos ?? []).map(async (photo) => ({
        url: await storage.getSignedUrl('photos', photo.storage_path, 3600),
        caption: photo.caption,
      }))
    )

    // Resolve template component defensively — estimate_template_style may be an
    // unrecognized/legacy string once the live column exists, or absent from the
    // TS-only-patched type at runtime before the migration is live. templateId +
    // estimateLanguage were already resolved above for the ETag.
    const PDFComponent = PDF_TEMPLATE_COMPONENTS[templateId]

    // Render PDF to buffer — pass estimate language for localized labels
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

    // Sanitize filename
    const safeProjectName = projectName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${safeProjectName}.pdf"`,
        // no-cache (not no-store) so the client keeps the body but revalidates
        // against the ETag on the next download — an unchanged estimate then
        // gets a 304 and no re-render.
        'Cache-Control': 'private, no-cache',
        ETag: etag,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
