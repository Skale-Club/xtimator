import { NextResponse } from 'next/server'
import { sha256Hex } from '@/lib/auth/share-password'
import { checkShareAccess, readClientIp, type ShareAccessRow } from '@/lib/estimates/public-access'
import { rateLimit } from '@/lib/ratelimit'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { resolveEstimatePdfContext, renderEstimatePdf } from '@/lib/pdf/render-estimate-pdf'

const PUBLIC_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

function publicNotFound() {
  return NextResponse.json({ error: 'Signed estimate not found' }, { status: 404, headers: PUBLIC_HEADERS })
}

async function getSignedCopy(id: string, token: string) {
  const ip = (await readClientIp()) ?? 'no-ip'
  const ipLimit = await rateLimit('ipPerMinute', `signed-estimate-pdf:${ip}`)
  const limit = ipLimit.allowed
    ? await rateLimit('publicEstimateResponsePerMinute', `pdf:${ip}:${sha256Hex(token).slice(0, 16)}`)
    : ipLimit
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in a minute.' },
      { status: 429, headers: { ...PUBLIC_HEADERS, 'Retry-After': String(limit.retryAfter ?? 60) } },
    )
  }

  if (!token) return publicNotFound()

  const supabase = requireServiceClient()
  const { data: estimate } = await supabase
    .from('estimates')
    .select('share_token, share_expires_at, share_password_hash, client_response')
    .eq('id', id)
    .eq('share_token', token)
    .maybeSingle()
  if (!estimate?.share_token) return publicNotFound()

  const access = await checkShareAccess(estimate, estimate.share_token)
  if (access !== 'ok') {
    return NextResponse.json(
      { error: access === 'expired' ? 'link_expired' : 'link_locked' },
      { status: access === 'expired' ? 410 : 403, headers: PUBLIC_HEADERS },
    )
  }
  if (estimate.client_response !== 'accepted') return publicNotFound()

  const context = await resolveEstimatePdfContext(id, supabase)
  const currentShare: (ShareAccessRow & { client_response: string | null }) | undefined = context?.estimate
  if (
    !context?.signature ||
    !context.hasSignedSnapshot ||
    !context.signatureEvidence ||
    context.signatureEvidence.integrity === 'mismatch' ||
    currentShare?.client_response !== 'accepted' ||
    currentShare.share_token !== estimate.share_token ||
    currentShare.share_password_hash !== estimate.share_password_hash ||
    currentShare.share_expires_at !== estimate.share_expires_at
  ) {
    return publicNotFound()
  }

  const rendered = await renderEstimatePdf(id, supabase, { context })
  if (!rendered) return publicNotFound()

  return new Response(new Uint8Array(rendered.buffer), {
    headers: {
      ...PUBLIC_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Signed-Estimate.pdf"',
    },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = new URL(request.url).searchParams.get('token')
  try {
    const { id } = await params
    if (token !== null) return await getSignedCopy(id, token)

    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims ?? null
    if (!claims) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // PDFPAR-04: cheap phase only (no photos, no preparedBy, no render) —
    // just enough to compute the ETag and decide whether a 304 short-circuits
    // the expensive render below. See lib/pdf/render-estimate-pdf.ts's doc
    // comment for why this stays split from renderEstimatePdf.
    const context = await resolveEstimatePdfContext(id, supabase)
    if (!context) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const etag = `"${context.contentKey}-${context.templateId}-${context.estimateLanguage}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'private, no-cache' },
      })
    }

    const rendered = await renderEstimatePdf(id, supabase, { context })
    if (!rendered) {
      return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
    }

    const safeProjectName = rendered.projectName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50)

    return new Response(new Uint8Array(rendered.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Estimate-${safeProjectName}.pdf"`,
        'Cache-Control': 'private, no-cache',
        ETag: etag,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      token === null ? { status: 500 } : { status: 500, headers: PUBLIC_HEADERS },
    )
  }
}
