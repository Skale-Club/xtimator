// One-off: apply 20260526000003_phase86_oauth_tables.sql + record in supabase_migrations.schema_migrations.
// Phase 86: OAuth 2.0 authorization-server tables.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config as loadEnv } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '..', '.env.local') })

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set in .env.local')
  process.exit(1)
}

// Force session-mode pooler (port 5432) to avoid transaction-pool prepared-statement collisions.
const sessionUrl = dbUrl.replace(/:6543\b/, ':5432')

const client = new pg.Client({ connectionString: sessionUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const migrationVersion = '20260526000003'
const migrationName = 'phase86_oauth_tables'
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

  // Verify all 4 tables exist
  const tables = ['oauth_clients', 'oauth_authorization_codes', 'oauth_access_tokens', 'oauth_refresh_tokens']
  for (const t of tables) {
    const r = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
      [t],
    )
    if (r.rows.length === 0) throw new Error(`public.${t} does NOT exist after apply`)
    console.log(`Verified: public.${t} exists.`)
  }

  // Verify RLS enabled on all 4
  const rlsCheck = await client.query(
    `SELECT relname, relrowsecurity
       FROM pg_class
      WHERE relname = ANY($1)
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')`,
    [tables],
  )
  for (const row of rlsCheck.rows) {
    if (!row.relrowsecurity) throw new Error(`RLS NOT enabled on public.${row.relname}`)
    console.log(`Verified: RLS enabled on public.${row.relname}`)
  }

  // Verify ZERO policies (deny-all)
  const polCount = await client.query(
    `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='public' AND tablename = ANY($1)`,
    [tables],
  )
  if (polCount.rows[0].n !== 0) {
    throw new Error(`Unexpected ${polCount.rows[0].n} policies on oauth_* tables (deny-all expected)`)
  }
  console.log(`Verified: 0 policies on oauth_* (deny-all).`)

  // Verify row counts (all zero on first apply)
  for (const t of tables) {
    const c = await client.query(`SELECT count(*)::int AS n FROM public.${t}`)
    console.log(`  ${t} row count: ${c.rows[0].n}`)
  }
} finally {
  await client.end()
}
