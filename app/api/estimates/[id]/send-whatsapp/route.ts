import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { deliverEstimateViaWhatsApp } from '@/lib/whatsapp/send-estimate'
import { getWhatsAppAccountStatus } from '@/lib/whatsapp/account-registry'
import { demoGuardResponse } from '@/lib/demo/guard'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'

interface SendWhatsAppRequestBody {
  to: string
  message?: string
  // Phase 163 (SENDHUB-02, W-1 fix): hub's format choice at Send time. Must
  // be forwarded into deliverEstimateViaWhatsApp -- without this, the
  // dispatcher's effectiveDeliveryFormat branch never sees pdf/plain_text and
  // Meta gets a document payload even when the owner picked PDF.
  format?: 'online_link' | 'pdf' | 'plain_text'
}

const E164_RE = /^\+[1-9]\d{7,14}$/

export async function POST(
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
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Read-only demo: never send a real WhatsApp message.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    let body: SendWhatsAppRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { to, message } = body
    // Phase 163 (SENDHUB-02, W-1 fix): widen with the `format` field.
    // Default 'online_link'; forwarded to deliverEstimateViaWhatsApp below.
    const format = (body.format ?? 'online_link') as 'online_link' | 'pdf' | 'plain_text'
    if (!['online_link', 'pdf', 'plain_text'].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format (must be 'online_link', 'pdf', or 'plain_text')" },
        { status: 400 }
      )
    }
    if (!to || !E164_RE.test(to)) {
      return NextResponse.json(
        { error: 'Valid phone number in E.164 format required (e.g. +15551234567)' },
        { status: 400 }
      )
    }

    // Fetch estimate (RLS-scoped to the user) to verify ownership + readiness.
    const { data: estimate } = await supabase
      .from('estimates')
      .select('id, project_id, company_id, share_token')
      .eq('id', id)
      .single()

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }
    if (!estimate.share_token) {
      return NextResponse.json({ error: 'Estimate has no share link' }, { status: 400 })
    }

    // Entitlement gate: plan must include WhatsApp AND a connected, active number.
    const { data: company } = await supabase
      .from('companies')
      .select('id, tier')
      .eq('id', estimate.company_id)
      .single()
    if (!company) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const whatsappEnabled = (await getEntitlementsForTier((company.tier as string) ?? 'free')).whatsappEnabled
    if (!whatsappEnabled) {
      return NextResponse.json(
        { error: 'WhatsApp delivery is not available on your current plan.' },
        { status: 403 }
      )
    }

    // Gate: opaque account-active check via the server-only registry (D-06).
    // No provisioning data leaked to the browser — only enabled/unavailable.
    const accountStatus = await getWhatsAppAccountStatus(estimate.company_id)
    if (!accountStatus.active) {
      return NextResponse.json(
        { error: 'WhatsApp delivery is currently unavailable. Please contact your administrator.' },
        { status: 403 }
      )
    }

    // Resolve the client linked to the project (for conversation linkage + naming).
    const svc = requireServiceClient()
    let clientId: string | null = null
    let clientName: string | null = null
    if (estimate.project_id) {
      const { data: project } = await svc
        .from('projects')
        .select('client_id')
        .eq('id', estimate.project_id)
        .single()
      clientId = (project?.client_id as string | null) ?? null
      if (clientId) {
        const { data: client } = await svc
          .from('clients')
          .select('name')
          .eq('id', clientId)
          .single()
        clientName = (client?.name as string | null) ?? null
      }
    }

    const result = await deliverEstimateViaWhatsApp({
      svc,
      estimateId: estimate.id,
      companyId: estimate.company_id,
      toPhone: to,
      clientId,
      clientName,
      customMessage: message ?? null,
      // Phase 163 (SENDHUB-02, W-1 fix): forward the request-body format so
      // the dispatcher's effectiveDeliveryFormat branch can force share_link
      // for pdf/plain_text regardless of the account's deliveryFormat preference.
      format,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error ?? 'Failed to send' }, { status: 500 })
    }

    // Refresh the share-link expiry on send (revives an expired link).
    await svc
      .from('estimates')
      .update({ share_expires_at: shareLinkExpiryFromNow() })
      .eq('id', estimate.id)

    return NextResponse.json({ success: true, fallback: result.fallback ?? null })
  } catch (error) {
    console.error('Send WhatsApp error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
