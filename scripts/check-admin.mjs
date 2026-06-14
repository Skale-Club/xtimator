/**
 * Read-only diagnostic: reports whether an email's account is a platform admin
 * in the database pointed to by .env.local. Writes nothing.
 *
 * Usage: node --env-file=.env.local scripts/check-admin.mjs <email>
 */
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2] ?? 'skale.club@gmail.com'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase env')
  process.exit(1)
}

const svc = createClient(url, key)

const { count: adminCount } = await svc
  .from('platform_admins')
  .select('user_id', { count: 'exact', head: true })

const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 })
const user = list?.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())

console.log(`\nProject URL: ${url}`)
console.log(`Total platform_admins rows: ${adminCount ?? 'unknown'}`)

if (!user) {
  console.log(`Auth user for "${email}": NOT FOUND (no account with this email in this DB)`)
  process.exit(0)
}

const { data: row } = await svc
  .from('platform_admins')
  .select('user_id')
  .eq('user_id', user.id)
  .maybeSingle()

console.log(`Auth user for "${email}": found (${user.id})`)
console.log(`Is platform admin: ${row ? 'YES' : 'NO'}\n`)
