// Phase 76.2: apply 3 pending migrations for digital-signature/estimate-terms/deliveries
// Run: DATABASE_URL=<your-url> node scripts/apply-migration-76-2.mjs
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbUrl = process.env.DATABASE_URL
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1) }

const sessionUrl = dbUrl.replace(/:6543\b/, ':5432')
const client = new pg.Client({ connectionString: sessionUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

const migrations = [
  { version: '20260519000002', name: 'digital_signature_and_estimate_terms' },
  { version: '20260519000003', name: 'estimate_deliveries' },
  { version: '20260520000001', name: 'companies_ai_model_override' },
]

try {
  for (const { version, name } of migrations) {
    const existing = await client.query(
      'SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1',
      [version],
    )
    if (existing.rows.length > 0) {
      console.log(`${version} already recorded — skip.`)
      continue
    }
    const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', `${version}_${name}.sql`), 'utf8')
    console.log(`Applying ${version}_${name}…`)
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
        [version, name, [sql]],
      )
      await client.query('COMMIT')
      console.log(`  ✓ done`)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }
  console.log('All migrations applied.')
} finally {
  await client.end()
}
