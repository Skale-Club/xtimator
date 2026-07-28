import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveEstimatePdfContext, renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // PDFPAR-04: cheap phase only (no photos, no preparedBy, no render) —
    // just enough to compute the ETag and decide whether a 304 short-circuits
    // the expensive render below. See lib/pdf/render-estimate-pdf.ts's doc
    // comment for why this stays split from renderEstimatePdf.
    const context = await resolveEstimatePdfContext(id, supabase)
    if (!context) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const etag = `"${context.contentKey}-${context.templateId}-${context.estimateLanguage}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const rendered = await renderEstimatePdf(id, supabase, { context })
    if (!rendered) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const safeProjectName = rendered.projectName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)

    return new Response(new Uint8Array(rendered.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${safeProjectName}.pdf"`,
        'Cache-Control': 'private, no-cache',
        ETag: etag,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
