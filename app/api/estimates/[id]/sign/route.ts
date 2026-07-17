import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { isDemoCompany } from '@/lib/demo/config'
import { respondToEstimate } from '@/app/estimate/[token]/actions'
import {
  buildSignedContentSnapshot,
  type SnapshotSourceEstimate,
  type SnapshotSourceSection,
} from '@/lib/estimate/signed-snapshot'

interface SignRequestBody {
  token: string
  signerName: string
  signatureData: string
}

// TRUST-01: select('*') here (not the old minimal column list) because the
// full row is ALSO the source for the immutable signed_content snapshot
// below — the snapshot must mirror every rendered/editable field.
type SignEstimateRow = SnapshotSourceEstimate & {
  id: string
  company_id: string
  project_id: string
  share_token: string
  client_response: string | null
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
    const { data: estimateData } = await supabase
      .from('estimates')
      .select('*')
      .eq('id', id)
      .eq('share_token', token)
      .single()

    if (!estimateData) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const estimate = estimateData as unknown as SignEstimateRow

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

    // TRUST-01: load the full render content (sections + items, ordered by
    // sort_order) BEFORE inserting the signature, and build the immutable
    // snapshot from it. Failure posture is FAIL CLOSED — a signature we
    // cannot evidence is the exact bug this phase kills, so a content-load
    // or serialization failure aborts the signing request entirely rather
    // than inserting a signature without a snapshot.
    const { data: sectionsData, error: sectionsError } = await supabase
      .from('estimate_sections')
      .select('*, items:estimate_items(*)')
      .eq('estimate_id', estimate.id)
      .order('sort_order', { ascending: true })
      .order('sort_order', { foreignTable: 'estimate_items', ascending: true })

    if (sectionsError || !sectionsData) {
      console.error('Signature snapshot content load error:', sectionsError)
      return NextResponse.json(
        { error: 'Failed to load estimate content for signing' },
        { status: 500 }
      )
    }

    let signedContent: ReturnType<typeof buildSignedContentSnapshot>
    try {
      signedContent = buildSignedContentSnapshot(
        estimate,
        sectionsData as unknown as SnapshotSourceSection[]
      )
    } catch (snapshotError) {
      console.error('Signature snapshot build error:', snapshotError)
      return NextResponse.json(
        { error: 'Failed to build signature snapshot' },
        { status: 500 }
      )
    }

    // Insert signature record — signed_content + signed_total captured in
    // the SAME insert as the signature row itself (never an update-after).
    const { error: insertError } = await supabase
      .from('estimate_signatures')
      .insert({
        estimate_id: estimate.id,
        company_id: estimate.company_id,
        signer_name: signerName.trim(),
        signature_data: signatureData,
        ip_address: ipAddress,
        user_agent: userAgent,
        signed_content: signedContent,
        signed_total: estimate.total,
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

    // A signature IS acceptance — reuse the same accept path the public
    // "Accept" button uses (client_response/responded_at, projects.status,
    // notification + email) so a signed estimate is never left stuck without
    // a client_response. Best-effort: the signature is already saved above,
    // so a failure here (e.g. a race where the client also clicked Accept)
    // must not fail the sign request itself.
    const acceptResult = await respondToEstimate(token, 'accepted')
    if (!acceptResult.success) {
      console.warn('[sign] respondToEstimate after signing failed:', acceptResult.error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Sign endpoint error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
