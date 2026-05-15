#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env.local') });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log('=== Buckets ===');
const buckets = await client.query('SELECT id, name, public FROM storage.buckets ORDER BY id');
buckets.rows.forEach(b => console.log(`  ${b.id} (name: ${b.name}, public: ${b.public})`));

console.log('\n=== platform_admins schema ===');
const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_admins' ORDER BY ordinal_position`);
cols.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

console.log('\n=== Super-admins (joined with auth.users) ===');
const admin = await client.query(`SELECT u.email, pa.created_at FROM platform_admins pa JOIN auth.users u ON u.id = pa.user_id ORDER BY pa.created_at`);
console.log(`  Total: ${admin.rowCount} super-admin(s)`);
admin.rows.forEach(r => console.log(`  - ${r.email} (since ${r.created_at})`));

await client.end();
