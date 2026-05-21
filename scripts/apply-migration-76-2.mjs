// Phase 76.2: apply/record 3 pending migrations for digital-signature/estimate-terms/deliveries
// Run: node scripts/apply-migration-76-2.mjs  (DATABASE_URL loaded from .env.local)
//
// This script is idempotent:
//   - If a migration is already recorded in schema_migrations → skip.
//   - If the migration's DDL was already applied outside of schema_migrations (manual apply or
//     prior partial run) → record the migration as complete without re-running the DDL.
//     We detect this by attempting the DDL in a savepoint; if it fails with "already exists"
//     errors we simply record the migration and move on.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load DATABASE_URL from .env.local if not already in env
if (!process.env.DATABASE_URL) {
  try {
    const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^DATABASE_URL=(.+)$/)
      if (match) {
        process.env.DATABASE_URL = match[1].trim()
        break
      }
    }
  } catch {
    // ignore if .env.local missing
  }
}

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not set — add it to .env.local or export it before running')
  process.exit(1)
}

// Force session-mode pooler (port 5432) to avoid transaction-pool prepared-statement collisions.
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
      console.log(`${version}_${name} — already recorded in schema_migrations, skipping.`)
      continue
    }

    const sqlPath = join(__dirname, '..', 'supabase', 'migrations', `${version}_${name}.sql`)
    const sql = readFileSync(sqlPath, 'utf8')
    console.log(`Applying ${version}_${name}…`)

    await client.query('BEGIN')
    try {
      // Try applying the full SQL. Use a SAVEPOINT so we can recover from
      // "already exists" errors that indicate the DDL was previously applied
      // outside schema_migrations tracking.
      await client.query('SAVEPOINT migration_apply')
      try {
        await client.query(sql)
        await client.query('RELEASE SAVEPOINT migration_apply')
        console.log(`  DDL applied successfully.`)
      } catch (ddlErr) {
        // If the error is "already exists" (42710 policy, 42P07 table, 42701 column)
        // the schema is already in place — roll back to savepoint and record as done.
        const alreadyExistsCodes = ['42710', '42P07', '42701']
        if (alreadyExistsCodes.includes(ddlErr.code)) {
          console.log(`  DDL already applied (${ddlErr.code}: ${ddlErr.message.split('\n')[0]}), recording migration record only.`)
          await client.query('ROLLBACK TO SAVEPOINT migration_apply')
          await client.query('RELEASE SAVEPOINT migration_apply')
        } else {
          throw ddlErr
        }
      }

      await client.query(
        'INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ($1, $2, $3)',
        [version, name, [sql]],
      )
      await client.query('COMMIT')
      console.log(`  Migration ${version}_${name} recorded.`)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }

  // Final verification: all 6 columns must exist on companies
  const colCheck = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'companies'
       AND column_name IN (
         'digital_signature_enabled','estimate_terms_enabled','estimate_terms_text',
         'email_delivery_enabled','sms_delivery_enabled','ai_model_override'
       )
     ORDER BY column_name`,
  )
  const found = colCheck.rows.map((r) => r.column_name)
  const expected = [
    'ai_model_override',
    'digital_signature_enabled',
    'email_delivery_enabled',
    'estimate_terms_enabled',
    'estimate_terms_text',
    'sms_delivery_enabled',
  ]
  const missing = expected.filter((c) => !found.includes(c))
  if (missing.length > 0) {
    throw new Error(`Column check failed — missing columns: ${missing.join(', ')}`)
  }
  console.log(`\nColumn verification passed: ${found.length}/6 columns present on companies table.`)
  console.log(`Columns: ${found.join(', ')}`)
  console.log('\nAll migrations applied/recorded successfully.')
} finally {
  await client.end()
}
