import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { requireOwnedActivation } from '@/lib/auth/owned-store'
import { issueOwnedSession, readOwnedSession, revokeOwnedSession, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from '@/lib/auth/owned-session'
import { ACTIVE_COMPANY_COOKIE, ACTIVE_COMPANY_COOKIE_OPTIONS } from '@/lib/queries/active-company'
import { getDemoCompanyId } from './config'

/** Called only after the existing strict configured-demo-origin classification. */
export async function establishOwnedDemoSession(request: NextRequest, origin: URL, email: string) {
  try {
    await requireOwnedActivation()
    const service = requireDataServiceClient()
    const companyId = getDemoCompanyId()
    const { data: mapping, error: mappingError } = await service.from('demo_config').select('user_id').eq('company_id', companyId).single()
    if (mappingError || !mapping) throw new Error('Demo mapping missing')
    const results = await Promise.all([
      service.from('xtimator_accounts').select('id,email,disabled_at').eq('id', mapping.user_id).single(),
      service.from('company_members').select('user_id').eq('user_id', mapping.user_id).eq('company_id', companyId).maybeSingle(),
      service.from('platform_admins').select('user_id').eq('user_id', mapping.user_id).maybeSingle(),
      service.from('companies').select('id').eq('id', companyId).eq('user_id', mapping.user_id).maybeSingle(),
    ])
    if (results.some(result => result.error)) throw new Error('Demo principal lookup failed')
    const [{ data: account }, { data: membership }, { data: admin }, { data: company }] = results
    if (!account || account.disabled_at || account.email?.toLowerCase() !== email.toLowerCase() || !membership || admin || !company) throw new Error('Invalid demo principal')
    const oldToken = request.cookies.get(SESSION_COOKIE)?.value
    const existing = await readOwnedSession(oldToken)
    const token = existing?.user_id === mapping.user_id ? oldToken! : await issueOwnedSession(mapping.user_id)
    if (oldToken && token !== oldToken) await revokeOwnedSession(oldToken)
    const response = NextResponse.redirect(new URL('/dashboard', origin), 303)
    response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, secure: origin.protocol === 'https:',
      maxAge: existing && existing.user_id === mapping.user_id ? Math.floor((Date.parse(existing.expires_at) - Date.now()) / 1000) : SESSION_SECONDS })
    response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, { ...ACTIVE_COMPANY_COOKIE_OPTIONS, secure: origin.protocol === 'https:' })
    return response
  } catch { return new NextResponse('Service unavailable', { status: 503 }) }
}
