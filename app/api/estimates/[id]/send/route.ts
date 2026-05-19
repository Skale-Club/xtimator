import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEstimateWithContext } from '@/lib/queries/estimate'
import EstimatePDF from '@/components/pdf/estimate-pdf'
import { revalidatePath } from 'next/cache'
import { getIntegrationKey, getBranding } from '@/lib/platform-config'

interface SendRequestBody {
  to: string
  subject: string
  body: string
  attachPdf: boolean
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
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    let reqBody: SendRequestBody
    try {
      reqBody = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { to, subject, body, attachPdf } = reqBody

    if (!to || !isValidEmail(to)) {
      return NextResponse.json(
        { error: 'Valid email address required' },
        { status: 400 }
      )
    }
    if (!subject || subject.trim().length === 0) {
      return NextResponse.json(
        { error: 'Subject is required' },
        { status: 400 }
      )
    }
    if (!body || body.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message body is required' },
        { status: 400 }
      )
    }

    // Fetch estimate with context
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
    const projectId = estimate.project_id

    // Extract client from Supabase join (may be array)
    const clientRaw = project?.client
    const client = Array.isArray(clientRaw)
      ? clientRaw[0] ?? null
      : clientRaw ?? null

    // Build share link
    const shareLink = `${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}` // Will be set in email body by user

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

    // Load Resend key from DB-backed loader (ADMIN-06)
    const resendKey = await getIntegrationKey('resend')
    if (!resendKey) {
      return NextResponse.json(
        { error: "Email sending isn't available right now. Use 'Download PDF' and send manually, or contact your platform administrator." },
        { status: 503 }
      )
    }
    const resend = new Resend(resendKey)

    // Load branding for email from-name
    const branding = await getBranding()
    const fromName = branding.emailFromName ?? branding.appName

    // Build email options
    const emailOptions: {
      from: string
      to: string
      subject: string
      html: string
      attachments?: { filename: string; content: Buffer }[]
    } = {
      from: `${fromName} <onboarding@resend.dev>`,
      to,
      subject,
      html,
    }

    // Attach PDF if requested
    if (attachPdf) {
      const element = createElement(EstimatePDF, {
        estimate,
        company,
        client,
        projectName,
        projectType,
      })
      const pdfBuffer = await renderToBuffer(element as any)

      const safeProjectName = projectName
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50)

      emailOptions.attachments = [
        {
          filename: `Estimate-${safeProjectName}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ]
    }

    // Send email via Resend
    const { data: sendData, error: sendError } = await resend.emails.send(emailOptions)

    const svc = requireServiceClient()
    const sentAt = new Date().toISOString()

    if (sendError) {
      console.error('Resend send error:', sendError)
      // Log failed delivery
      await svc.from('estimate_deliveries').insert({
        estimate_id: id,
        company_id: estimate.company_id,
        channel: 'email',
        recipient_email: to,
        subject,
        provider: 'resend',
        status: 'failed',
        error_message: sendError.message ?? 'Resend error',
      })
      return NextResponse.json(
        { error: 'Failed to send email. Please try again.' },
        { status: 500 }
      )
    }

    // Log successful delivery
    await svc.from('estimate_deliveries').insert({
      estimate_id: id,
      company_id: estimate.company_id,
      channel: 'email',
      recipient_email: to,
      subject,
      provider: 'resend',
      provider_message_id: sendData?.id ?? null,
      status: 'sent',
      sent_at: sentAt,
    })

    // Update estimate sent_at
    await supabase
      .from('estimates')
      .update({ sent_at: sentAt })
      .eq('id', id)

    // Update project status to 'sent'
    await supabase
      .from('projects')
      .update({ status: 'sent' })
      .eq('id', projectId)

    // Log activity
    await supabase.from('estimate_activity').insert({
      project_id: projectId,
      company_id: estimate.company_id,
      estimate_id: id,
      event_type: 'estimate_sent',
      metadata: { to, subject, attach_pdf: attachPdf, channel: 'email' },
    })

    // Revalidate project page
    revalidatePath(`/projects/${projectId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send email error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}
