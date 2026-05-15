#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env.local') });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const checks = [
  { table: 'usage_events', source: 'phase55' },
  { table: 'processed_stripe_events', source: 'phase58' },
  { column: 'tier', table: 'companies', source: 'phase55' },
  { column: 'tier_trial_ends_at', table: 'companies', source: 'phase55' },
  { column: 'idempotency_key', table: 'usage_events', source: 'phase56' },
  { column: 'pdf_url', table: 'estimates', source: 'phase53' },
  { column: 'language', table: 'estimates', source: 'phase52' },
  { column: 'delivery_format', table: 'company_whatsapp', source: 'phase44' },
  { column: 'phone_number', table: 'company_whatsapp', source: 'phase50' }, // already there
];
for (const c of checks) {
  let q, args;
  if (c.column) {
    q = `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`;
    args = [c.table, c.column];
  } else {
    q = `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`;
    args = [c.table];
  }
  const r = await client.query(q, args);
  const what = c.column ? `${c.table}.${c.column}` : `table ${c.table}`;
  console.log(`${r.rowCount > 0 ? '✓' : '✗'} ${c.source}: ${what}`);
}
await client.end();
