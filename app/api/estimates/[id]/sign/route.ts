import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { isDemoCompany } from '@/lib/demo/config'

interface SignRequestBody {
  token: string
  signerName: string
  signatureData: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    let body: SignRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { token, signerName, signatureData } = body

    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })
    if (!signerName?.trim()) return NextResponse.json({ error: 'Signer name required' }, { status: 400 })
    if (!signatureData) return NextResponse.json({ error: 'Signature data required' }, { status: 400 })

    const supabase = requireServiceClient()

    // Verify estimate by share_token + id match
    const { data: estimate } = await supabase
      .from('estimates')
      .select('id, company_id, project_id, share_token, client_response')
      .eq('id', id)
      .eq('share_token', token)
      .single()

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    if (estimate.client_response) {
      return NextResponse.json({ error: 'Estimate already responded to' }, { status: 409 })
    }

    // Verify company has digital_signature_enabled
    const { data: company } = await supabase
      .from('companies')
      .select('digital_signature_enabled')
      .eq('id', estimate.company_id)
      .single()

    if (!company?.digital_signature_enabled) {
      return NextResponse.json({ error: 'Digital signature not enabled' }, { status: 403 })
    }

    // Demo estimates are not signable (D06 — demo data never mutated).
    if (isDemoCompany(estimate.company_id)) {
      return NextResponse.json({ error: 'Signing is disabled in the demo.' }, { status: 403 })
    }

    // Capture IP and user-agent for audit
    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = headersList.get('user-agent') ?? null

    // Insert signature record
    const { error: insertError } = await supabase
      .from('estimate_signatures')
      .insert({
        estimate_id: estimate.id,
        company_id: estimate.company_id,
        signer_name: signerName.trim(),
        signature_data: signatureData,
        ip_address: ipAddress,
        user_agent: userAgent,
      })

    if (insertError) {
      console.error('Signature insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 })
    }

    // Log activity
    await supabase.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: estimate.company_id,
      estimate_id: estimate.id,
      event_type: 'estimate_signed',
      metadata: { signer_name: signerName.trim() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Sign endpoint error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
