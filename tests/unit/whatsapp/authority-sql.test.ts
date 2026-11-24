// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const OWNER = id(1)
const MEMBER = id(2)
const COMPANY = id(3)
const CONFIG = id(4)
const OTHER_COMPANY = id(5)
const OTHER_CONFIG = id(6)
const MEMBER_SENDER = id(7)
const OWNER_SENDER = id(8)
const ADMIN_SENDER = id(9)
const AMBIGUOUS_SENDER = id(10)
const RECENTLY_LINKED_SENDER = id(11)
const REMOVED_MEMBER = id(12)
const REMOVED_SENDER = id(13)
const OLD_PHONE_SENDER = id(14)
const PHONES = {
  owner: '+15551230001', member: '+15551230002', explicit: '+15551230003',
  ambiguous: '+15551230004', recentlyLinked: '+15551230005', removed: '+15551230006', oldPhone: '+15551230007',
}

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE xtimator_accounts(id uuid PRIMARY KEY, phone text, phone_confirmed_at timestamptz, disabled_at timestamptz);
    CREATE TABLE companies(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES xtimator_accounts(id));
    CREATE TABLE company_members(
      user_id uuid NOT NULL REFERENCES xtimator_accounts(id) ON DELETE CASCADE,
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member', PRIMARY KEY (user_id, company_id)
    );
    CREATE TABLE whatsapp_company_configs(id uuid PRIMARY KEY, company_id uuid NOT NULL UNIQUE REFERENCES companies(id), status text NOT NULL);
    CREATE TABLE whatsapp_authorized_senders(
      id uuid PRIMARY KEY, config_id uuid NOT NULL REFERENCES whatsapp_company_configs(id),
      company_id uuid NOT NULL REFERENCES companies(id), user_id uuid REFERENCES xtimator_accounts(id) ON DELETE SET NULL,
      phone_e164 text NOT NULL, status text NOT NULL, created_by_admin boolean, verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX whatsapp_active_sender_phone_unique ON whatsapp_authorized_senders(phone_e164) WHERE status='active';
    CREATE TABLE admin_audit_log(id uuid DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL, target_type text, target_id text, action text, metadata jsonb);
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT DELETE ON company_members TO service_role;
    GRANT UPDATE ON whatsapp_authorized_senders TO service_role;
    INSERT INTO xtimator_accounts VALUES
      ('${OWNER}', '${PHONES.owner}', now(), null), ('${MEMBER}', '${PHONES.member}', now(), null),
      ('${REMOVED_MEMBER}', '${PHONES.removed}', now(), null);
    INSERT INTO companies VALUES ('${COMPANY}', '${OWNER}'), ('${OTHER_COMPANY}', '${OWNER}');
    INSERT INTO company_members(user_id, company_id) VALUES ('${MEMBER}', '${COMPANY}');
    INSERT INTO whatsapp_company_configs VALUES ('${CONFIG}', '${COMPANY}', 'active'), ('${OTHER_CONFIG}', '${OTHER_COMPANY}', 'active');
    INSERT INTO whatsapp_authorized_senders(id, config_id, company_id, user_id, phone_e164, status, created_by_admin, updated_at) VALUES
      ('${MEMBER_SENDER}', '${CONFIG}', '${COMPANY}', '${MEMBER}', '${PHONES.member}', 'active', true, now()),
      ('${OWNER_SENDER}', '${CONFIG}', '${COMPANY}', '${OWNER}', '${PHONES.owner}', 'active', false, now()),
      ('${ADMIN_SENDER}', '${CONFIG}', '${COMPANY}', null, '${PHONES.explicit}', 'active', true, '2026-01-01'),
      ('${AMBIGUOUS_SENDER}', '${CONFIG}', '${COMPANY}', null, '${PHONES.ambiguous}', 'active', true, '2026-01-01'),
      ('${RECENTLY_LINKED_SENDER}', '${CONFIG}', '${COMPANY}', null, '${PHONES.recentlyLinked}', 'active', true, '2026-01-03'),
      ('${REMOVED_SENDER}', '${CONFIG}', '${COMPANY}', '${REMOVED_MEMBER}', '${PHONES.removed}', 'active', false, now()),
      ('${OLD_PHONE_SENDER}', '${CONFIG}', '${COMPANY}', '${OWNER}', '${PHONES.oldPhone}', 'active', false, now());
    INSERT INTO admin_audit_log(created_at, target_type, target_id, action, metadata) VALUES
      ('2026-01-02', 'whatsapp_sender', '${ADMIN_SENDER}', 'whatsapp.sender.save', '{"userId":null,"companyId":"${COMPANY}","phoneLast4":"0003"}'),
      ('2026-01-02', 'whatsapp_sender', '${RECENTLY_LINKED_SENDER}', 'whatsapp.sender.save', '{"userId":null,"companyId":"${COMPANY}","phoneLast4":"0005"}');
  `)
  await db.exec(readFileSync('supabase/migrations/20261123141000_whatsapp_authority.sql', 'utf8'))
}, 30000)

afterAll(async () => { await db?.close() })

async function authority(phone: string) {
  return (await db.query<{ authorized: boolean; user_id: string | null }>(
    'SELECT authorized, user_id FROM resolve_whatsapp_sender_authority($1)', [phone],
  )).rows[0]
}

async function sender(senderId: string) {
  return (await db.query(
    `SELECT status, user_id, admin_phone_only, suspension_reason
     FROM whatsapp_authorized_senders WHERE id = $1`, [senderId],
  )).rows[0]
}

describe('WhatsApp sender authority migration', () => {
  it('keeps an audited phone-only grant and suspends ambiguous historical null-user rows', async () => {
    await expect(authority(PHONES.explicit)).resolves.toEqual({ authorized: true, user_id: null })
    for (const legacySender of [AMBIGUOUS_SENDER, RECENTLY_LINKED_SENDER]) {
      await expect(sender(legacySender)).resolves.toMatchObject({
        status: 'suspended', admin_phone_only: false, suspension_reason: 'admin',
      })
    }
  })

  it('releases active numbers revoked by a membership removal or phone change before the migration', async () => {
    await expect(sender(REMOVED_SENDER)).resolves.toMatchObject({
      status: 'suspended', admin_phone_only: false, suspension_reason: 'membership_removed',
    })
    await expect(authority(PHONES.removed)).resolves.toBeUndefined()
    await expect(sender(OLD_PHONE_SENDER)).resolves.toMatchObject({
      status: 'suspended', admin_phone_only: false, suspension_reason: 'phone_change',
    })
    await expect(authority(PHONES.oldPhone)).resolves.toBeUndefined()
  })

  it('requires an active matching company config and a current enabled and verified account', async () => {
    await expect(authority(PHONES.owner)).resolves.toEqual({ authorized: true, user_id: OWNER })
    await expect(authority(PHONES.member)).resolves.toEqual({ authorized: true, user_id: MEMBER })
    await db.query(`UPDATE whatsapp_company_configs SET status='suspended' WHERE id=$1`, [CONFIG])
    await expect(authority(PHONES.member)).resolves.toMatchObject({ authorized: false })
    await expect(authority(PHONES.explicit)).resolves.toMatchObject({ authorized: false })
    await db.query(`UPDATE whatsapp_company_configs SET status='active' WHERE id=$1`, [CONFIG])
    await db.query('UPDATE whatsapp_authorized_senders SET config_id=$1 WHERE id=$2', [OTHER_CONFIG, OWNER_SENDER])
    await expect(authority(PHONES.owner)).resolves.toMatchObject({ authorized: false })
    await db.query('UPDATE whatsapp_authorized_senders SET config_id=$1 WHERE id=$2', [CONFIG, OWNER_SENDER])
    await db.query('UPDATE xtimator_accounts SET disabled_at=now() WHERE id=$1', [MEMBER])
    await expect(authority(PHONES.member)).resolves.toMatchObject({ authorized: false })
    await db.query("UPDATE xtimator_accounts SET disabled_at=null, phone='+15551239999' WHERE id=$1", [MEMBER])
    await expect(authority(PHONES.member)).resolves.toMatchObject({ authorized: false })
    await db.query('UPDATE xtimator_accounts SET phone=$1, phone_confirmed_at=null WHERE id=$2', [PHONES.member, MEMBER])
    await expect(authority(PHONES.member)).resolves.toMatchObject({ authorized: false })
    await db.query('UPDATE xtimator_accounts SET phone_confirmed_at=now() WHERE id=$1', [MEMBER])
  })

  it('revokes linked senders atomically when membership is removed by the service role', async () => {
    await db.exec('BEGIN; SET LOCAL ROLE service_role')
    try {
      await db.query('DELETE FROM company_members WHERE user_id=$1 AND company_id=$2', [MEMBER, COMPANY])
      await expect(sender(MEMBER_SENDER)).resolves.toMatchObject({
        status: 'suspended', suspension_reason: 'membership_removed', user_id: MEMBER,
      })
      await expect(authority(PHONES.member)).resolves.toBeUndefined()
    } finally {
      await db.exec('ROLLBACK')
    }
    await expect(authority(PHONES.member)).resolves.toMatchObject({ authorized: true })

    await db.query("UPDATE whatsapp_authorized_senders SET status='suspended' WHERE id=$1", [MEMBER_SENDER])
    await db.query('DELETE FROM company_members WHERE user_id=$1 AND company_id=$2', [MEMBER, COMPANY])
    await expect(sender(MEMBER_SENDER)).resolves.toMatchObject({ status: 'suspended', suspension_reason: 'admin' })
    await expect(db.query("UPDATE whatsapp_authorized_senders SET status='active', suspension_reason=null WHERE id=$1", [MEMBER_SENDER]))
      .rejects.toThrow('no longer a member')
    await db.query('INSERT INTO company_members(user_id, company_id) VALUES ($1, $2)', [MEMBER, COMPANY])
    await db.query("UPDATE whatsapp_authorized_senders SET status='active', suspension_reason=null WHERE id=$1", [MEMBER_SENDER])
  })

  it('never turns a formerly linked admin sender into a phone-only grant when its account is deleted', async () => {
    await db.query('DELETE FROM xtimator_accounts WHERE id=$1', [MEMBER])
    await expect(sender(MEMBER_SENDER)).resolves.toMatchObject({
      status: 'suspended', user_id: null, admin_phone_only: false,
    })
    await expect(authority(PHONES.member)).resolves.toBeUndefined()
  })

  it('allows only the service role to call the registry and manage one notification claim per event and channel', async () => {
    const result = await db.query(`
      SELECT
        has_function_privilege('authenticated', 'resolve_whatsapp_sender_authority(text)', 'execute') AS tenant_lookup,
        has_function_privilege('service_role', 'resolve_whatsapp_sender_authority(text)', 'execute') AS service_lookup,
        has_table_privilege('authenticated', 'notification_channel_send_claims', 'insert') AS tenant_claim,
        has_table_privilege('service_role', 'notification_channel_send_claims', 'insert') AS service_claim
    `)
    expect(result.rows[0]).toEqual({ tenant_lookup: false, service_lookup: true, tenant_claim: false, service_claim: true })
    await db.exec("INSERT INTO notification_channel_send_claims(event_id, channel) VALUES ('event-1', 'whatsapp'), ('event-1', 'sms')")
    await expect(db.exec("INSERT INTO notification_channel_send_claims(event_id, channel) VALUES ('event-1', 'whatsapp')"))
      .rejects.toThrow(/duplicate key/)
  })
})
