#!/usr/bin/env node
// supabase/audits/run-prod-readiness.mjs
// Composite production-readiness check for Phase 61.
// Cross-platform (no psql required — uses pg directly).
//
// Usage:
//   node supabase/audits/run-prod-readiness.mjs
//
// Reads PROD_DB_URL from .env.production (gitignored).
//
// Exit codes:
//   0 — all four checks passed
//   1 — RLS audit returned FAIL rows
//   2 — migration count != expected
//   3 — storage bucket count != 5
//   4 — super-admin row missing
//   5 — PROD_DB_URL not set / connection failed

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');

dotenv.config({ path: resolve(repoRoot, '.env.production') });

const PROD_DB_URL = process.env.PROD_DB_URL;
if (!PROD_DB_URL) {
  console.error('ERROR: PROD_DB_URL not set in .env.production (gitignored)');
  process.exit(5);
}

const EXPECTED_MIGRATIONS = readdirSync(resolve(repoRoot, 'supabase', 'migrations'))
  .filter(f => /^\d{14}.*\.sql$/.test(f))
  .length;

const EXPECTED_BUCKETS = ['audio', 'photos', 'pdfs', 'logos', 'platform-brand'];
const SUPER_ADMIN_EMAIL = 'skale.club@gmail.com';

const client = new pg.Client({ connectionString: PROD_DB_URL, ssl: { rejectUnauthorized: false } });

console.log('=== Phase 61 Production Readiness Check ===\n');

try {
  await client.connect();

  // 1. RLS audit — zero FAIL rows
  console.log('[1/4] RLS audit (rls-audit.sql)...');
  const auditSql = readFileSync(resolve(__dirname, 'rls-audit.sql'), 'utf8');
  const audit = await client.query(auditSql);
  const fails = audit.rows.filter(r => r.posture.startsWith('FAIL'));
  if (fails.length > 0) {
    console.error(`  FAIL: ${fails.length} rows with FAIL posture (expected 0)`);
    fails.forEach(r => console.error(`    ${r.schemaname}.${r.tablename}: ${r.posture}`));
    process.exit(1);
  }
  console.log('  OK (zero FAIL rows)');

  // 2. Migration count
  console.log('[2/4] Migration count...');
  const migrations = await client.query(
    'SELECT count(*)::int AS n FROM supabase_migrations.schema_migrations'
  );
  const applied = migrations.rows[0].n;
  if (applied !== EXPECTED_MIGRATIONS) {
    console.error(`  FAIL: ${applied} migrations applied (expected ${EXPECTED_MIGRATIONS})`);
    process.exit(2);
  }
  console.log(`  OK (${applied} migrations applied)`);

  // 3. Storage buckets
  console.log('[3/4] Storage buckets...');
  const buckets = await client.query(
    `SELECT id FROM storage.buckets WHERE id = ANY($1::text[])`,
    [EXPECTED_BUCKETS]
  );
  if (buckets.rows.length !== EXPECTED_BUCKETS.length) {
    console.error(`  FAIL: ${buckets.rows.length}/${EXPECTED_BUCKETS.length} expected buckets present`);
    const missing = EXPECTED_BUCKETS.filter(b => !buckets.rows.find(r => r.id === b));
    console.error(`    missing: ${missing.join(', ')}`);
    process.exit(3);
  }
  console.log(`  OK (${EXPECTED_BUCKETS.length} buckets present)`);

  // 4. Super-admin presence (platform_admins has no email column — JOIN auth.users)
  console.log('[4/4] Super-admin bootstrap...');
  const admin = await client.query(
    `SELECT u.email FROM platform_admins pa
       JOIN auth.users u ON u.id = pa.user_id
      WHERE u.email = $1`,
    [SUPER_ADMIN_EMAIL]
  );
  if (admin.rows.length !== 1) {
    console.error(`  FAIL: super-admin row missing for ${SUPER_ADMIN_EMAIL} (count=${admin.rows.length})`);
    process.exit(4);
  }
  console.log(`  OK (super-admin present: ${admin.rows[0].email})`);

  console.log('\n=== All four checks PASSED ===');
  await client.end();
  process.exit(0);
} catch (err) {
  console.error('ERROR:', err.message);
  await client.end().catch(() => {});
  process.exit(5);
}
