import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  getDemoAppOrigin,
  getDemoCompanyId,
  getDemoUserEmail,
  getDemoUserPassword,
} from '@/lib/demo/config'
import { ACTIVE_COMPANY_COOKIE, ACTIVE_COMPANY_COOKIE_OPTIONS } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'

type DemoEntryClassification =
  | { kind: 'apex'; destination: string }
  | { kind: 'demo-host' }
  | { kind: 'reject' }

/**
 * The real incoming origin for this request.
 *
 * `request.nextUrl.origin` reflects Vercel-injected per-request host info on
 * Vercel, but this app is self-hosted (GitHub Actions -> Docker/GHCR ->
 * Coolify) — under `next start` / the standalone server, `nextUrl.origin`
 * is always the server's own bind address (e.g. 0.0.0.0:9633), identical
 * for every Host. Apex vs demo-host classification must read the actual
 * `Host` (or a trusted proxy's `x-forwarded-host`) instead, or every
 * demo-host request misclassifies as apex and /demo/entry redirects to
 * itself forever.
 */
export function getRequestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return request.nextUrl.origin
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')
  return `${proto}://${host}`
}

function getApexOrigin(demoOrigin: URL): URL | null {
  if (demoOrigin.hostname === 'demo.localhost') {
    return new URL(`${demoOrigin.protocol}//localhost${demoOrigin.port ? `:${demoOrigin.port}` : ''}`)
  }

  if (demoOrigin.hostname === 'demo.xtimator.com' && demoOrigin.protocol === 'https:') {
    return new URL('https://xtimator.com')
  }

  return null
}

/** Classifies only the two configured hosts; request headers never create a destination. */
export function classifyDemoEntryRequest(request: NextRequest): DemoEntryClassification {
  const demoOrigin = getDemoAppOrigin()
  if (!demoOrigin || request.nextUrl.pathname !== '/demo/entry' || request.nextUrl.search) {
    return { kind: 'reject' }
  }

  const requestOrigin = getRequestOrigin(request)

  if (requestOrigin === demoOrigin.origin) {
    return { kind: 'demo-host' }
  }

  const apexOrigin = getApexOrigin(demoOrigin)
  if (apexOrigin && requestOrigin === apexOrigin.origin) {
    return {
      kind: 'apex',
      destination: new URL('/demo/entry', demoOrigin).toString(),
    }
  }

  return { kind: 'reject' }
}

function terminalFailure(): NextResponse {
  return new NextResponse('Service unavailable', { status: 503 })
}

function isExpectedDemoEmail(email: unknown, expectedEmail: string): boolean {
  return typeof email === 'string' && email.toLowerCase() === expectedEmail.toLowerCase()
}

/**
 * Creates or repairs the demo-host-only session. This function has exactly one
 * success redirect and no failure redirects, so a broken auth configuration
 * cannot loop between /dashboard and this entry route.
 */
export async function establishDemoSession(request: NextRequest): Promise<NextResponse> {
  const demoOrigin = getDemoAppOrigin()
  const email = getDemoUserEmail()
  const password = getDemoUserPassword()

  if (!demoOrigin || getRequestOrigin(request) !== demoOrigin.origin || !email || !password) {
    return terminalFailure()
  }

  const secure = demoOrigin.protocol === 'https:'
  const response = NextResponse.redirect(new URL('/dashboard', demoOrigin), 303)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookieOptions: { secure },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            const { domain: _domain, ...hostOnlyOptions } = options
            response.cookies.set(name, value, { ...hostOnlyOptions, secure })
          })
        },
      },
    }
  )

  const demoCompanyId = getDemoCompanyId()

  const verifyDemoPrincipal = async (userId: string): Promise<boolean> => {
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('company_id', demoCompanyId)
      .maybeSingle()
    if (!membership) return false

    // A public, shared demo principal must never inherit platform authority.
    // This check intentionally uses the immutable verified auth subject, not
    // mutable role metadata carried in a JWT or request body.
    const { data: platformAdmin } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    return !platformAdmin
  }

  const setDemoCompanyCookie = () => {
    response.cookies.set(ACTIVE_COMPANY_COOKIE, demoCompanyId, {
      ...ACTIVE_COMPANY_COOKIE_OPTIONS,
      secure,
    })
  }

  try {
    const { data: claimsData } = await supabase.auth.getClaims()
    const claims = claimsData?.claims
    const existingUserId = typeof claims?.sub === 'string' ? claims.sub : null
    if (existingUserId && isExpectedDemoEmail(claims?.email, email) && await verifyDemoPrincipal(existingUserId)) {
      setDemoCompanyCookie()
      return response
    }

    // Repair is local to this browser and demo host. Expiring observed chunks
    // avoids retaining malformed session state without hard-coding cookie names.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-') || name === ACTIVE_COMPANY_COOKIE) {
        response.cookies.set(name, '', { path: '/', maxAge: 0, secure })
      }
    })

    // signInWithPassword() is subject to this project's Auth-level CAPTCHA
    // protection (Cloudflare Turnstile) — there is no browser widget in this
    // server-side handoff to solve it. Mint the session via the Admin API
    // (service role) instead: generateLink() issues a one-time magic-link
    // token for the known demo email server-side, then verifyOtp() on the
    // request-scoped client redeems it and writes real session cookies to
    // `response`. Neither admin.generateLink() nor verifyOtp() are subject to
    // the password-grant CAPTCHA gate.
    //
    // One bounded retry: verifyOtp has been observed to transiently reject a
    // just-issued token as expired/invalid immediately after a prior local
    // signOut() on the same identity (read-replica lag on Supabase's side,
    // not a code defect — reproduced independently of this request). A single
    // retry stays inside this one response (no extra client-visible redirect,
    // no loop) and resolves it.
    let signedInUser: { id: string; email?: string | null } | undefined
    for (let attempt = 0; attempt < 2 && !signedInUser; attempt++) {
      const { data: linkData, error: linkError } = await requireServiceClient().auth.admin.generateLink({
        type: 'magiclink',
        email,
      })
      if (linkError || !linkData?.properties?.hashed_token) continue

      const { data: signInData } = await supabase.auth.verifyOtp({
        type: 'magiclink',
        token_hash: linkData.properties.hashed_token,
      })
      if (signInData?.user && isExpectedDemoEmail(signInData.user.email, email)) {
        signedInUser = signInData.user
      }
    }
    if (!signedInUser) {
      return terminalFailure()
    }
    if (!await verifyDemoPrincipal(signedInUser.id)) {
      return terminalFailure()
    }

    setDemoCompanyCookie()
    return response
  } catch {
    return terminalFailure()
  }
}
