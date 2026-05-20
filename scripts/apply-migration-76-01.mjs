// One-off: apply 20260520000001_price_book_imports.sql + record in supabase_migrations.schema_migrations
// Used to bypass `supabase db push` issues with pre-existing diverged migration history.
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

const migrationVersion = '20260520000001'
const migrationName = 'price_book_imports'
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

  const tableExists = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='price_book_imports'",
  )
  if (tableExists.rows.length === 0) {
    throw new Error('price_book_imports table does NOT exist after apply')
  }
  console.log('Verified: public.price_book_imports exists.')
} finally {
  await client.end()
}
