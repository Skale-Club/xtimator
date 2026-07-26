import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import { isSupportedLanguage } from '@/lib/i18n/resolve-estimate-language'
import { revalidatePath } from 'next/cache'
import { getIntegrationKey } from '@/lib/platform-config'
import { rateLimit } from '@/lib/ratelimit'
import { demoGuardResponse } from '@/lib/demo/guard'
import { shareLinkExpiryFromNow } from '@/lib/estimates/share-link'
import { assertSendAllowed } from '@/lib/notifications/customer-send-gate'
import { sendCustomerMessage } from '@/lib/notifications/customer-send'
import type { CustomerEmailAttachment } from '@/lib/email/customer-emails'

interface SendRequestBody {
  to: string
  subject: string
  body: string
  attachPdf: boolean
  format?: 'online_link' | 'pdf' | 'plain_text'
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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

    // Read-only demo: never send a real email.
    const blocked = await demoGuardResponse()
    if (blocked) return blocked

    // Security Review S05 — rate limit outbound email (Resend cost / spam).
    const rl = await rateLimit('sendPerMinute', claims.sub)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many send requests', code: 'rate_limit:send' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }

    // Parse and validate request body
    let reqBody: SendRequestBody
    try {
      reqBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { to, subject, body, attachPdf } = reqBody
    const format = (reqBody.format ?? 'online_link') as 'online_link' | 'pdf' | 'plain_text'
    if (!['online_link', 'pdf', 'plain_text'].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format (must be 'online_link', 'pdf', or 'plain_text')" },
        { status: 400 }
      )
    }

    if (!to || !isValidEmail(to)) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
    }
    if (!subject || subject.trim().length === 0) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }
    if (!body || body.trim().length === 0) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    // Fetch estimate with context
    const result = await getEstimateWithContext(supabase, id)
    if (!result || !result.company) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const { estimate, project, company } = result

    // The estimate is a trusted target resolved under the authenticated RLS
    // scope. A non-demo actor must still never send on behalf of the demo
    // company, so deny before loading providers or using a service client.
    const targetBlocked = await demoGuardResponse({ companyId: estimate.company_id })
    if (targetBlocked) return targetBlocked

    const projectName = project?.name ?? 'Untitled Project'
    const projectType = project?.project_type ?? null
    const projectId = estimate.project_id

    // Extract client from Supabase join (may be array) — used only for the
    // PDF attachment's rendered content. This join has no `id` field, so it
    // cannot be used for the consent/destination checks below.
    const clientRaw = project?.client
    const client = Array.isArray(clientRaw) ? clientRaw[0] ?? null : clientRaw ?? null

    // Load Resend key from DB-backed loader (ADMIN-06). This front-check MUST
    // stay here, before any client/gate DB work: tests/integration/
    // missing-key-ux.test.ts mocks an unconfigured `supabase.from` and expects
    // this 503 to fire before any other database call.
    const resendKey = await getIntegrationKey('resend')
    if (!resendKey) {
      return NextResponse.json(
        { error: "Email sending isn't available right now. Use 'Download PDF' and send manually, or contact your platform administrator." },
        { status: 503 }
      )
    }

    const svc = requireServiceClient()

    // Phase 177 (CUST-01): resolve the estimate's linked client -- the gate
    // and sendCustomerMessage's own recipient fetch are both keyed to a
    // specific client's consent/contact state, so an unlinked estimate
    // cannot be emailed through the gated path.
    const { data: projectRow } = await supabase
      .from('projects')
      .select('client_id')
      .eq('id', projectId)
      .single()

    if (!projectRow?.client_id) {
      return NextResponse.json(
        { error: 'This estimate has no linked client. Email consent cannot be verified.' },
        { status: 400 }
      )
    }

    const { data: clientRow } = await svc
      .from('clients')
      .select('email')
      .eq('id', projectRow.client_id)
      .eq('company_id', estimate.company_id)
      .maybeSingle()

    // Phase 177 (CUST-01): the request's destination must match the linked
    // client's on-file email -- sendCustomerMessage dispatches to that same
    // on-file email regardless of what `to` says, so an unvalidated mismatch
    // would silently deliver to the wrong address.
    const toNormalized = to.trim().toLowerCase()
    const onFileEmailNormalized = clientRow?.email?.trim().toLowerCase()
    if (!onFileEmailNormalized || onFileEmailNormalized !== toNormalized) {
      return NextResponse.json(
        { error: "The destination email doesn't match this client's email on file." },
        { status: 400 }
      )
    }

    const gateResult = await assertSendAllowed(estimate.company_id, projectRow.client_id, 'email')
    if (!gateResult.allowed || !gateResult.permit) {
      const messages: Record<string, string> = {
        suppressed: 'This client has opted out of messages.',
        no_consent: 'Consent has not been recorded for this client.',
        quiet_hours: "Outside allowed hours for this client's local time. Try again later.",
        unresolvable_timezone: "Cannot verify quiet hours for this client's location.",
        client_not_found: 'Client not found.',
      }
      return NextResponse.json(
        { error: messages[gateResult.reason ?? ''] ?? 'This email cannot be sent right now.' },
        { status: 403 }
      )
    }

    // Build email HTML
    const htmlBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <p>${htmlBody}</p>
      </div>
    `

    // Attach PDF if requested
    let pdfAttachments: CustomerEmailAttachment[] | undefined
    if (attachPdf) {
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

      const safeProjectName = projectName
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50)

      pdfAttachments = [
        { filename: `Estimate-${safeProjectName}.pdf`, content: Buffer.from(pdfBuffer) },
      ]
    }

    // Dispatch via the gated, audited customer send path.
    const sendResult = await sendCustomerMessage({
      permit: gateResult.permit,
      companyId: estimate.company_id,
      clientId: projectRow.client_id,
      businessName: company.name,
      triggerSource: 'manual',
      freeform: { subject, body: html, attachments: pdfAttachments },
    })

    const sentAt = new Date().toISOString()

    if (!sendResult.ok) {
      await svc.from('estimate_deliveries').insert({
        estimate_id: id,
        company_id: estimate.company_id,
        channel: 'email',
        format: format,
        recipient_email: to,
        subject,
        provider: 'resend',
        status: 'failed',
        error_message: sendResult.error ?? 'Send failed',
      })
      return NextResponse.json({ error: 'Failed to send email. Please try again.' }, { status: 500 })
    }

    // The four post-send writes are independent — run them in parallel. Each is
    // fire-and-forget (supabase returns { error } rather than throwing, and none
    // was error-checked before), so semantics are preserved: individual DB
    // failures don't fail the request, and the email has already been sent.
    await Promise.all([
      svc.from('estimate_deliveries').insert({
        estimate_id: id,
        company_id: estimate.company_id,
        channel: 'email',
        format: format,
        recipient_email: to,
        subject,
        provider: 'resend',
        provider_message_id: sendResult.providerMessageId ?? null,
        status: 'sent',
        sent_at: sentAt,
      }),
      supabase
        .from('estimates')
        .update({ sent_at: sentAt, share_expires_at: shareLinkExpiryFromNow() })
        .eq('id', id),
      supabase.from('projects').update({ status: 'sent' }).eq('id', projectId),
      supabase.from('estimate_activity').insert({
        project_id: projectId,
        company_id: estimate.company_id,
        estimate_id: id,
        event_type: 'estimate_sent',
        metadata: { to, subject, attach_pdf: attachPdf, channel: 'email' },
      }),
    ])

    revalidatePath(`/projects/${projectId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
