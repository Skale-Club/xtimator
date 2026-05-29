import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getTwilioConfig, getBranding } from '@/lib/platform-config'
import { rateLimit } from '@/lib/ratelimit'

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
      .select('id, project_id, company_id, share_token, workflow_status')
      .eq('id', id)
      .single()

    if (!estimate) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    if (!estimate.share_token) {
      return NextResponse.json({ error: 'Estimate has no share link' }, { status: 400 })
    }

    // SEED-028: SMS sending requires consolidated estimate.
    if (estimate.workflow_status !== 'consolidated') {
      return NextResponse.json(
        { error: 'Consolidate this estimate before sending it.' },
        { status: 409 }
      )
    }

    // Verify company belongs to user
    const { data: company } = await supabase
      .from('companies')
      .select('id, name, sms_delivery_enabled')
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
    const baseUrl = branding.canonicalBaseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
    const shareUrl = `${baseUrl}/estimate/${estimate.share_token}`

    const smsBody = message?.trim() ||
      `${company.name} sent you an estimate. Review and approve it here: ${shareUrl}`

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`
    const credentials = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')

    const formData = new URLSearchParams()
    formData.set('From', twilio.fromPhone)
    formData.set('To', to)
    formData.set('Body', smsBody)

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const twilioData = await twilioRes.json()

    const svc = requireServiceClient()

    if (!twilioRes.ok) {
      // Log failed delivery
      await svc.from('estimate_deliveries').insert({
        estimate_id: estimate.id,
        company_id: estimate.company_id,
        channel: 'sms',
        recipient_phone: to,
        provider: 'twilio',
        status: 'failed',
        error_message: twilioData.message ?? 'Twilio error',
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
      provider_message_id: twilioData.sid ?? null,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })

    // Update estimate sent_at if first send
    await supabase
      .from('estimates')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', id)
      .is('sent_at', null)

    // Log activity
    await svc.from('estimate_activity').insert({
      project_id: estimate.project_id,
      company_id: estimate.company_id,
      estimate_id: estimate.id,
      event_type: 'estimate_sent',
      metadata: { channel: 'sms', to },
    })

    return NextResponse.json({ success: true, sid: twilioData.sid })
  } catch (error) {
    console.error('Send SMS error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
