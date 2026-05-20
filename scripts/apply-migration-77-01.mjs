// One-off: apply 20260520000002_notifications_system.sql + record in supabase_migrations.schema_migrations
// Phase 77 plan 01.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

// Force session-mode pooler (port 5432) to avoid transaction-pool prepared-statement collisions.
const sessionUrl = dbUrl.replace(/:6543\b/, ':5432')

const client = new pg.Client({ connectionString: sessionUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const migrationVersion = '20260520000002'
const migrationName = 'notifications_system'
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', `${migrationVersion}_${migrationName}.sql`)
const migrationSql = readFileSync(migrationPath, 'utf8')

try {
  const existing = await client.query(
    'SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1',
    [migrationVersion],
  )
  if (existing.rows.length > 0) {
    console.log(`Migration ${migrationVersion} already recorded — skipping apply.`)
  } else {
    console.log(`Applying migration ${migrationVersion}_${migrationName}…`)
    await client.query('BEGIN')
    try {
      await client.query(migrationSql)
      await client.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
        [migrationVersion, migrationName, [migrationSql]],
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
    console.log('Migration applied and recorded.')
  }

  // Verify notifications table
  const notificationsExists = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications'",
  )
  if (notificationsExists.rows.length === 0) {
    throw new Error('public.notifications table does NOT exist after apply')
  }
  console.log('Verified: public.notifications exists.')

  // Verify notification_preferences table
  const prefsExists = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notification_preferences'",
  )
  if (prefsExists.rows.length === 0) {
    throw new Error('public.notification_preferences table does NOT exist after apply')
  }
  console.log('Verified: public.notification_preferences exists.')

  // Verify RLS enabled on both
  const rlsCheck = await client.query(
    `SELECT relname, relrowsecurity
       FROM pg_class
      WHERE relname IN ('notifications', 'notification_preferences')
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')`,
  )
  for (const row of rlsCheck.rows) {
    if (!row.relrowsecurity) {
      throw new Error(`RLS NOT enabled on public.${row.relname}`)
    }
    console.log(`Verified: RLS enabled on public.${row.relname}`)
  }

  // Verify SELECT policies present
  const policies = await client.query(
    `SELECT tablename, policyname, cmd FROM pg_policies
      WHERE schemaname='public'
        AND tablename IN ('notifications', 'notification_preferences')
      ORDER BY tablename, policyname`,
  )
  console.log(`Found ${policies.rows.length} RLS policies:`)
  for (const p of policies.rows) {
    console.log(`  - ${p.tablename}.${p.policyname} (${p.cmd})`)
  }
} finally {
  await client.end()
}
