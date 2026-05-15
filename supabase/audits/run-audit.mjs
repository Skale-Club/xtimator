#!/usr/bin/env node
// supabase/audits/run-audit.mjs
// Cross-platform RLS audit runner (works without psql).
//
// Usage:
//   node supabase/audits/run-audit.mjs              # uses DATABASE_URL from .env.local (dev)
//   node supabase/audits/run-audit.mjs --prod       # uses PROD_DB_URL from .env.production
//   node supabase/audits/run-audit.mjs --snapshot=path.txt  # also writes table output to file
//
// Exit codes:
//   0 — zero FAIL rows
//   1 — one or more FAIL rows
//   2 — connection error or missing env

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const args = process.argv.slice(2);

const useProd = args.includes('--prod');
const snapshotArg = args.find(a => a.startsWith('--snapshot='));
const snapshotPath = snapshotArg ? snapshotArg.split('=')[1] : null;

dotenv.config({ path: resolve(repoRoot, useProd ? '.env.production' : '.env.local') });

const connectionString = useProd ? process.env.PROD_DB_URL : process.env.DATABASE_URL;
if (!connectionString) {
  console.error(`ERROR: ${useProd ? 'PROD_DB_URL' : 'DATABASE_URL'} not set in ${useProd ? '.env.production' : '.env.local'}`);
  process.exit(2);
}

const sqlPath = resolve(__dirname, 'rls-audit.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query(sql);
  await client.end();

  const ok = rows.filter(r => r.posture === 'OK').length;
  const warn = rows.filter(r => r.posture.startsWith('WARN')).length;
  const fail = rows.filter(r => r.posture.startsWith('FAIL')).length;

  // Build table output
  const lines = [];
  lines.push(`# RLS Posture Audit — ${useProd ? 'PRODUCTION' : 'DEV'}`);
  lines.push(`# Captured: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('schema     | table                          | rls   | policies | posture');
  lines.push('-----------+--------------------------------+-------+----------+--------');
  for (const r of rows) {
    const schema = String(r.schemaname).padEnd(10);
    const table  = String(r.tablename).padEnd(30);
    const rls    = String(r.rls_enabled).padEnd(5);
    const pcount = String(r.policy_count).padStart(8);
    lines.push(`${schema} | ${table} | ${rls} | ${pcount} | ${r.posture}`);
  }
  lines.push('');
  lines.push(`SUMMARY: TOTAL=${rows.length} OK=${ok} WARN=${warn} FAIL=${fail}`);

  const output = lines.join('\n');
  console.log(output);

  if (snapshotPath) {
    const fullPath = resolve(repoRoot, snapshotPath);
    writeFileSync(fullPath, output + '\n', 'utf8');
    console.log(`\n✓ Snapshot written to ${snapshotPath}`);
  }

  if (fail > 0) {
    console.error(`\n❌ ${fail} FAIL row(s) — production NOT ready`);
    process.exit(1);
  }
  console.log(`\n✓ Zero FAIL rows`);
  process.exit(0);
} catch (err) {
  console.error('ERROR:', err.message);
  await client.end().catch(() => {});
  process.exit(2);
}
