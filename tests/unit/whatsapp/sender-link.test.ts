import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── In-memory fake of the PostgREST builder surface sender-link uses ────────

type Row = Record<string, unknown>
type Db = ReturnType<typeof makeDb>

function makeDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(initial)) tables[name] = rows.map((r) => ({ ...r }))
  const inserts: Array<{ table: string; row: Row }> = []
  let seq = 0

  function from(table: string) {
    tables[table] ??= []
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let limitN: number | undefined

    async function run(single: boolean) {
      if (mode === 'insert') {
        const clash =
          table === 'whatsapp_authorized_senders' &&
          payload.status === 'active' &&
          tables[table].some((r) => r.status === 'active' && r.phone_e164 === payload.phone_e164)
        if (clash) return { data: null, error: { code: '23505', message: 'unique violation' } }
        const row = { id: `${table}-${++seq}`, ...payload }
        tables[table].push(row)
        inserts.push({ table, row })
        return { data: single ? row : [row], error: null }
      }
      let rows = tables[table].filter((r) => filters.every((f) => f(r)))
      if (mode === 'update') {
        for (const r of rows) Object.assign(r, payload)
        return { data: single ? (rows[0] ?? null) : rows, error: null }
      }
      if (limitN !== undefined) rows = rows.slice(0, limitN)
      return { data: single ? (rows[0] ?? null) : rows, error: null }
    }

    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
      not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
      limit: (n: number) => ((limitN = n), b),
      insert: (row: Row) => ((mode = 'insert'), (payload = row), b),
      update: (patch: Row) => ((mode = 'update'), (payload = patch), b),
      maybeSingle: () => run(true),
      single: () => run(true),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run(false).then(resolve, reject),
    }
    return b
  }

  return { from, tables, inserts }
}

let db: Db
const mockNotifyOps = vi.fn()

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn(() => db) }))
vi.mock('@/lib/supabase/data-service', () => ({ requireDataServiceClient: vi.fn(() => db) }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: (...args: unknown[]) => mockNotifyOps(...args) }))

import {
  ensureWhatsAppSenderForUser,
  findOwnerCandidateByVerifiedPhone,
  getVerifiedPhone,
  syncWhatsAppSenderAfterPhoneChange,
} from '@/lib/whatsapp/sender-link'
import { requireDataServiceClient } from '@/lib/supabase/data-service'

const PHONE = '+15551234567'
const VERIFIED = '2026-11-01T00:00:00Z'

function baseTables(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    xtimator_accounts: [{ id: 'u1', phone: PHONE, phone_confirmed_at: VERIFIED, disabled_at: null }],
    company_members: [{ user_id: 'u1', company_id: 'c1' }],
    companies: [{ id: 'c1', user_id: 'u1' }],
    whatsapp_company_configs: [],
    whatsapp_authorized_senders: [],
    ...extra,
  }
}

function senderRows(): Row[] {
  return db.tables.whatsapp_authorized_senders
}

beforeEach(() => {
  mockNotifyOps.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('getVerifiedPhone', () => {
  it('returns the E.164 phone only when it is confirmed', async () => {
    db = makeDb(baseTables())
    expect(await getVerifiedPhone('u1')).toBe(PHONE)
    db = makeDb(baseTables({ xtimator_accounts: [{ id: 'u1', phone: PHONE, phone_confirmed_at: null }] }))
    expect(await getVerifiedPhone('u1')).toBeNull()
  })
})

describe('ensureWhatsAppSenderForUser', () => {
  it('creates the config and an active sender row for a verified phone', async () => {
    db = makeDb(baseTables())
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result).toEqual({ status: 'linked', phoneE164: PHONE })
    const config = db.inserts.find((i) => i.table === 'whatsapp_company_configs')
    expect(config?.row).toMatchObject({ company_id: 'c1', status: 'active' })
    expect(senderRows()).toHaveLength(1)
    expect(senderRows()[0]).toMatchObject({
      company_id: 'c1',
      config_id: config?.row.id,
      phone_e164: PHONE,
      user_id: 'u1',
      status: 'active',
      created_by_admin: false,
    })
  })

  it('is idempotent: a second call changes nothing', async () => {
    db = makeDb(baseTables())
    await ensureWhatsAppSenderForUser('u1', 'c1')
    const again = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(again.status).toBe('already_linked')
    expect(senderRows()).toHaveLength(1)
    expect(db.inserts.filter((i) => i.table === 'whatsapp_authorized_senders')).toHaveLength(1)
  })

  it('reactivates an earlier self-created row instead of inserting a second one', async () => {
    db = makeDb(
      baseTables({
        whatsapp_company_configs: [{ id: 'cfg1', company_id: 'c1', status: 'active' }],
        whatsapp_authorized_senders: [
          { id: 's1', company_id: 'c1', user_id: 'u1', phone_e164: PHONE, status: 'suspended', created_by_admin: false },
        ],
      }),
    )
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result.status).toBe('linked')
    expect(senderRows()).toHaveLength(1)
    expect(senderRows()[0]).toMatchObject({ id: 's1', status: 'active', user_id: 'u1' })
  })

  it('never undoes an explicit admin suspension', async () => {
    db = makeDb(
      baseTables({
        whatsapp_authorized_senders: [
          { id: 's1', company_id: 'c1', user_id: 'u1', phone_e164: PHONE, status: 'suspended', created_by_admin: true },
        ],
      }),
    )
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result.status).toBe('blocked')
    expect(senderRows()[0].status).toBe('suspended')
  })

  it('does nothing and alerts ops (last 4 digits only) when the phone is active for another company', async () => {
    db = makeDb(
      baseTables({
        whatsapp_authorized_senders: [
          { id: 's9', company_id: 'c-other', user_id: 'u9', phone_e164: PHONE, status: 'active', created_by_admin: false },
        ],
      }),
    )
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result.status).toBe('conflict')
    expect(senderRows()).toHaveLength(1)
    expect(senderRows()[0].company_id).toBe('c-other')
    expect(mockNotifyOps).toHaveBeenCalledTimes(1)
    const serialized = JSON.stringify(mockNotifyOps.mock.calls[0][0])
    expect(serialized).toContain('4567')
    expect(serialized).toContain('c1')
    expect(serialized).toContain('c-other')
    expect(serialized).not.toContain('15551234567')
  })

  it('does nothing for an unverified phone', async () => {
    db = makeDb(baseTables({ xtimator_accounts: [{ id: 'u1', phone: PHONE, phone_confirmed_at: null }] }))
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result.status).toBe('no_verified_phone')
    expect(senderRows()).toHaveLength(0)
    expect(db.inserts).toHaveLength(0)
  })

  it('does nothing when the user does not belong to the company', async () => {
    db = makeDb(baseTables())
    const result = await ensureWhatsAppSenderForUser('u1', 'c-not-mine')

    expect(result.status).toBe('not_member')
    expect(senderRows()).toHaveLength(0)
  })

  it('respects a suspended company config', async () => {
    db = makeDb(baseTables({ whatsapp_company_configs: [{ id: 'cfg1', company_id: 'c1', status: 'suspended' }] }))
    const result = await ensureWhatsAppSenderForUser('u1', 'c1')

    expect(result.status).toBe('blocked')
    expect(senderRows()).toHaveLength(0)
  })

  it('never throws into the caller', async () => {
    db = makeDb(baseTables())
    vi.mocked(requireDataServiceClient).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    await expect(ensureWhatsAppSenderForUser('u1', 'c1')).resolves.toEqual({ status: 'error' })
  })
})

