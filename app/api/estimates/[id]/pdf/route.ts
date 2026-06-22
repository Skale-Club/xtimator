import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
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

    // Render PDF to buffer — pass estimate language for localized labels
    const estimateLanguage = isSupportedLanguage(estimate.language) ? estimate.language : 'en'
    const element = createElement(EstimatePDF, {
      estimate,
      company,
      client,
      projectName,
      projectType,
      language: estimateLanguage,
      preparedBy,
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
