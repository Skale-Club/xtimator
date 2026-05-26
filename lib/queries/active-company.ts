import 'server-only'
import { cookies } from 'next/headers'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireServiceClient } from '@/lib/supabase/service'
import { getAuthClaims, type AppCompany } from '@/lib/queries/auth'

/**
 * Phase 79 — Active company resolver.
 *
 * Single point where multi-tenant state enters the request lifecycle (D-09).
 * Cookie name: `active_company_id` (D-05).
 *
 * Read order on every request:
 *   1. Read cookie value (D-08: validation is mandatory on every read).
 *   2. If cookie present AND user has a company_members row for that company_id → return it.
 *   3. Otherwise fall back: query company_members for the user, JOIN companies,
 *      ORDER BY companies.created_at DESC, pick the top row, set the cookie,
 *      return its company_id (D-07).
 *   4. If the user has zero memberships → return null (caller redirects to /onboarding).
 *
 * The cookie is set by THIS helper itself during fallback (D-06) — no middleware layer
 * is needed because the cookie is read inside server components / server actions and
 * the response carries the Set-Cookie header automatically (Next.js cookies() integration).
 */

export const ACTIVE_COMPANY_COOKIE = 'active_company_id'

// D-05: httpOnly, sameSite=lax, path=/, max-age=30 days (rolling — refreshed on fallback).
export const ACTIVE_COMPANY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

/**
 * Resolves the active company id for the current request.
 *
 * Returns null when the user is unauthenticated or has zero memberships.
 *
 * Side effect: writes the `active_company_id` cookie on fallback (D-06).
 */
export async function getActiveCompanyId(): Promise<string | null> {
  const claims = await getAuthClaims()
  if (!claims?.sub) return null

  const userId = claims.sub as string
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null

  // Use the authenticated (RLS-bound) client for validation — the company_members
  // SELECT policy gates by user_id = auth.uid(), so a successful read proves ownership.
  const supabase = await createClient()

  // D-08: validate the cookie value on every read.
  if (cookieValue) {
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('company_id', cookieValue)
      .maybeSingle()

    if (membership) {
      return membership.company_id as string
    }
    // Fall through to fallback — cookie is stale (company deleted or membership revoked).
  }

  // D-07: fallback — pick the user's most-recently-created membership.
  // ORDER BY companies.created_at DESC requires a JOIN; supabase-js exposes this via
  // foreign-table ordering. We select the join shape and pick the first row.
  const { data: memberships } = await supabase
    .from('company_members')
    .select('company_id, companies!inner(created_at)')
    .eq('user_id', userId)
    .order('created_at', { foreignTable: 'companies', ascending: false })
    .limit(1)

  const fallback = memberships?.[0]?.company_id as string | undefined
  if (!fallback) {
    // User has zero memberships — caller redirects to /onboarding.
    return null
  }

  // D-06: write the cookie on fallback. Wrapped in try/catch because some server
  // contexts (e.g. middleware-only paths / read-only RSC) cannot write cookies; we still
  // return the resolved id so the request can proceed.
  try {
    cookieStore.set(ACTIVE_COMPANY_COOKIE, fallback, ACTIVE_COMPANY_COOKIE_OPTIONS)
  } catch {
    // Server Components without a writable response cannot set cookies; that's fine —
    // the next request will hit fallback again until the cookie is written from a
    // server action or route handler context.
  }

  return fallback
}

/**
 * Loads the full AppCompany row for the active company id, cached by activeCompanyId
 * with tag 'company' (D-11 — tag wiring is in place; Phase 80 will call revalidateTag
 * on switch).
 *
 * Returns null when getActiveCompanyId() returns null (user has zero memberships).
 *
 * Mirrors getCachedCompany() shape from lib/queries/auth.ts but keyed by
 * activeCompanyId instead of userId.
 *
 * T-79-02-02: the activeCompanyId arg is validated upstream by getActiveCompanyId()
 * BEFORE it reaches the cached service-role lookup. Callers cannot pass an arbitrary
 * id because getActiveCompany() takes zero arguments.
 */
const loadCompanyById = unstable_cache(
  async (activeCompanyId: string): Promise<AppCompany | null> => {
    // unstable_cache cannot call cookies() — use the service client (D-09 pattern,
    // mirrors getCachedCompany). The activeCompanyId arg is already validated by
    // getActiveCompanyId(), so service-role bypass is safe (T-79-02-02).
    const supabase = requireServiceClient()
    const { data } = await supabase
      .from('companies')
      .select('id, name, logo_url, owner_name, theme_preference, industry, currency_code')
      .eq('id', activeCompanyId)
      .single()
    return (data as AppCompany) ?? null
  },
  ['active-company'],
  { revalidate: 60, tags: ['company'] }
)

export async function getActiveCompany(): Promise<AppCompany | null> {
  const activeCompanyId = await getActiveCompanyId()
  if (!activeCompanyId) return null
  return loadCompanyById(activeCompanyId)
}
