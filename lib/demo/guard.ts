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

export type DemoDenied = { error: 'demo_readonly' }

/**
 * For server actions: returns a standardized error object when the caller is
 * the demo user, or null when the write may proceed. Designed to match the
 * `{ error?: string }` return convention used across the action files:
 *
 *   const denied = await assertWritable()
 *   if (denied) return denied
 */
export async function assertWritable(): Promise<DemoDenied | null> {
  return (await isDemoSession()) ? { error: 'demo_readonly' } : null
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
