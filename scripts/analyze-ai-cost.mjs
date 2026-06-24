// Phase 116 CALIB-02 calibration analysis. Operator-run (NOT CI). Aggregates
// measured ai_cost_events real cost per operation_type, excluding NULL
// (unknown-cost) rows. Feed the means/p90 + a per-tier usage profile into the
// billing_config grant; confirm validateMarginInvariant passes; then flip
// enforcementEnabled per the CALIBRATION-RUNBOOK.
//
// Reads DATABASE_URL from .env.local ONLY (NEVER paste a connection string here).
// Forces the session-mode pooler (port 5432) to avoid transaction-pool
// prepared-statement collisions, mirroring scripts/check-pipeline-events-table.mjs.
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

try {
  await client.connect()

  // Aggregate MEASURED cost per operation_type. WHERE real_cost_usd IS NOT NULL is
  // load-bearing: NULL means the provider returned no cost (Gemini / unknown Whisper
  // rate) and must NEVER be coerced to 0 — including it would bias the mean toward
  // zero (Phase-110 null-vs-0 discipline). PERCENTILE_CONT gives median + p90 so the
  // operator can see skew (p90 >> mean → bursty cost; keep collecting).
  const { rows } = await client.query(`
    SELECT operation_type,
           COUNT(*) AS n,
           AVG(real_cost_usd) AS mean_usd,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY real_cost_usd) AS median_usd,
           PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY real_cost_usd) AS p90_usd
    FROM public.ai_cost_events
    WHERE real_cost_usd IS NOT NULL
    GROUP BY operation_type
    ORDER BY operation_type
  `)

  if (rows.length === 0) {
    console.log('No measured ai_cost_events rows yet (real_cost_usd IS NOT NULL returned 0 rows).')
    console.log('Keep running measure-only (enforcement OFF) in production until each billed op has a representative sample.')
  } else {
    console.table(rows)
  }
  process.exit(0)
} catch (err) {
  console.error('analyze-ai-cost failed:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
