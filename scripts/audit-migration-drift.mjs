/**
 * Audit whether production's ACTUAL schema contains everything the local
 * migration files claim to create — independent of migration bookkeeping.
 *
 * WHY THIS EXISTS
 * ---------------
 * This project applies migrations manually (the deploy ships code only). Over
 * time that produced heavy drift in `supabase_migrations.schema_migrations`:
 * migrations applied via the Supabase MCP/dashboard get recorded under a fresh
 * auto-generated timestamp that does not match the local file's name, so
 * `supabase migration list --linked` shows the same change as BOTH a
 * "local-only" and a "remote-only" row. As of the 2026-07-27 audit that was
 * 68 local-only / 62 remote-only / 58 in-sync — which looks alarming and is
 * almost entirely bookkeeping noise.
 *
 * The bookkeeping therefore cannot answer the only question that matters:
 * *is anything the code depends on actually missing from production?*
 * This script answers that directly by parsing the DDL out of every migration
 * file and checking each object's existence in the live catalog.
 *
 * It is NOT a substitute for reading a migration — it verifies existence, not
 * definition (a column that exists with the wrong type/default still passes).
 * It also cannot verify data backfills, grants, or comments. Those are listed
 * separately as "unverifiable" so they are visible rather than silently
 * assumed.
 *
 * REAL BUG THIS CLASS ALREADY CAUSED: `company_price_book.image_position`
 * (migration 20260723000001) sat unapplied while `lib/queries/price-book.ts`
 * already selected it — every authenticated read failed with Postgres 42703,
 * so Price Book was broken for EVERY tenant in production for days. Nothing
 * caught it until a Phase 181 browser test happened to open the page.
 *
 * USAGE
 *   node scripts/audit-migration-drift.mjs            # human-readable report
 *   node scripts/audit-migration-drift.mjs --json     # machine-readable
 *   node scripts/audit-migration-drift.mjs --sql-only # just print the check SQL
 *
 * Requires DATABASE_URL (or SUPABASE_DB_URL) for the live check. Without one it
 * still prints the generated SQL so it can be pasted into the Supabase SQL
 * editor or run through the MCP `execute_sql` tool.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'supabase/migrations'
const JSON_OUT = process.argv.includes('--json')
const SQL_ONLY = process.argv.includes('--sql-only')

/** Tables deliberately dropped by a later migration — objects on them are expected to be absent. */
const DROPPED_TABLES = new Set(['company_whatsapp'])

/** Policies deliberately dropped by a later migration. `table :: policy` */
const DROPPED_POLICIES = new Set([
  'estimate_photos :: estimate_photos_anon_select_by_share_token',
])

function parseMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  const tables = new Map()
  const columns = new Map()
  const functions = new Map()
  const indexes = new Map()
  const policies = new Map()
  const unverifiable = []

  const add = (map, key, file) => {
    if (!map.has(key)) map.set(key, file)
  }

  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    // Strip line comments so commented-out DDL is not counted as real.
    const sql = raw.replace(/--.*$/gm, '')

    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi))
      add(tables, m[1], file)

    for (const m of sql.matchAll(
      /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?[\s\S]{0,120}?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi
    ))
      add(columns, `${m[1]}.${m[2]}`, file)

    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?/gi))
      add(functions, m[1], file)

    for (const m of sql.matchAll(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?\s+ON/gi
    ))
      add(indexes, m[1], file)

    for (const m of sql.matchAll(/CREATE\s+POLICY\s+"?([^"\n]+?)"?\s+ON\s+(?:public\.)?"?([a-z0-9_]+)"?/gi))
      add(policies, `${m[2]} :: ${m[1].trim()}`, file)

    // Effects this script cannot verify by existence alone.
    const effects = []
    if (/^\s*(INSERT|UPDATE|DELETE)\s+/im.test(sql)) effects.push('DATA')
    if (/SET\s+NOT\s+NULL/i.test(sql)) effects.push('NOT_NULL')
    if (/ADD\s+CONSTRAINT/i.test(sql)) effects.push('CONSTRAINT')
    if (/^\s*(GRANT|REVOKE)\s+/im.test(sql)) effects.push('GRANT')
    if (effects.length) unverifiable.push({ file, effects })
  }

  // Drop objects belonging to deliberately-removed tables/policies.
  for (const key of [...columns.keys()])
    if (DROPPED_TABLES.has(key.split('.')[0])) columns.delete(key)
  for (const key of [...policies.keys()])
    if (DROPPED_TABLES.has(key.split(' :: ')[0]) || DROPPED_POLICIES.has(key)) policies.delete(key)
  for (const key of [...tables.keys()]) if (DROPPED_TABLES.has(key)) tables.delete(key)

  return { tables, columns, functions, indexes, policies, unverifiable }
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function buildSql({ tables, columns, functions, indexes, policies }) {
  const parts = []
  if (tables.size)
    parts.push(`select 'TABLE' kind, t name from unnest(ARRAY[${[...tables.keys()].map(lit).join(',')}]) t
where not exists (select 1 from information_schema.tables where table_schema='public' and table_name=t)`)
  if (columns.size)
    parts.push(`select 'COLUMN', c from unnest(ARRAY[${[...columns.keys()].map(lit).join(',')}]) c
where not exists (select 1 from information_schema.columns
  where table_schema='public' and table_name=split_part(c,'.',1) and column_name=split_part(c,'.',2))`)
  if (functions.size)
    parts.push(`select 'FUNCTION', f from unnest(ARRAY[${[...functions.keys()].map(lit).join(',')}]) f
where not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=f)`)
  if (indexes.size)
    parts.push(`select 'INDEX', i from unnest(ARRAY[${[...indexes.keys()].map(lit).join(',')}]) i
where not exists (select 1 from pg_indexes where schemaname in ('public','storage') and indexname=i)`)
  if (policies.size) {
    const rows = [...policies.keys()]
      .map((k) => {
        const [t, p] = k.split(' :: ')
        return `(${lit(t)},${lit(p)})`
      })
      .join(',')
    parts.push(`select 'POLICY', v.t||' :: '||v.p from (values ${rows}) v(t,p)
where not exists (select 1 from pg_policies g
  where g.schemaname in ('public','storage') and g.tablename=v.t and g.policyname=v.p)`)
  }
  return parts.join('\nunion all\n') + '\norder by 1, 2;'
}

async function main() {
  const parsed = parseMigrations()
  const sql = buildSql(parsed)

  if (SQL_ONLY) {
    console.log(sql)
    return
  }

  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!url) {
    console.error('No DATABASE_URL/SUPABASE_DB_URL set — printing the check SQL instead.')
    console.error('Run it in the Supabase SQL editor (or via the MCP execute_sql tool).\n')
    console.log(sql)
    process.exitCode = 2
    return
  }

  let postgres
  try {
    postgres = (await import('postgres')).default
  } catch {
    console.error('The `postgres` package is not installed; re-run with --sql-only and paste the SQL.')
    process.exitCode = 2
    return
  }

  const client = postgres(url, { max: 1, idle_timeout: 5 })
  let missing
  try {
    missing = await client.unsafe(sql)
  } finally {
    await client.end({ timeout: 5 })
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ missing, unverifiable: parsed.unverifiable }, null, 2))
  } else {
    const counts = `${parsed.tables.size} tables, ${parsed.columns.size} columns, ${parsed.functions.size} functions, ${parsed.indexes.size} indexes, ${parsed.policies.size} policies`
    console.log(`Checked ${counts} declared across ${readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).length} migration files.\n`)
    if (!missing.length) {
      console.log('OK — every declared object exists in the target database.')
    } else {
      console.log(`MISSING (${missing.length}):`)
      for (const row of missing) console.log(`  ${row.kind.padEnd(8)} ${row.name}`)
    }
    console.log(
      `\n${parsed.unverifiable.length} migrations carry effects this script cannot verify ` +
        `(data backfills, grants, constraints, NOT NULL) — check those by hand when in doubt:`
    )
    for (const u of parsed.unverifiable) console.log(`  ${u.file}  [${u.effects.join(',')}]`)
  }

  if (missing?.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
