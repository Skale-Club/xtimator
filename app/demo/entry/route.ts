import { NextResponse, type NextRequest } from 'next/server'
import { classifyDemoEntryRequest, establishDemoSession } from '@/lib/demo/session'

/** Additive entry seam; legacy /demo pages remain untouched until Phase 181. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const classification = classifyDemoEntryRequest(request)

  if (classification.kind === 'apex') {
    // No Supabase client or cookies are touched on the apex handoff.
    return NextResponse.redirect(classification.destination, 303)
  }

  if (classification.kind === 'demo-host') {
    return establishDemoSession(request)
  }

  return new NextResponse('Service unavailable', { status: 503 })
}
