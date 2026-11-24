// Explicit development-only preparation/readback for the signature release.
// Use node --env-file=<development .env.local> ... [--apply]
import pg from 'pg'
import { readFile } from 'node:fs/promises'
const env=process.env
const url=env.MIGRATION_DATABASE_URL||env.POSTGRES_URL_NON_POOLING||env.DATABASE_URL
const api=new URL(env.NEXT_PUBLIC_SUPABASE_URL)
const target=new URL(url)
const ref=api.hostname.split('.')[0]
if (!api.hostname.endsWith('.supabase.co') || !target.hostname.endsWith('.supabase.com') || !decodeURIComponent(target.username).includes(ref)) {
  throw new Error('This script only permits the matching Supabase development project')
}
const db=new pg.Client({connectionString:url})
await db.connect()
try {
  if(process.argv.includes('--apply')) {
    for(const file of ['20261123220000_signature_launch_integrity.sql','20261123221000_signature_receipt_outbox.sql','20261123222000_signature_receipt_identity.sql']) {
      const version=file.split('_')[0]
      const sql=(await readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'))
        .replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'')
      const applied=await db.query('SELECT statements FROM supabase_migrations.schema_migrations WHERE version=$1',[version])
      if(applied.rowCount && applied.rows[0].statements?.[0]?.trim()!==sql.trim()) {
        throw new Error(`The applied development migration differs from ${file}; review the database version before proceeding`)
      }
      if(!applied.rowCount) {
        await db.query('BEGIN')
        try {
          await db.query(sql)
          await db.query('INSERT INTO supabase_migrations.schema_migrations(version,statements,name) VALUES($1,$2,$3)',[version,[sql],file.replace(/^\d+_|\.sql$/g,'')])
          await db.query('COMMIT')
        } catch(error) { await db.query('ROLLBACK'); throw error }
      }
      console.log(`Development migration verified: ${file}`)
    }
    await db.query("NOTIFY pgrst, 'reload schema'")
  }
  const schema=await db.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('companies','projects','estimates','clients') AND is_nullable='NO' AND column_default IS NULL ORDER BY table_name,column_name`)
  console.log(JSON.stringify({requiredColumns:schema.rows}))
  const checks=await db.query(`SELECT to_regprocedure('public.record_estimate_response_atomic(uuid,uuid,timestamptz,text)') IS NOT NULL AS estimate_response,
    to_regprocedure('public.record_change_order_response_atomic(uuid,uuid,timestamptz,text)') IS NOT NULL AS change_order_response,
    to_regclass('public.signature_receipt_outbox') IS NOT NULL AS receipt_outbox`)
  console.log(JSON.stringify(checks.rows[0]))
  const fixtures=await db.query("SELECT count(*)::int AS remaining_signature_fixtures FROM public.companies WHERE name LIKE 'Signature Launch Smoke %'")
  console.log(JSON.stringify(fixtures.rows[0]))
} finally { await db.end() }
