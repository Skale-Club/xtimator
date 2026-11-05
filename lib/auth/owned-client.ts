import 'server-only'
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireDataServiceClient } from '@/lib/supabase/data-service'
import { getOwnedAccount } from './owned-store'
import { issueDataToken, readOwnedSession, revokeOwnedSession, sessionClaims, SESSION_COOKIE, PENDING_COOKIE, RECOVERY_COOKIE, EMAIL_COOKIE, sessionCookieOptions, toUser } from './owned-session'

/** Preserve the data API/RLS contract while all identity operations are local. */
export function withOwnedAuth(client: SupabaseClient, auth: object): SupabaseClient {
  return new Proxy(client, {
    get(target, property) {
      if (property === 'auth') return auth
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const retired = async () => ({ data: { user: null, session: null }, error: { message: 'Use phone verification or Google sign-in.', code: 'passwordless_login_required' } })

export async function createOwnedClient() {
  const jar = await cookies()
  let sessionPromise: ReturnType<typeof readOwnedSession> | undefined
  const session = () => sessionPromise ??= readOwnedSession(jar.get(SESSION_COOKIE)?.value)
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
    accessToken: async () => { const value = await session(); return value ? issueDataToken(value) : null },
  })
  return withOwnedAuth(client, {
    getClaims: async () => { const value = await session(); return { data: value ? { claims: sessionClaims(value) } : null, error: null } },
    getUser: async () => { const value = await session(); return { data: { user: value ? toUser(value.account) : null }, error: null } },
    signOut: async ({ scope }: { scope?: string } = {}) => {
      const value = await session()
      await revokeOwnedSession(jar.get(SESSION_COOKIE)?.value, scope === 'others' ? value?.user_id : undefined)
      if (scope !== 'others') {
        for (const name of [SESSION_COOKIE, PENDING_COOKIE, RECOVERY_COOKIE, EMAIL_COOKIE]) jar.set(name, '', { ...sessionCookieOptions, maxAge: 0 })
        sessionPromise = Promise.resolve(null)
      }
      return { error: null }
    },
    updateUser: async (attributes: { data?: Record<string, unknown> }) => {
      const value = await session()
      if (!value) return { data: { user: null }, error: { message: 'Not authenticated' } }
      if (!attributes.data || Object.keys(attributes).some(key => key !== 'data')) return retired()
      const allowed = ['full_name', 'phone', 'avatar_url', 'avatar_position', 'company_name', 'subdomain']
      const patch = Object.fromEntries(Object.entries(attributes.data).filter(([key]) => allowed.includes(key)))
      const { error } = await requireDataServiceClient().from('xtimator_accounts').update({
        raw_user_meta_data: { ...value.account.raw_user_meta_data, ...patch }, updated_at: new Date().toISOString(),
      }).eq('id', value.user_id)
      const account = error ? null : await getOwnedAccount(value.user_id)
      sessionPromise = undefined
      return { data: { user: account ? toUser(account) : null }, error }
    },
    signUp: retired, signInWithPassword: retired, signInWithOAuth: retired,
    resetPasswordForEmail: retired, exchangeCodeForSession: retired, verifyOtp: retired,
  })
}

export function ownedAdminAuth(client: SupabaseClient) {
  return {
    admin: {
      getUserById: async (id: string) => { const account = await getOwnedAccount(id); return { data: { user: account ? toUser(account) : null }, error: null } },
      listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
        const size = Math.max(1, Math.min(1000, perPage))
        const { data, error, count } = await client.from('xtimator_accounts').select('*', { count: 'exact' }).order('created_at').range((page - 1) * size, page * size - 1)
        return { data: { users: (data ?? []).map(row => toUser(row)), total: count ?? 0 }, error }
      },
      deleteUser: async (id: string) => {
        // Local erasure only: never delete shared Firebase or legacy provider users.
        const { error } = await client.from('xtimator_accounts').delete().eq('id', id)
        return { data: { user: null }, error }
      },
      generateLink: retired,
    },
  }
}
