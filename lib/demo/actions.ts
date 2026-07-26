'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function getDemoApexSignupUrl(): string {
  const raw = process.env.DEMO_APEX_ORIGIN?.trim()
  if (!raw) {
    throw new Error('DEMO_APEX_ORIGIN must be a configured apex HTTP(S) origin')
  }

  let apex: URL
  try {
    apex = new URL(raw)
  } catch {
    throw new Error('DEMO_APEX_ORIGIN must be a configured apex HTTP(S) origin')
  }

  const isProductionApex =
    apex.protocol === 'https:' &&
    apex.hostname === 'xtimator.com' &&
    apex.port === ''
  const isLocalApex =
    apex.protocol === 'http:' &&
    apex.hostname === 'localhost'
  const isRootOrigin =
    !apex.username &&
    !apex.password &&
    !apex.search &&
    !apex.hash &&
    apex.pathname === '/' &&
    apex.origin === raw.replace(/\/$/, '')

  let configuredDemoOrigin: string | null = null
  try {
    configuredDemoOrigin = process.env.DEMO_APP_ORIGIN
      ? new URL(process.env.DEMO_APP_ORIGIN).origin
      : null
  } catch {
    configuredDemoOrigin = null
  }

  if (
    !isRootOrigin ||
    (!isProductionApex && !isLocalApex) ||
    apex.origin === configuredDemoOrigin ||
    apex.hostname === 'demo.xtimator.com' ||
    apex.hostname === 'demo.localhost'
  ) {
    throw new Error('DEMO_APEX_ORIGIN must be a configured apex HTTP(S) origin')
  }

  return new URL('/?auth=signup', apex).toString()
}

/**
 * Ends the demo session and sends the visitor to the landing page with the
 * signup dialog open. Signing out first avoids the demo session conflicting
 * with the new account the visitor is about to create (Decision D09).
 */
export async function exitDemoToSignup() {
  const signupUrl = getDemoApexSignupUrl()
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect(signupUrl)
}
