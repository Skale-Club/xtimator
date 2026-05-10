import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'

export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: companyRow } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', claims.sub)
      .single()

    if (!companyRow) {
      return NextResponse.json({ error: 'No company found' }, { status: 401 })
    }
    const companyId = companyRow.id as string

    // Parse body
    const body = await request.json().catch(() => null)
    if (!body?.projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      )
    }
    const projectId = body.projectId as string

    const result = await generateEstimateForProject(companyId, projectId)
    return NextResponse.json(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Estimate generation failed. Please try again.'
    const knownClientErrors = [
      'Project not found',
      'Company not found',
      'At least one audio transcript or photo is required',
    ]
    const status = knownClientErrors.includes(message) ? 400 : 500
    console.error('Estimate generation failed:', error)
    return NextResponse.json({ error: message }, { status })
  }
}
