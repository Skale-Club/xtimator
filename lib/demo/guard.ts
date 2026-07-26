import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { getDemoUserEmail, isDemoCompany } from './config'

/**
 * Read-only enforcement for the public demo (Decisions D04, D05).
 *
 * This is the application-layer half of a defense-in-depth strategy. The
 * database half (restrictive RLS policies that deny writes for the demo user)
 * is the hard guarantee for DB mutations. This guard additionally blocks paths
 * RLS cannot see — Inngest dispatches, external sends (email/SMS/WhatsApp),
 * payments, and storage uploads — and provides friendly errors before any
 * side effect is attempted.
 */

export type DemoWriteContext = {
  userId?: string | null
  email?: string | null
  companyId?: string | null
}

/**
 * Classifies either an explicit trusted context or the current request.
 *
 * Explicit contexts are used by non-cookie channels such as workers and
 * service-role funnels. With no argument, identity comes from verified Auth
 * claims and tenant state comes from the membership-validating active-company
 * resolver. Role metadata is deliberately absent: either demo signal wins.
 */
export async function isDemoContext(context?: DemoWriteContext): Promise<boolean> {
  let resolved = context

  if (resolved === undefined) {
    const supabase = await createClient()
    const [{ data }, companyId] = await Promise.all([
      supabase.auth.getClaims(),
      getActiveCompanyId(),
    ])
    const claims = data?.claims ?? null
    resolved = {
      userId: (claims?.sub as string | undefined) ?? null,
      email: (claims?.email as string | undefined) ?? null,
      companyId,
    }
  }

  const demoEmail = getDemoUserEmail()
  const emailMatches =
    !!demoEmail &&
    !!resolved.email &&
    resolved.email.toLowerCase() === demoEmail.toLowerCase()

  return emailMatches || isDemoCompany(resolved.companyId)
}

/** Backward-compatible request-session classifier. */
export async function isDemoSession(): Promise<boolean> {
  return isDemoContext()
}

/**
 * User-facing copy shown when a demo visitor attempts a write. Friendly on
 * purpose: the demo is a sales surface, so every blocked action nudges toward
 * signing up rather than reading like an error.
 */
export const DEMO_READONLY_MESSAGE =
  'This is a read-only demo. Create a free account to make changes.'

export type DemoDenied = { error: typeof DEMO_READONLY_MESSAGE }

/**
 * For server actions: returns a standardized error object when the caller is
 * the demo user, or null when the write may proceed. The `{ error }` shape
 * matches the convention used across most action files, so call sites can do:
 *
 *   const denied = await assertWritable()
 *   if (denied) return denied
 *
 * Action files that use a different result shape (e.g. `{ ok: false, error }`)
 * should branch on `isDemoSession()` directly and return their own shape.
 */
export async function assertWritable(
  context?: DemoWriteContext,
): Promise<DemoDenied | null> {
  return (await isDemoContext(context)) ? { error: DEMO_READONLY_MESSAGE } : null
}

/** Explicit company-only guard for trusted worker/service contexts. */
export async function assertCompanyWritable(
  companyId: string | null | undefined,
): Promise<DemoDenied | null> {
  return assertWritable({ companyId })
}

/**
 * For route handlers: returns a 403 NextResponse when the caller is the demo
 * user, or null when the request may proceed:
 *
 *   const blocked = await demoGuardResponse()
 *   if (blocked) return blocked
 */
export async function demoGuardResponse(): Promise<NextResponse | null> {
  if (await isDemoContext()) {
    return NextResponse.json(
      {
        error: 'demo_readonly',
        message: DEMO_READONLY_MESSAGE,
      },
      { status: 403 }
    )
  }
  return null
}
