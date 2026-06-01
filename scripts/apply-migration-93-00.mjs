// One-off: apply 20260530000001_phase93_pipeline_attempts_view.sql + record in supabase_migrations.schema_migrations.
// Phase 93: Super Admin Event Log. Used because `supabase db push` is blocked by pre-existing
// remote migration-history drift (remote has versions absent from the local migrations dir).
// Mirrors scripts/apply-migration-92-00.mjs.
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

const migrationVersion = '20260530000001'
const migrationName = 'phase93_pipeline_attempts_view'
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

  // Verify view exists (using to_regclass)
  const vcheck = await client.query(
    "SELECT to_regclass('public.pipeline_attempts') AS oid",
  )
  if (!vcheck.rows[0]?.oid) throw new Error('public.pipeline_attempts view does NOT exist after apply')
  console.log('Verified: public.pipeline_attempts view exists.')
} finally {
  await client.end()
}
