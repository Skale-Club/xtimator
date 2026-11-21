#!/usr/bin/env node
// supabase/audits/check-feature-switches.mjs
// Behavior checks for the three feature-switch migrations and for the companies
// INSERT guard, run on a REAL PostgreSQL database inside ONE transaction that is
// always rolled back.
//
//   20261121140000_company_feature_switches.sql
//   20261121150000_invoice_stripe_account.sql
//   20261121160000_invoice_refunds.sql
//   20261121170000_protect_company_billing_columns_on_insert.sql  (independent)
//
// Nothing is ever kept: the script opens a transaction, creates throwaway rows
// (user, company, project, estimate, invoice), runs every check and ends with a
// rollback, including when a check or the connection throws. It never makes the
// transaction permanent. lock_timeout (3s) and statement_timeout (15s) are set
// first so it can never sit on locks of a busy database.
//
// Usage (from the repo root):
//   node supabase/audits/check-feature-switches.mjs --yes
//   node supabase/audits/check-feature-switches.mjs --yes --allow-production
//   node supabase/audits/check-feature-switches.mjs --yes --only=insert-guard
//
// --yes                 required. Without it the script prints the target and exits.
// --allow-production    required when the target is, or might be, production.
// --only=insert-guard   run only the companies INSERT guard checks (migration
//                       20261121170000). Use it on a database that does not have
//                       the feature-switch migrations yet, e.g. today's production
//                       schema. Without the flag everything runs, and the
//                       feature-switch checks degrade to SKIP on their own when
//                       their columns are missing but the insert guard is there.
//                       If the insert guard is missing, the tenant probe reports
//                       "GAP OPEN" as INFO (never FAIL).
//
// Connection string, same order as scripts/apply-migrations.mjs:
// MIGRATION_DATABASE_URL, then POSTGRES_URL_NON_POOLING, then DATABASE_URL
// (environment first, then .env.local, then .env). Only host, port and database
// name are ever printed, never the password and never the URL.
//
// Exit codes: 0 no check failed, 1 at least one FAIL, 2 refused or could not run.

import { readFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Same .env reading as scripts/apply-migrations.mjs (the environment wins).
for (const candidate of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(resolve(repoRoot, candidate), 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {}
}

const args = process.argv.slice(2)
const has = (flag) => args.includes(flag)
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice('--only='.length) : null

// The one Supabase project this repo ever used. It served dev AND production
// until the Coolify cutover (supabase/PROD-BOOTSTRAP.md, docs/runbooks/db-to-coolify.md)
// and is now the frozen production copy, so it is NOT treated as a dev database.
const LEGACY_SHARED_SUPABASE_REF = 'prmqgcrnpuvpzruyzvuv'

function describeTarget(connectionString) {
  const u = new URL(connectionString)
  return { host: u.hostname, port: u.port || '5432', database: u.pathname.replace(/^\//, '') || '(default)', user: decodeURIComponent(u.username) }
}

// Conservative: production unless the host is clearly a Supabase project that is
// NOT the shared legacy project. Anything else (Coolify, self-hosted, unknown,
// a project ref we cannot read) counts as production.
function classifyTarget(t) {
  const isSupabaseHost = /\.supabase\.(co|com)$/i.test(t.host)
  if (!isSupabaseHost) return { production: true, why: 'host is not a Supabase host (Coolify or self-hosted counts as production)' }
  const mentionsLegacy = t.host.includes(LEGACY_SHARED_SUPABASE_REF) || t.user.includes(LEGACY_SHARED_SUPABASE_REF)
  if (mentionsLegacy) return { production: true, why: 'this is the legacy shared Supabase project (served dev and production, now the frozen production copy)' }
  const ref = t.host.match(/^db\.([a-z0-9]+)\.supabase\.(?:co|com)$/i)?.[1] ?? t.user.match(/^postgres\.([a-z0-9]+)$/i)?.[1]
  if (!ref) return { production: true, why: 'Supabase host but the project ref could not be read' }
  return { production: false, why: `Supabase project ${ref}, not the legacy shared project` }
}

// ─── result bookkeeping ──────────────────────────────────────────────────────
const results = { PASS: 0, FAIL: 0, SKIP: 0, INFO: 0 }
function report(status, name, detail) {
  results[status]++
  console.log(`${status.padEnd(4)}  ${name}${detail ? `\n      ${String(detail).replace(/\n/g, '\n      ')}` : ''}`)
}
const pass = (name) => report('PASS', name)
const fail = (name, expected, got) => report('FAIL', name, `expected: ${expected}\ngot:      ${got}`)
const skip = (name, why) => report('SKIP', name, why)
const info = (name, detail) => report('INFO', name, detail)
const errText = (e) => `${e?.code ?? 'no-code'} ${String(e?.message ?? e).split('\n')[0]}`

function qi(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`
}

async function main() {
  if (only !== null && only !== 'insert-guard') {
    console.error(`Unknown --only value "${only}". The only supported value is --only=insert-guard.`)
    process.exit(2)
  }
  const connectionString =
    process.env.MIGRATION_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL
  if (!connectionString) {
    console.error('No connection string. Set MIGRATION_DATABASE_URL, POSTGRES_URL_NON_POOLING or DATABASE_URL.')
    process.exit(2)
  }
  let target
  try {
    target = describeTarget(connectionString)
  } catch {
    console.error('The connection string is unreadable, refusing to run.')
    process.exit(2)
  }
  const kind = classifyTarget(target)
  console.log(`target:  ${target.host}:${target.port}/${target.database}`)
  console.log(`class:   ${kind.production ? 'PRODUCTION (or unknown)' : 'development'}: ${kind.why}`)
  console.log('mode:    one transaction, lock_timeout 3s, statement_timeout 15s, always rolled back')
  console.log(`scope:   ${only === 'insert-guard' ? 'insert guard only (--only=insert-guard)' : 'everything (feature switches degrade to SKIP when their columns are missing)'}`)

  if (!has('--yes')) {
    console.error('\nRefusing to run without --yes. Check the target above, then add --yes.')
    process.exit(2)
  }
  if (kind.production && !has('--allow-production')) {
    console.error('\nRefusing to run against production (or an unknown target) without --allow-production.')
    console.error('The checks roll back, but production is still not the place to run them by accident.')
    process.exit(2)
  }

  const client = new pg.Client({ connectionString })
  try {
    await client.connect()
  } catch (e) {
    console.error(`Could not connect: ${e?.message ?? e}`)
    process.exit(2)
  }

  let began = false
  try {
    await client.query('BEGIN')
    began = true
    await client.query("SET LOCAL lock_timeout = '3s'")
    await client.query("SET LOCAL statement_timeout = '15s'")
    console.log('')
    await runChecks(client)
  } catch (e) {
    report('FAIL', 'script error (a check could not run)', errText(e))
  } finally {
    if (began) await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
  }

  console.log(`\nSUMMARY: PASS=${results.PASS} FAIL=${results.FAIL} SKIP=${results.SKIP} INFO=${results.INFO} (transaction rolled back)`)
  process.exit(results.FAIL > 0 ? 1 : 0)
}

// ─── helpers that talk to the database ───────────────────────────────────────
// Runs fn inside a savepoint. An error inside fn rolls back to the savepoint, so
// the transaction stays usable. Returns { ok, value | error }.
let spCounter = 0
async function attempt(client, fn) {
  const sp = `chk_${++spCounter}`
  await client.query(`SAVEPOINT ${sp}`)
  try {
    const value = await fn()
    await client.query(`RELEASE SAVEPOINT ${sp}`)
    return { ok: true, value }
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
    await client.query(`RELEASE SAVEPOINT ${sp}`)
    return { ok: false, error }
  }
}

// Reads the NOT NULL columns without a default of a table (as the connecting
// role, before any SET ROLE) so a minimal INSERT can be built from the real
// schema instead of from guesses.
async function requiredColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, udt_schema, udt_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
        AND is_nullable = 'NO' AND column_default IS NULL
        AND is_generated = 'NEVER' AND coalesce(identity_generation, '') <> 'ALWAYS'
      ORDER BY ordinal_position`,
    [schema, table],
  )
  return rows
}

// Builds INSERT text + values. `overrides` wins; every other required column is
// filled with a neutral value of its type. Columns this cannot fill (foreign
// keys, odd CHECKs) make the INSERT fail, and the caller degrades to SKIP.
function buildInsert(qualifiedTable, required, overrides, returning) {
  const cols = []
  const exprs = []
  const values = []
  const add = (col, expr) => { cols.push(qi(col)); exprs.push(expr) }
  for (const [col, val] of Object.entries(overrides)) {
    values.push(val)
    add(col, `$${values.length}`)
  }
  for (const c of required) {
    if (c.column_name in overrides) continue
    switch (c.data_type) {
      case 'uuid': add(c.column_name, 'gen_random_uuid()'); break
      case 'text': case 'character varying': case 'character':
        values.push(`check-fs-${randomBytes(4).toString('hex')}`); add(c.column_name, `$${values.length}`); break
      case 'integer': case 'bigint': case 'smallint': case 'numeric': case 'real': case 'double precision':
        add(c.column_name, '0'); break
      case 'boolean': add(c.column_name, 'false'); break
      case 'date': add(c.column_name, 'current_date'); break
      case 'jsonb': case 'json': add(c.column_name, "'{}'"); break
      case 'ARRAY': add(c.column_name, "'{}'"); break
      case 'USER-DEFINED':
        add(c.column_name, `(SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = '${c.udt_schema.replace(/'/g, "''")}' AND t.typname = '${c.udt_name.replace(/'/g, "''")}' ORDER BY e.enumsortorder LIMIT 1)::text::${qi(c.udt_schema)}.${qi(c.udt_name)}`)
        break
      default:
        if (c.data_type.startsWith('timestamp')) add(c.column_name, 'now()')
        else add(c.column_name, 'NULL') // fails loudly, caller degrades to SKIP
    }
  }
  const [schema, table] = qualifiedTable.split('.')
  return {
    text: `INSERT INTO ${qi(schema)}.${qi(table)} (${cols.join(', ')}) VALUES (${exprs.join(', ')})${returning ? ` RETURNING ${returning}` : ''}`,
    values,
  }
}

async function insertRow(client, meta, qualifiedTable, overrides, returning) {
  const q = buildInsert(qualifiedTable, meta[qualifiedTable] ?? [], overrides, returning)
  return client.query(q.text, q.values)
}

// Columns the BEFORE UPDATE guard protects (20260823000005), minus user_id, and
// the values the insert guard must NOT let a client role keep. A column that does
// not exist on the target database is left out of the probe.
const GUARDED_ON_INSERT = {
  tier: 'business',
  tier_trial_ends_at: '2030-01-01T00:00:00Z',
  tier_renews_at: '2030-01-01T00:00:00Z',
  tier_cancelled_at: '2030-01-01T00:00:00Z',
  credit_balance: 1000000,
  byok_enabled: true,
  byok_openrouter_key: 'check-fs-key',
  byok_key_last4: 'abcd',
  stripe_customer_id: () => `cus_check_${randomBytes(4).toString('hex')}`,
  stripe_subscription_id: () => `sub_check_${randomBytes(4).toString('hex')}`,
  stripe_subscription_status: 'active',
  stripe_subscription_interval: 'year',
  stripe_account_id: () => `acct_check_${randomBytes(4).toString('hex')}`,
  stripe_connect_status: 'active',
  stripe_connected_at: '2030-01-01T00:00:00Z',
  stripe_account_email: 'check@example.test',
  stripe_account_display_name: 'check-fs',
  stripe_charges_enabled: true,
  stripe_connect_disabled_reason: 'check-fs',
  auto_topup_enabled: true,
  auto_topup_threshold_credits: 7,
  auto_topup_pack_index: 2,
  auto_topup_pack_price_cents: 4900,
  auto_topup_pack_credits: 5000,
  auto_topup_in_flight_until: '2030-01-01T00:00:00Z',
  auto_topup_last_failed_at: '2030-01-01T00:00:00Z',
  auto_topup_last_charge_attempt_at: '2030-01-01T00:00:00Z',
  ai_model_override: 'check-fs-model',
  demo_estimate_quota: 99,
}
const INSERT_GUARD_TRIGGER = 'companies_protect_billing_columns_on_insert'

// ─── the checks ──────────────────────────────────────────────────────────────
async function runChecks(client) {
  const who = (await client.query('SELECT current_user AS u, session_user AS s')).rows[0]
  info('connected as', `current_user=${who.u}, session_user=${who.s}`)
  if (['anon', 'authenticated'].includes(who.u)) {
    skip('everything', 'connected as a client role (anon/authenticated); the guard would block the owner-side checks. Use the table owner or service role.')
    return
  }

  const columnInfo = async (table, column) =>
    (await client.query(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column],
    )).rows[0]

  // What is installed on this database decides what can be checked.
  const guardTrigger = (await client.query(
    `SELECT tgtype FROM pg_trigger
      WHERE tgrelid = 'public.companies'::regclass AND tgname = $1 AND NOT tgisinternal`, [INSERT_GUARD_TRIGGER])).rows[0]
  const guardInstalled = guardTrigger !== undefined
  const featureColumnsInstalled = Boolean(await columnInfo('companies', 'online_payments_allowed'))
  let runFeatures = only !== 'insert-guard'
  if (!runFeatures) {
    info('scope', '--only=insert-guard: the feature-switch checks are not run')
  } else if (!featureColumnsInstalled && guardInstalled) {
    skip('feature-switch checks (schema, backfill, owner, tenant, invoices)',
      'the feature-switch columns are missing (migrations 20261121140000 to 20261121160000 not applied) but the insert guard is installed; only the insert guard checks run. Pass --only=insert-guard to say so explicitly.')
    runFeatures = false
  }

  // ── Schema ────────────────────────────────────────────────────────────────
  const present = {}
  if (runFeatures) {
    const wanted = [
      ['companies', 'online_payments_allowed', 'boolean', 'NO', 'false'],
      ['companies', 'online_payments_enabled', 'boolean', 'NO', 'false'],
      ['companies', 'digital_signature_allowed', 'boolean', 'NO', 'true'],
      ['invoices', 'stripe_account_id', 'text', 'YES', null],
      ['invoices', 'refunded_cents', 'integer', 'NO', '0'],
      ['invoices', 'refunded_at', 'timestamp with time zone', 'YES', null],
    ]
    for (const [table, column, type, nullable, def] of wanted) {
      const name = `schema: ${table}.${column}`
      const row = await columnInfo(table, column)
      present[`${table}.${column}`] = Boolean(row)
      if (!row) { fail(name, `column exists (${type}, nullable=${nullable}, default=${def})`, 'column is missing (migration not applied?)'); continue }
      const defaultOk = def === null ? row.column_default === null : String(row.column_default ?? '').replace(/::\w+/g, '') === def
      if (row.data_type === type && row.is_nullable === nullable && defaultOk) pass(name)
      else fail(name, `${type}, nullable=${nullable}, default=${def}`, `${row.data_type}, nullable=${row.is_nullable}, default=${row.column_default}`)
    }

    // Guard function and trigger.
    {
      const name = 'schema: protect_company_billing_columns guards both platform switches'
      const r = await client.query(
        `SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'protect_company_billing_columns'`,
      )
      const src = r.rows[0]?.prosrc
      if (!src) fail(name, 'function exists', 'function not found')
      else if (src.includes('online_payments_allowed') && src.includes('digital_signature_allowed')) pass(name)
      else fail(name, 'source mentions online_payments_allowed and digital_signature_allowed', `online_payments_allowed=${src.includes('online_payments_allowed')}, digital_signature_allowed=${src.includes('digital_signature_allowed')}`)
    }
    {
      const name = 'schema: trigger companies_platform_switch_insert_defaults is BEFORE INSERT on companies'
      const r = await client.query(
        `SELECT tgtype FROM pg_trigger
          WHERE tgrelid = 'public.companies'::regclass AND tgname = 'companies_platform_switch_insert_defaults' AND NOT tgisinternal`,
      )
      const t = r.rows[0]?.tgtype
      if (t === undefined) fail(name, 'trigger exists', 'trigger not found')
      else if ((t & 2) === 2 && (t & 4) === 4 && (t & 1) === 1) pass(name)
      else fail(name, 'BEFORE (2) + INSERT (4) + ROW (1) bits', `tgtype=${t}`)
    }
  }

  // Insert guard (20261121170000): installed or not is information, the tenant
  // probe below decides pass or fail.
  {
    const name = `schema: trigger ${INSERT_GUARD_TRIGGER} is BEFORE INSERT on companies`
    const t = guardTrigger?.tgtype
    if (!guardInstalled) info(name, 'GAP OPEN: migration 20261121170000 not applied (trigger not found)')
    else if ((t & 2) === 2 && (t & 4) === 4 && (t & 1) === 1) pass(name)
    else fail(name, 'BEFORE (2) + INSERT (4) + ROW (1) bits', `tgtype=${t}`)
  }

  // ── Backfill (before any seed row exists) ─────────────────────────────────
  if (runFeatures) {
    if (present['companies.online_payments_allowed'] && present['companies.online_payments_enabled']) {
      // The migration backfills only on its FIRST application and skips companies
      // whose Stripe account is disconnected. A non-zero count is therefore
      // expected once a super admin or an owner switched payments off afterwards.
      const name = 'backfill: Stripe-linked, not disconnected companies with a payments switch off'
      const r = (await client.query(
        `SELECT count(*) FILTER (WHERE stripe_account_id IS NOT NULL)::int AS linked,
                count(*) FILTER (WHERE stripe_account_id IS NOT NULL
                                   AND stripe_connect_status IS DISTINCT FROM 'disconnected'
                                   AND (online_payments_allowed = false OR online_payments_enabled = false))::int AS off
           FROM public.companies`,
      )).rows[0]
      info('backfill: companies with a Stripe account linked', String(r.linked))
      if (r.off === 0) pass(name)
      else info(name, `${r.off}. Expected once a super admin or an owner has switched payments off after the migration (the backfill runs only the first time); compare with the admin audit log only if the number is a surprise.`)
    } else {
      skip('backfill', 'payments columns are missing')
    }
  }

  // ── Seed throwaway rows ───────────────────────────────────────────────────
  const meta = {}
  const metaTables = runFeatures
    ? ['public.companies', 'public.projects', 'public.estimates', 'public.invoices', 'public.xtimator_sessions', 'public.xtimator_accounts', 'auth.users']
    : ['public.companies', 'public.xtimator_sessions', 'public.xtimator_accounts', 'auth.users']
  for (const t of metaTables) {
    const [s, n] = t.split('.')
    meta[t] = await requiredColumns(client, s, n)
  }
  const fk = (await client.query(
    `SELECT c.confrelid::regclass::text AS target FROM pg_constraint c
      WHERE c.conrelid = 'public.companies'::regclass AND c.contype = 'f'
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.companies'::regclass AND attname = 'user_id')]`,
  )).rows[0]?.target
  // regclass::text drops the schema for names on the search_path.
  const userTable = fk === 'xtimator_accounts' || fk === 'public.xtimator_accounts' ? 'public.xtimator_accounts'
    : fk === 'users' || fk === 'auth.users' ? 'auth.users' : null

  const userId = randomUUID()
  let companyId = null, projectId = null, invoiceId = null, sessionId = null
  const seedFail = (what, e) => skip(`seed: ${what}`, `could not create the throwaway row, dependent checks are skipped (${errText(e)})`)

  const rUser = userTable
    ? await attempt(client, () => insertRow(client, meta, userTable, { id: userId }))
    : { ok: false, error: new Error(`companies.user_id references an unexpected table (${fk})`) }
  if (!rUser.ok) seedFail('user', rUser.error)
  else {
    const rCo = await attempt(client, () => insertRow(client, meta, 'public.companies', { user_id: userId, name: 'check-feature-switches' }, 'id'))
    if (!rCo.ok) seedFail('company', rCo.error)
    else {
      companyId = rCo.value.rows[0].id
      const rMember = await attempt(client, () => client.query(
        'INSERT INTO public.company_members (user_id, company_id, role) VALUES ($1, $2, $3)', [userId, companyId, 'owner']))
      if (!rMember.ok) seedFail('company_members row (tenant visibility relies on user_id only)', rMember.error)
      if (runFeatures) {
        const rPrj = await attempt(client, () => insertRow(client, meta, 'public.projects', { company_id: companyId, name: 'check-feature-switches' }, 'id'))
        if (!rPrj.ok) seedFail('project', rPrj.error)
        else {
          projectId = rPrj.value.rows[0].id
          const rEst = await attempt(client, () => insertRow(client, meta, 'public.estimates', { project_id: projectId, company_id: companyId }, 'id'))
          if (!rEst.ok) seedFail('estimate', rEst.error)
          else {
            const rInv = await attempt(client, () => insertRow(client, meta, 'public.invoices', {
              estimate_id: rEst.value.rows[0].id, company_id: companyId, kind: 'full', amount_cents: 1000, currency_code: 'USD',
            }, 'id'))
            if (!rInv.ok) seedFail('invoice', rInv.error)
            else invoiceId = rInv.value.rows[0].id
          }
        }
      }
    }
  }

  // Guarded columns that exist on this database (the probe uses only these).
  const guardedCols = []
  for (const col of Object.keys(GUARDED_ON_INSERT)) if (await columnInfo('companies', col)) guardedCols.push(col)

  // ── Owner side (the connecting role) ──────────────────────────────────────
  if (!companyId) {
    skip('owner: service role / table owner insert guard and switches', 'no test company')
  } else {
    // The insert guard must leave the service role and table owner alone.
    {
      const name = 'owner: service role / table owner INSERT with tier=pro, credit_balance=500 keeps the values'
      const r = await attempt(client, async () => {
        const i = await insertRow(client, meta, 'public.companies',
          { user_id: userId, name: 'check-feature-switches-owner-insert', tier: 'pro', credit_balance: 500 }, 'tier, credit_balance')
        const row = i.rows[0]
        throw Object.assign(new Error('__expected_rollback__'), { row })
      })
      if (!r.ok && r.error.message === '__expected_rollback__') {
        const row = r.error.row
        if (row.tier === 'pro' && Number(row.credit_balance) === 500) pass(name)
        else fail(name, 'tier=pro, credit_balance=500', JSON.stringify(row))
      } else fail(name, 'insert succeeds and the values stick', r.ok ? 'unexpected success path' : errText(r.error))
    }
    if (runFeatures) {
      const name = 'owner: service role / table owner can set online_payments_allowed = true and digital_signature_allowed = false'
      const r = await attempt(client, async () => {
        const u = await client.query(
          'UPDATE public.companies SET online_payments_allowed = true, digital_signature_allowed = false WHERE id = $1 RETURNING online_payments_allowed AS a, digital_signature_allowed AS s',
          [companyId])
        if (u.rowCount !== 1) throw new Error(`updated ${u.rowCount} rows`)
        if (u.rows[0].a !== true || u.rows[0].s !== false) throw new Error(`values after update: ${JSON.stringify(u.rows[0])}`)
        throw new Error('__expected_rollback__') // undo the flip so the tenant checks start from the defaults
      })
      if (!r.ok && r.error.message === '__expected_rollback__') pass(name)
      else fail(name, 'update succeeds and the values stick', errText(r.error))
    }
  }

  // refunded_cents CHECK (needs an invoice, owner side).
  if (runFeatures) {
    if (!invoiceId || !present['invoices.refunded_cents']) {
      skip('schema: refunded_cents CHECK rejects a negative value', 'no test invoice or column missing')
    } else {
      const name = 'schema: refunded_cents CHECK rejects a negative value'
      const r = await attempt(client, () => client.query('UPDATE public.invoices SET refunded_cents = -1 WHERE id = $1', [invoiceId]))
      if (!r.ok && r.error.code === '23514') pass(name)
      else if (r.ok) fail(name, 'SQLSTATE 23514 (check_violation)', 'the update with -1 was accepted')
      else fail(name, 'SQLSTATE 23514 (check_violation)', errText(r.error))
    }
  }

  // ── Tenant side ───────────────────────────────────────────────────────────
  if (!companyId) {
    skip('tenant: all checks', 'no test company could be created')
  } else {
    const roleOk = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'")).rowCount === 1
    if (!roleOk) {
      skip('tenant: all checks', "role 'authenticated' does not exist on this database")
    } else {
      // Owned-identity databases validate a session: iss 'xtimator' + a live row
      // in xtimator_sessions (xtimator_session_active, 20261105000001). Use it
      // when the account exists there; otherwise use a plain legacy claim set.
      const acct = (await client.query(
        "SELECT to_regclass('public.xtimator_accounts') IS NOT NULL AS has_t").catch(() => ({ rows: [{ has_t: false }] }))).rows[0].has_t
        ? (await client.query('SELECT 1 FROM public.xtimator_accounts WHERE id = $1', [userId])).rowCount === 1 : false
      if (acct && meta['public.xtimator_sessions'].length >= 0) {
        const rs = await attempt(client, async () => {
          sessionId = randomUUID()
          await insertRow(client, meta, 'public.xtimator_sessions', {
            id: sessionId, user_id: userId, token_hash: randomBytes(16).toString('hex'),
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          })
        })
        if (!rs.ok) { sessionId = null; info('tenant identity', `could not create an xtimator session, using legacy claims (${errText(rs.error)})`) }
      }
      const claims = { sub: userId, role: 'authenticated', aud: 'authenticated', ...(sessionId ? { iss: 'xtimator', session_id: sessionId } : {}) }
      await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true)",
        [JSON.stringify(claims), userId])
      const setRole = await attempt(client, () => client.query('SET LOCAL ROLE authenticated'))
      if (!setRole.ok) {
        skip('tenant: all checks', `cannot SET ROLE authenticated from this connection (${errText(setRole.error)})`)
      } else {
        try {
          await tenantChecks(client, { userId, companyId, invoiceId, meta, sessionId, runFeatures, guardInstalled, guardedCols })
        } finally {
          await client.query('RESET ROLE').catch(() => {})
        }
      }
    }
  }

  // ── Information only ──────────────────────────────────────────────────────
  try {
    if (runFeatures && present['companies.digital_signature_allowed']) {
      const r = (await client.query(
        `SELECT count(*) FILTER (WHERE digital_signature_enabled)::int AS sig_on,
                count(*) FILTER (WHERE stripe_account_id IS NOT NULL)::int AS linked
           FROM public.companies WHERE id IS DISTINCT FROM $1`, [companyId])).rows[0]
      info('companies with digital_signature_enabled = true', String(r.sig_on))
      info('companies with a Stripe account linked', String(r.linked))
      const by = (await client.query(
        `SELECT coalesce(stripe_connect_status, '(null)') AS s, count(*)::int AS n
           FROM public.companies WHERE stripe_account_id IS NOT NULL AND id IS DISTINCT FROM $1 GROUP BY 1 ORDER BY 1`, [companyId])).rows
      info('linked companies by stripe_connect_status', by.length ? by.map((x) => `${x.s}=${x.n}`).join(', ') : 'none')
    }
  } catch (e) {
    skip('info: counts', errText(e))
  }
}

