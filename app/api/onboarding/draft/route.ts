import { NextResponse } from 'next/server'
import { sameAuthOrigin, noStore } from '@/lib/auth/http'
import { saveOnboardingDraft } from '@/lib/actions/onboarding-draft'

export async function POST(request: Request) {
  if (!sameAuthOrigin(request)) return NextResponse.json({ error: 'origin_denied' }, { status: 403, headers: noStore })
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > 65536) return NextResponse.json({ error: 'invalid_request' }, { status: 413, headers: noStore })
  const result = await saveOnboardingDraft(await request.json().catch(() => null))
  return NextResponse.json(result, { status: result.error ? 400 : 200, headers: noStore })
}
