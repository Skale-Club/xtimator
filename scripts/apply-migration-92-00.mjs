// One-off: apply 20260529000001_phase92_pipeline_events.sql + record in supabase_migrations.schema_migrations.
// Phase 92: Pipeline Event Persistence. Used because `supabase db push` is blocked by pre-existing
// remote migration-history drift (remote has versions absent from the local migrations dir).
// Mirrors scripts/apply-migration-86-01.mjs.
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

const migrationVersion = '20260529000001'
const migrationName = 'phase92_pipeline_events'
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

  // Verify table exists
  const t = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pipeline_events'",
  )
  if (t.rows.length === 0) throw new Error('public.pipeline_events does NOT exist after apply')
  console.log('Verified: public.pipeline_events exists.')

  // Verify RLS enabled
  const rls = await client.query(
    `SELECT relrowsecurity FROM pg_class
      WHERE relname='pipeline_events'
        AND relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')`,
  )
  if (!rls.rows[0]?.relrowsecurity) throw new Error('RLS NOT enabled on public.pipeline_events')
  console.log('Verified: RLS enabled on public.pipeline_events')

  // Verify exactly one policy (super-admin SELECT only)
  const pols = await client.query(
    `SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='pipeline_events'`,
  )
  console.log(`Policies (${pols.rows.length}):`, pols.rows.map((r) => `${r.policyname}/${r.cmd}`).join(', '))
  if (pols.rows.length !== 1 || pols.rows[0].cmd !== 'SELECT') {
    throw new Error(`Expected exactly 1 SELECT policy (deny-all otherwise), got ${pols.rows.length}`)
  }

  // Verify 4 indexes
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='pipeline_events'`,
  )
  console.log(`Indexes (${idx.rows.length}):`, idx.rows.map((r) => r.indexname).join(', '))
} finally {
  await client.end()
}
