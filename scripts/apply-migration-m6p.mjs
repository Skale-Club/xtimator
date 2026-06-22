/**
 * Applies the 260620-m6p migration directly via node-postgres.
 * Usage: node scripts/apply-migration-m6p.mjs
 * Requires: .env.local with DATABASE_URL (pooler URL — script converts to direct)
 */
import { readFileSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Load env
const dotenv = require('dotenv')
dotenv.config({ path: '.env.local' })

const { Client } = require('pg')

const poolerUrl = process.env.DATABASE_URL
if (!poolerUrl) {
  console.error('DATABASE_URL not set in .env.local')
  process.exit(1)
}

// Append ?pgbouncer=true to disable prepared statements on the pooler
const connectionUrl = poolerUrl.includes('?')
  ? `${poolerUrl}&pgbouncer=true`
  : `${poolerUrl}?pgbouncer=true`
console.log('Using pooler connection (pgbouncer=true mode)')

const sql = readFileSync(
  'supabase/migrations/20260620000001_company_whatsapp_multi_user.sql',
  'utf8'
)

const client = new Client({ connectionString: connectionUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('Connected to database')
  await client.query(sql)
  console.log('Migration 20260620000001_company_whatsapp_multi_user applied successfully')
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
