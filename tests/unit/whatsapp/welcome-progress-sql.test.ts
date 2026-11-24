// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const company = '00000000-0000-4000-8000-000000000001'
const token = '00000000-0000-4000-8000-000000000002'
const phone = '+15551234567'
let database: PGlite

beforeAll(async () => {
  database = new PGlite()
  await database.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE whatsapp_company_configs(company_id uuid PRIMARY KEY, status text, welcome_sent_at timestamptz);
    CREATE TABLE whatsapp_authorized_senders(id uuid);
    CREATE TABLE whatsapp_notification_templates(id uuid);
    GRANT SELECT, UPDATE ON whatsapp_company_configs TO service_role;
    INSERT INTO whatsapp_company_configs VALUES ('${company}', 'active', NULL);
  `)
  await database.exec(readFileSync('supabase/migrations/20261123143000_whatsapp_welcome_progress.sql', 'utf8'))
}, 30_000)

afterAll(async () => { await database?.close() })

async function claim(recipient = phone) {
  const result = await database.query(
    'SELECT next_step FROM public.claim_whatsapp_welcome($1, $2, $3)',
    [company, recipient, token],
  )
  return result.rows
}

it('leases progress to the original recipient and holds an ambiguous send after lease expiry', async () => {
  expect(await claim()).toEqual([{ next_step: 0 }])
  expect(await claim()).toEqual([])
  await database.exec(`
    UPDATE whatsapp_company_configs
      SET welcome_next_step = 1, welcome_sending_step = 1, welcome_claim_until = now() - interval '1 minute';
  `)
  expect(await claim()).toEqual([])
  await database.exec('UPDATE whatsapp_company_configs SET welcome_sending_step = NULL')
  expect(await claim('+15551234568')).toEqual([])
  expect(await claim()).toEqual([{ next_step: 1 }])
})

it('prevents anonymous callers from acquiring a welcome send lease', async () => {
  await database.exec('SET ROLE anon')
  try {
    await expect(claim()).rejects.toThrow(/permission denied/)
  } finally {
    await database.exec('RESET ROLE')
  }
})
