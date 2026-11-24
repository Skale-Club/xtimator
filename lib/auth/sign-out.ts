'use client'

import { signOut as legacySignOut } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'
import { ownedAuthEnabled } from './mode'
import { toast } from 'sonner'
import { OWNED_SIGN_OUT_STARTED, OWNED_SIGN_OUT_FAILED } from './browser-events'

export async function signOut() {
  if (!ownedAuthEnabled()) return legacySignOut()
  const client = createClient()
  window.dispatchEvent(new Event(OWNED_SIGN_OUT_STARTED))
  let result: Awaited<ReturnType<typeof client.auth.signOut>>
  try { result = await client.auth.signOut() }
  catch {
    window.dispatchEvent(new Event(OWNED_SIGN_OUT_FAILED))
    toast.error('Sign out failed. Please try again.')
    return
  }
  if (result.error) {
    window.dispatchEvent(new Event(OWNED_SIGN_OUT_FAILED))
    toast.error('Sign out failed. Please try again.')
    return
  }
  // Discard cached data tokens and client auth UI when the cookie is revoked.
  window.location.assign('/')
}
