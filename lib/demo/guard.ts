import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDemoUserEmail } from './config'

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

/** True when the current session belongs to the shared demo user. */
export async function isDemoSession(): Promise<boolean> {
  const demoEmail = getDemoUserEmail()
  if (!demoEmail) return false
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = data?.claims?.email ?? null
  return !!email && email.toLowerCase() === demoEmail.toLowerCase()
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
export async function assertWritable(): Promise<DemoDenied | null> {
  return (await isDemoSession()) ? { error: DEMO_READONLY_MESSAGE } : null
}

/**
 * For route handlers: returns a 403 NextResponse when the caller is the demo
 * user, or null when the request may proceed:
 *
 *   const blocked = await demoGuardResponse()
 *   if (blocked) return blocked
 */
export async function demoGuardResponse(): Promise<NextResponse | null> {
  if (await isDemoSession()) {
    return NextResponse.json(
      {
        error: 'demo_readonly',
        message: 'This is a read-only demo. Create an account to make changes.',
      },
      { status: 403 }
    )
  }
  return null
}