describe('syncWhatsAppSenderAfterPhoneChange', () => {
  it('suspends the old phone row and links the new verified phone', async () => {
    const NEW_PHONE = '+15559998888'
    db = makeDb(
      baseTables({
        xtimator_accounts: [{ id: 'u1', phone: NEW_PHONE, phone_confirmed_at: VERIFIED, disabled_at: null }],
        whatsapp_company_configs: [{ id: 'cfg1', company_id: 'c1', status: 'active' }],
        whatsapp_authorized_senders: [
          { id: 's1', company_id: 'c1', user_id: 'u1', phone_e164: PHONE, status: 'active', created_by_admin: false },
        ],
      }),
    )
    await syncWhatsAppSenderAfterPhoneChange('u1')

    const old = senderRows().find((r) => r.phone_e164 === PHONE)
    const next = senderRows().find((r) => r.phone_e164 === NEW_PHONE)
    expect(old?.status).toBe('suspended')
    expect(next).toMatchObject({ company_id: 'c1', user_id: 'u1', status: 'active' })
  })

  it('leaves the row alone when the phone did not change', async () => {
    db = makeDb(
      baseTables({
        whatsapp_company_configs: [{ id: 'cfg1', company_id: 'c1', status: 'active' }],
        whatsapp_authorized_senders: [
          { id: 's1', company_id: 'c1', user_id: 'u1', phone_e164: PHONE, status: 'active', created_by_admin: false },
        ],
      }),
    )
    await syncWhatsAppSenderAfterPhoneChange('u1')

    expect(senderRows()).toHaveLength(1)
    expect(senderRows()[0].status).toBe('active')
  })
})

describe('findOwnerCandidateByVerifiedPhone', () => {
  it('matches one verified user with exactly one company (owned + membership counted once)', async () => {
    db = makeDb(baseTables())
    expect(await findOwnerCandidateByVerifiedPhone(PHONE)).toEqual({
      userId: 'u1',
      companyId: 'c1',
      phoneE164: PHONE,
    })
  })

  it('returns null for an unknown phone', async () => {
    db = makeDb(baseTables())
    expect(await findOwnerCandidateByVerifiedPhone('+15550000000')).toBeNull()
  })

  it('returns null when the user belongs to several companies', async () => {
    db = makeDb(
      baseTables({ company_members: [{ user_id: 'u1', company_id: 'c1' }, { user_id: 'u1', company_id: 'c2' }] }),
    )
    expect(await findOwnerCandidateByVerifiedPhone(PHONE)).toBeNull()
  })

  it('returns null when several users share the verified phone', async () => {
    db = makeDb(
      baseTables({
        xtimator_accounts: [
          { id: 'u1', phone: PHONE, phone_confirmed_at: VERIFIED, disabled_at: null },
          { id: 'u2', phone: PHONE, phone_confirmed_at: VERIFIED, disabled_at: null },
        ],
      }),
    )
    expect(await findOwnerCandidateByVerifiedPhone(PHONE)).toBeNull()
  })

  it('ignores an unverified phone', async () => {
    db = makeDb(
      baseTables({ xtimator_accounts: [{ id: 'u1', phone: PHONE, phone_confirmed_at: null, disabled_at: null }] }),
    )
    expect(await findOwnerCandidateByVerifiedPhone(PHONE)).toBeNull()
  })
})
