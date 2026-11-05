'use client'

import { signOut as legacySignOut } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'
import { ownedAuthEnabled } from './mode'

export async function signOut() {
  if (!ownedAuthEnabled()) return legacySignOut()
  const { error } = await createClient().auth.signOut()
  if (error) throw new Error('Sign out failed. Please try again.')
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('xtimator-auth'); channel.postMessage('changed'); channel.close() }
  // Discard cached data tokens and client auth UI when the cookie is revoked.
  window.location.assign('/')
}
