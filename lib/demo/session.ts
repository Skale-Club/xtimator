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

type DemoEntryClassification =
  | { kind: 'apex'; destination: string }
  | { kind: 'demo-host' }
  | { kind: 'reject' }

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

  if (request.nextUrl.origin === demoOrigin.origin) {
    return { kind: 'demo-host' }
  }

  const apexOrigin = getApexOrigin(demoOrigin)
  if (apexOrigin && request.nextUrl.origin === apexOrigin.origin) {
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

  if (!demoOrigin || request.nextUrl.origin !== demoOrigin.origin || !email || !password) {
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

    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password })
    const signedInUser = signInData?.user
    if (error || !signedInUser?.id || !isExpectedDemoEmail(signedInUser.email, email)) {
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
