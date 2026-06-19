import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import { isSupportedLanguage } from '@/lib/i18n/resolve-estimate-language'

export async function GET(
  _request: Request,
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

    const { estimate, project, company } = result

    const projectName = project?.name ?? 'Untitled Project'
    const projectType = project?.project_type ?? null

    // Supabase returns client as an array from the join; extract first element
    const clientRaw = project?.client
    const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

    // Render PDF to buffer — pass estimate language for localized labels
    const estimateLanguage = isSupportedLanguage(estimate.language) ? estimate.language : 'en'
    const element = createElement(EstimatePDF, {
      estimate,
      company,
      client,
      projectName,
      projectType,
      language: estimateLanguage,
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
        'Cache-Control': 'no-store',
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
