// Phase 92 post-push smoke check: confirm public.pipeline_events reached the remote DB.
// Runs SELECT to_regclass('public.pipeline_events') and exits non-zero if null.
// psql is not assumed present on this Windows box — Node pg is the deterministic gate.
// Mirrors the pg client + .env.local loader pattern in scripts/apply-migration-*.mjs.
import pg from 'pg'
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

try {
  const { rows } = await client.query("SELECT to_regclass('public.pipeline_events') AS reg")
  const reg = rows[0]?.reg
  if (!reg) {
    console.error('pipeline_events NOT present on remote (to_regclass returned null) — migration did not reach the remote DB')
    process.exit(1)
  }
  console.log('pipeline_events present on remote')
  process.exit(0)
} finally {
  await client.end()
}
