// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
let db: PGlite
const company = '10000000-0000-4000-8000-000000000001'
const user = '10000000-0000-4000-8000-000000000002'
const leaseA = '10000000-0000-4000-8000-000000000003'
const leaseB = '10000000-0000-4000-8000-000000000004'
const phone = '+15555550100'
beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.companies(id uuid PRIMARY KEY);')
  await db.exec(readFileSync('supabase/migrations/20261123140000_whatsapp_durable_ingress.sql', 'utf8'))
  await db.query('INSERT INTO companies(id) VALUES ($1)', [company])
})
afterAll(async () => db?.close())
beforeEach(async () => db.exec('TRUNCATE whatsapp_ingress_messages, whatsapp_ingress_batches, whatsapp_webhook_inbox CASCADE'))
async function addMessage(id: string, old = true, sender: string | null = user) {
  await db.query(`INSERT INTO whatsapp_ingress_messages(id,company_id,owner_phone,sender_user_id,message,received_at)
    VALUES ($1,$2,$3,$4,$5,now()-CASE WHEN $6 THEN interval '10 seconds' ELSE interval '0 seconds' END)`,
    [id, company, phone, sender, JSON.stringify({ id, from: phone.slice(1), type: 'text' }), old])
}
async function claim(lease = leaseA) {
  return (await db.query<{ result: any }>('SELECT claim_whatsapp_ingress_batch($1,$2,$3) AS result', [company, phone, lease])).rows[0].result
}
it('claims a webhook once and recovers the same payload after a worker lease expires', async () => {
  const id = 'a'.repeat(64)
  await db.query('INSERT INTO whatsapp_webhook_inbox(id,payload) VALUES ($1,$2)', [id, JSON.stringify({ entry: [] })])
  const sql = 'SELECT claim_whatsapp_webhook($1,$2) AS result'
  expect((await db.query<{ result: unknown }>(sql, [id, leaseA])).rows[0].result).toEqual({ entry: [] })
  expect((await db.query<{ result: unknown }>(sql, [id, leaseB])).rows[0].result).toBeNull()
  await db.exec("UPDATE whatsapp_webhook_inbox SET lease_until=now()-interval '1 second'")
  expect((await db.query<{ result: unknown }>(sql, [id, leaseB])).rows[0].result).toEqual({ entry: [] })
})
it('groups all messages before debounce and never removes a concurrent later arrival', async () => {
  await addMessage('wamid.audio'); await addMessage('wamid.photo')
  const first = await claim()
  expect(first.entries.map((e: any) => e.message.id)).toEqual(['wamid.audio','wamid.photo'])
  await addMessage('wamid.later')
  expect(await claim(leaseB)).toBeNull()
  expect((await db.query('SELECT id FROM whatsapp_ingress_messages WHERE batch_id IS NULL')).rows).toEqual([{ id: 'wamid.later' }])
  await db.query("UPDATE whatsapp_ingress_batches SET state='complete' WHERE id=$1", [first.id])
  const second = await claim(leaseB)
  expect(second.id).not.toBe(first.id); expect(second.entries[0].message.id).toBe('wamid.later')
})
it('defers batching while the phone is still receiving a burst', async () => {
  await addMessage('old'); await addMessage('new', false)
  expect(await claim()).toBeNull()
  expect((await db.query('SELECT * FROM due_whatsapp_ingress_phones()')).rows).toEqual([])
})
it('recovers the identical batch and planned dispatch route after a crash', async () => {
  await addMessage('wamid.one'); const first = await claim()
  expect(first.route).toBeNull()
  const route = { kind: 'intent', session: { id: 'session-1' } }
  await db.query("UPDATE whatsapp_ingress_batches SET lease_until=now()-interval '1 second', dispatch_route=$1 WHERE id=$2", [JSON.stringify(route), first.id])
  const recovered = await claim(leaseB)
  expect(recovered.id).toBe(first.id); expect(recovered.entries).toEqual(first.entries)
  expect(recovered.route).toEqual(route)
  expect((await db.query<{ attempts: number }>('SELECT attempts FROM whatsapp_ingress_batches')).rows[0].attempts).toBe(2)
})
it('keeps a new sender out of the old sender batch while preserving phone order', async () => {
  await addMessage('wamid.01.phone-only', true, null)
  await addMessage('wamid.02.linked', true, user)
  await addMessage('wamid.03.phone-only', true, null)
  const first = await claim()
  expect(first.senderUserId).toBeNull()
  expect(first.entries.map((entry: any) => entry.message.id)).toEqual(['wamid.01.phone-only'])
  await db.query("UPDATE whatsapp_ingress_batches SET state='revoked' WHERE id=$1", [first.id])
  const second = await claim(leaseB)
  expect(second.senderUserId).toBe(user)
  expect(second.entries.map((entry: any) => entry.message.id)).toEqual(['wamid.02.linked'])
  expect((await db.query('SELECT id FROM whatsapp_ingress_messages WHERE batch_id IS NULL')).rows)
    .toEqual([{ id: 'wamid.03.phone-only' }])
})
it('deduplicates the same provider message and never batches it twice', async () => {
  await addMessage('wamid.one')
  await expect(addMessage('wamid.one')).rejects.toThrow()
  const first = await claim()
  await db.query("UPDATE whatsapp_ingress_batches SET state='complete' WHERE id=$1", [first.id])
  expect(await claim(leaseB)).toBeNull()
})
it('denies direct authenticated access and claim execution', async () => {
  await db.exec('SET ROLE authenticated')
  try {
    await expect(db.query('SELECT * FROM whatsapp_webhook_inbox')).rejects.toThrow('permission denied')
    await expect(db.query('SELECT claim_whatsapp_webhook($1,$2)', ['a'.repeat(64), leaseA])).rejects.toThrow('permission denied')
  } finally { await db.exec('RESET ROLE') }
})
