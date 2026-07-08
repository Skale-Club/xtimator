import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getTwilioConfig, getBranding } from '@/lib/platform-config'
import { sendSms } from '@/lib/sms/client'
import { rateLimit } from '@/lib/ratelimit'
import { demoGuardResponse } from '@/lib/demo/guard'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'
import { buildEstimatePublicPath } from '@/lib/estimate/public-url'

interface SendSmsRequestBody {
  to: string
  message?: string
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

    // Read-only demo: never send a real SMS.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Security Review S05 — rate limit outbound SMS (Twilio cost / spam).
    const rl = await rateLimit('sendPerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many SMS requests', code: 'rate_limit:send_sms' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    let body: SendSmsRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { to, message } = body
    if (!to || !E164_RE.test(to)) {
      return NextResponse.json(
        { error: 'Valid phone number in E.164 format required (e.g. +15551234567)' },
        { status: 400 }
      )
    }

    // Fetch estimate with company to verify ownership
    const { data: estimate } = await supabase
      .from('estimates')
      .select('id, project_id, company_id, share_token, public_slug_token')
      .eq('id', id)
      .single()

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    if (!estimate.share_token) {
      return NextResponse.json({ error: 'Estimate has no share link' }, { status: 400 })
    }

    // Verify company belongs to user
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, sms_delivery_enabled, slug')
      .eq('id', estimate.company_id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    if (!company.sms_delivery_enabled) {
      return NextResponse.json({ error: 'SMS delivery is not enabled for this company' }, { status: 403 })
    }

    // Load Twilio config
    const twilio = await getTwilioConfig()
    if (!twilio) {
      return NextResponse.json(
        { error: "SMS delivery isn't configured. Contact your platform administrator." },
        { status: 503 }
      )
    }

    // Build share URL
    const branding = await getBranding()
    const baseUrl = branding.canonicalBaseUrl ?? getCanonicalBaseUrl()
    const shareUrl = `${baseUrl}${buildEstimatePublicPath(
      { slug: company.slug, name: company.name },
      { id: estimate.id, public_slug_token: estimate.public_slug_token, share_token: estimate.share_token }
    )}`

    const smsBody = message?.trim() ||
      `${company.name} sent you an estimate. Review and approve it here: ${shareUrl}`

    // Send via the shared Twilio REST primitive (never-throw, returns ok/sid/error).
    const result = await sendSms(to, smsBody)

    const svc = requireServiceClient()

    if (!result.ok) {
      // Log failed delivery
      await svc.from('estimate_deliveries').insert({
        estimate_id: estimate.id,
        company_id: estimate.company_id,
        channel: 'sms',
        recipient_phone: to,
        provider: 'twilio',
        status: 'failed',
        error_message: result.error ?? 'Twilio error',
      })

      return NextResponse.json(
        { error: 'Failed to send SMS. Please try again.' },
        { status: 500 }
      )
    }

    // Log successful delivery
    await svc.from('estimate_deliveries').insert({
      estimate_id: estimate.id,
      company_id: estimate.company_id,
      channel: 'sms',
      recipient_phone: to,
      provider: 'twilio',
      provider_message_id: result.sid ?? null,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    // Update estimate sent_at if first send
    await supabase
      .from('estimates')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id)
      .is('sent_at', null)

    // Refresh the share-link expiry on every send (revives an expired link).
    await supabase
      .from('estimates')
      .update({ share_expires_at: shareLinkExpiryFromNow() })
      .eq('id', id)

    // Log activity
    await svc.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: estimate.company_id,
      estimate_id: estimate.id,
      event_type: 'estimate_sent',
      metadata: { channel: 'sms', to },
    })

    return NextResponse.json({ success: true, sid: result.sid })
  } catch (error) {
    console.error('Send SMS error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
