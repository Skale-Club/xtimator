/**
 * Bootstrap a platform admin (first-admin chicken-and-egg: the /admin UI to add
 * admins is itself gated by platform_admins).
 *
 * Usage:
 *   node --env-file=.env.local scripts/grant-admin.mjs <email>
 *
 * Looks up the auth user by email and inserts a platform_admins row via the
 * service-role client. Idempotent: no-ops if the user is already an admin.
 */
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2] ?? process.env.ADMIN_EMAIL
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

if (!email) fail('Usage: node --env-file=.env.local scripts/grant-admin.mjs <email>')
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY')

const svc = createClient(url, key)

const { data: list, error: listErr } = await svc.auth.admin.listUsers({ perPage: 1000 })
if (listErr) fail(`Could not list auth users: ${listErr.message}`)

const user = list?.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
if (!user) fail(`No registered user with email "${email}". Log in to the app with that email first, then re-run.`)

const { data: existing } = await svc
  .from('platform_admins')
  .select('user_id')
  .eq('user_id', user.id)
  .maybeSingle()

if (existing) {
  console.log(`\n✓ ${email} is already a platform admin (${user.id}).\n`)
  process.exit(0)
}

const { error } = await svc.from('platform_admins').insert({
  user_id: user.id,
  notes: `Bootstrapped via grant-admin.mjs on ${new Date().toISOString()}`,
})
if (error) fail(`Insert failed: ${error.message}`)

console.log(`\n✓ Granted platform admin to ${email} (${user.id}).\n`)
