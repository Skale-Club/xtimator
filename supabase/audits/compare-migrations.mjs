#!/usr/bin/env node
// Compare on-disk migration files vs supabase_migrations.schema_migrations
// Usage: node supabase/audits/compare-migrations.mjs

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(repoRoot, '.env.local') });

const onDisk = readdirSync(resolve(repoRoot, 'supabase', 'migrations'))
  .filter(f => /^\d{14}.*\.sql$/.test(f))
  .map(f => f.match(/^(\d{14})/)[1])
  .sort();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
await client.end();

const inDb = rows.map(r => r.version).sort();
const missingFromDb = onDisk.filter(v => !inDb.includes(v));
const inDbNotOnDisk = inDb.filter(v => !onDisk.includes(v));

console.log(`On disk: ${onDisk.length} migration files`);
console.log(`In DB:   ${inDb.length} registered migrations`);
console.log('');
console.log('Missing from DB (NOT applied):');
missingFromDb.forEach(v => {
  const file = readdirSync(resolve(repoRoot, 'supabase', 'migrations')).find(f => f.startsWith(v));
  console.log(`  - ${file}`);
});
console.log('');
console.log('In DB but file missing on disk (applied without local file):');
if (inDbNotOnDisk.length === 0) console.log('  (none)');
inDbNotOnDisk.forEach(v => console.log(`  - ${v}`));
