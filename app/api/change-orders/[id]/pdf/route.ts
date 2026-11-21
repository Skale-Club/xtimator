import { createElement } from 'react'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { getAuthContext } from '@/lib/auth/context'
import { rateLimit } from '@/lib/ratelimit'
import { sha256Hex } from '@/lib/auth/share-password'
import { readClientIp } from '@/lib/estimates/public-access'
import { getChangeOrderDocumentById } from '@/lib/change-orders/queries'
import { formatChangeOrderNumber } from '@/lib/change-orders/types'
import { resolvePdfLogo } from '@/lib/pdf/resolve-pdf-logo'
import ChangeOrderPDF from '@/components/pdf/change-order-pdf'

// A change order PDF is read by two kinds of caller: the owner's team (signed
// in, same company) and the client (the share token from the page link). Any
// other caller gets the same 404 as an unknown id, so nothing about whether an
// id exists leaks.
function tokenMatches(given: string | null, actual: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(actual)
  return a.length === b.length && timingSafeEqual(a, b)
}

const NOT_FOUND = () => NextResponse.json({ error: 'Change order not found' }, { status: 404 })

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const token = new URL(request.url).searchParams.get('token')

    // Throttle FIRST: PDF rendering is expensive and the token path is anonymous.
    // Keyed by IP + a truncated hash of the token (or the id when absent).
    const ip = await readClientIp()
    const rl = await rateLimit(
      'publicChangeOrderPerMinute',
      `pdf:${ip ?? 'no-ip'}:${sha256Hex(token ?? id).slice(0, 16)}`,
    )
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in a minute.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }

    // Loaded only to authorize against; never returned unless a check passes.
    const data = await getChangeOrderDocumentById(id)
    if (!data) return NOT_FOUND()

    let authorized = tokenMatches(token, data.changeOrder.share_token)
    if (!authorized) {
      const auth = await getAuthContext()
      authorized = !('error' in auth) && auth.companyId === data.changeOrder.company_id
    }
    if (!authorized) return NOT_FOUND()

    const logo_url = await resolvePdfLogo(data.company.logo_url)
    const element = createElement(ChangeOrderPDF, { data: { ...data, company: { ...data.company, logo_url } } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = Buffer.from(await renderToBuffer(element as any))

    const filename = formatChangeOrderNumber(data.estimate.estimateNumber, data.changeOrder.number).replace(
      /[^a-zA-Z0-9._-]/g,
      '-'
    )
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Change order PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
