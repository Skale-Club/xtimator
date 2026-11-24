'use client'

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

type Snapshot = { user: User | null; accessToken: string | null; expiresAt?: number }
let singleton: SupabaseClient | undefined
let cached: Snapshot | undefined
let reading: Promise<Snapshot> | undefined
let generation = 0
let authChannel: BroadcastChannel | undefined
const listeners = new Set<(event: string, session: { user: User } | null) => void>()

export function invalidateOwnedBrowserSession() { ++generation; cached = undefined; reading = undefined }

async function readSnapshot(): Promise<Snapshot> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('Could not read session')
    return await response.json() as Snapshot
  } finally { clearTimeout(timer) }
}

async function snapshot(): Promise<Snapshot> {
  if (cached && (cached.expiresAt ?? 0) > Date.now() + 30_000) return cached
  if (reading) return reading
  const current = generation
  const request: Promise<Snapshot> = readSnapshot().then(value => {
    // A pre-logout/pre-switch response must never restore the old identity.
    if (current !== generation) return snapshot()
    cached = value
    return value
  }, error => {
    if (current !== generation) return snapshot()
    throw error
  }).finally(() => { if (reading === request) reading = undefined })
  reading = request
  return request
}

export function createOwnedBrowserClient(): SupabaseClient {
  if (singleton) return singleton
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
    accessToken: async () => (await snapshot()).accessToken,
  })
  const refresh = async () => {
    invalidateOwnedBrowserSession()
    try { const { user } = await snapshot(); listeners.forEach(listener => listener(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user } : null)) }
    catch { /* UI retries on the next foreground event; never fabricate a login. */ }
  }
  const retired = async () => ({ data: { user: null, session: null }, error: { message: 'Use phone verification or Google sign-in.', code: 'passwordless_login_required' } })
  const auth = {
    getUser: async () => ({ data: { user: (await snapshot()).user }, error: null }),
    getClaims: async () => { throw new Error('Read verified claims on the server') },
    onAuthStateChange: (listener: (event: string, session: { user: User } | null) => void) => {
      listeners.add(listener)
      return { data: { subscription: { unsubscribe: () => { listeners.delete(listener) } } } }
    },
    signOut: async () => {
      const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) return { error: { message: 'Sign out failed' } }
      // The confirmed revocation is authoritative. Do not launch another read
      // immediately before the caller replaces this document.
      invalidateOwnedBrowserSession()
      cached = { user: null, accessToken: null, expiresAt: Date.now() + 60_000 }
      listeners.forEach(listener => listener('SIGNED_OUT', null))
      // Reuse the receiving channel: BroadcastChannel excludes its sender,
      // while other documents still re-read their own server session.
      authChannel?.postMessage('changed')
      return { error: null }
    },
    signInWithOAuth: retired, signInWithPassword: retired, signUp: retired, updateUser: retired, resetPasswordForEmail: retired,
  }
  window.addEventListener('xtimator:auth', () => { void refresh() })
  window.addEventListener('focus', () => { void refresh() })
  // Messages carry no trusted identity or token; every update is read server-side.
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('xtimator-auth')
    authChannel = channel
    channel.onmessage = () => { void refresh() }
  }
  singleton = new Proxy(client, { get(target, property) {
    if (property === 'auth') return auth
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  return singleton
}