async function tenantChecks(client, { userId, companyId, invoiceId, meta, runFeatures, guardInstalled, guardedCols }) {
  const T = 'tenant:'
  // Identity simulation sanity check: without it every result below is noise.
  const who = await attempt(client, async () => (await client.query(
    'SELECT auth.uid()::text AS uid, (SELECT count(*) FROM public.companies WHERE id = $1)::int AS visible', [companyId])).rows[0])
  if (!who.ok || who.value.uid !== userId || who.value.visible !== 1) {
    skip(`${T} all checks`, `could not simulate the tenant on this schema (auth.uid()=${who.ok ? who.value.uid : errText(who.error)}, own company visible=${who.ok ? who.value.visible : 'n/a'}). The identity claims are request.jwt.claims / request.jwt.claim.sub (+ iss/session_id on owned-identity databases); nothing below was evaluated.`)
    return
  }
  pass(`${T} identity simulation (auth.uid() is the test user, own company visible)`)

  const expectGuard = async (name, sql) => {
    const r = await attempt(client, () => client.query(sql, [companyId]))
    if (!r.ok && r.error.code === '42501' && /service-role only/i.test(r.error.message)) pass(name)
    else if (!r.ok) fail(name, 'insufficient_privilege (42501) from the billing guard', errText(r.error))
    else fail(name, 'insufficient_privilege (42501) from the billing guard', `update accepted (${r.value.rowCount} row)`)
  }
  await expectGuard(`${T} UPDATE tier is rejected`, "UPDATE public.companies SET tier = 'business' WHERE id = $1")

  if (runFeatures) {
    await expectGuard(`${T} UPDATE online_payments_allowed is rejected`, 'UPDATE public.companies SET online_payments_allowed = true WHERE id = $1')
    await expectGuard(`${T} UPDATE digital_signature_allowed is rejected`, 'UPDATE public.companies SET digital_signature_allowed = false WHERE id = $1')

    const expectOneRow = async (name, sql) => {
      const r = await attempt(client, () => client.query(sql, [companyId]))
      if (r.ok && r.value.rowCount === 1) pass(name)
      else fail(name, 'update succeeds on 1 row', r.ok ? `${r.value.rowCount} rows updated (RLS filtered it?)` : errText(r.error))
    }
    await expectOneRow(`${T} UPDATE online_payments_enabled succeeds`, 'UPDATE public.companies SET online_payments_enabled = true WHERE id = $1')
    await expectOneRow(`${T} UPDATE digital_signature_enabled succeeds`, 'UPDATE public.companies SET digital_signature_enabled = true WHERE id = $1')
    await expectOneRow(`${T} UPDATE of an ordinary column (name) still succeeds`, "UPDATE public.companies SET name = 'check-feature-switches-2' WHERE id = $1")

    // BEFORE INSERT guard for the two platform switches (20261121140000).
    {
      const name = `${T} INSERT company with online_payments_allowed=true, digital_signature_allowed=false is forced to the defaults`
      const r = await attempt(client, () => insertRow(client, meta, 'public.companies',
        { user_id: userId, name: 'check-feature-switches-insert', online_payments_allowed: true, digital_signature_allowed: false },
        'online_payments_allowed AS a, digital_signature_allowed AS s'))
      if (!r.ok) fail(name, 'row inserted with allowed=false, signature_allowed=true', `the INSERT itself failed: ${errText(r.error)} (inconclusive: not a pass)`)
      else if (r.value.rows[0].a === false && r.value.rows[0].s === true) pass(name)
      else fail(name, 'online_payments_allowed=false, digital_signature_allowed=true', JSON.stringify(r.value.rows[0]))
    }

    // Invoices are tenant read-only.
    if (!invoiceId) {
      skip(`${T} invoices are read-only`, 'no test invoice')
    } else {
      const ro = async (name, sql, values, mustThrow) => {
        const r = await attempt(client, () => client.query(sql, values))
        if (!r.ok && r.error.code === '42501') pass(name)
        else if (r.ok && !mustThrow && r.value.rowCount === 0) pass(`${name} (no rows touched)`)
        else fail(name, mustThrow ? 'permission denied (42501)' : 'permission denied (42501) or 0 rows touched', r.ok ? `${r.value.rowCount} rows affected` : errText(r.error))
      }
      const ins = buildInsert('public.invoices', meta['public.invoices'], {
        estimate_id: (await attempt(client, async () => (await client.query('SELECT estimate_id FROM public.invoices WHERE id = $1', [invoiceId])).rows[0]?.estimate_id)).value ?? null,
        company_id: companyId, kind: 'full', amount_cents: 1000, currency_code: 'USD',
      })
      await ro(`${T} cannot INSERT invoices`, ins.text, ins.values, true)
      await ro(`${T} cannot UPDATE invoices`, 'UPDATE public.invoices SET amount_cents = 1 WHERE id = $1', [invoiceId], false)
      await ro(`${T} cannot DELETE invoices`, 'DELETE FROM public.invoices WHERE id = $1', [invoiceId], false)

      const name = `${T} can SELECT its own invoice including stripe_account_id, refunded_cents, refunded_at`
      const r = await attempt(client, () => client.query('SELECT id, stripe_account_id, refunded_cents, refunded_at FROM public.invoices WHERE id = $1', [invoiceId]))
      if (r.ok && r.value.rowCount === 1 && r.value.rows[0].refunded_cents === 0) pass(name)
      else fail(name, '1 row with refunded_cents = 0', r.ok ? JSON.stringify(r.value.rows) : errText(r.error))
    }
  }

  // Insert guard (20261121170000), the P2-09 probe: a tenant INSERT that sets
  // every guarded column must end up exactly like a tenant INSERT that omits
  // them. Without the trigger this is the open gap, reported as INFO (never FAIL);
  // with the trigger a surviving privileged value is a FAIL.
  {
    const probeName = `${T} INSERT company setting every billing/ownership column (tier=business, credit_balance=1000000, byok_enabled=true, ...)`
    const returning = guardedCols.map(qi).join(', ')
    const base = await attempt(client, () => insertRow(client, meta, 'public.companies',
      { user_id: userId, name: 'check-feature-switches-insert-baseline' }, returning))
    const overrides = { user_id: userId, name: 'check-feature-switches-insert-probe' }
    for (const col of guardedCols) {
      const v = GUARDED_ON_INSERT[col]
      overrides[col] = typeof v === 'function' ? v() : v
    }
    const p = await attempt(client, () => insertRow(client, meta, 'public.companies', overrides, returning))
    if (!base.ok) {
      skip(probeName, `could not create the baseline tenant insert, probe is inconclusive (${errText(base.error)})`)
    } else if (!p.ok) {
      if (guardInstalled) fail(probeName, 'the insert is accepted with every guarded column at its default', `the INSERT itself failed: ${errText(p.error)} (inconclusive: not a pass)`)
      else info(probeName, `REJECTED (${errText(p.error)}); the gap looks closed by something other than migration 20261121170000`)
    } else {
      const b = base.value.rows[0]
      const got = p.value.rows[0]
      const stuck = guardedCols.filter((c) => String(got[c] instanceof Date ? got[c].toISOString() : got[c]) !== String(b[c] instanceof Date ? b[c].toISOString() : b[c]))
      const show = stuck.slice(0, 6).map((c) => `${c}=${got[c] instanceof Date ? got[c].toISOString() : got[c]}`).join(', ')
      if (guardInstalled) {
        if (stuck.length === 0) pass(`${probeName} is forced to the defaults (${guardedCols.length} columns)`)
        else fail(probeName, 'every guarded column equals its default', `${stuck.length} column(s) kept the client value: ${show}${stuck.length > 6 ? ', ...' : ''}`)
      } else if (stuck.length === 0) {
        info(probeName, 'values were not kept although migration 20261121170000 is not applied (something else resets them)')
      } else {
        info(probeName, `GAP OPEN: migration 20261121170000 not applied. ${stuck.length} of ${guardedCols.length} guarded column(s) kept the client value: ${show}${stuck.length > 6 ? ', ...' : ''}`)
      }
    }
  }
}

main().catch((e) => {
  console.error(e?.message ?? e)
  process.exit(2)
})
