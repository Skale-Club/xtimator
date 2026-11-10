import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeFakeDb, type Row } from '../billing/messaging-fake-db'

/**
 * Phase 2b - hourly messaging debit job. recordMessagingDebit is mocked (its math is
 * covered in tests/unit/billing/messaging-debit.test.ts); this file locks which rows
 * are debitable, the claim -> debit -> settle protocol, idempotent re-runs, and the
 * Inngest wiring.
 */

let db = makeFakeDb()
const mockDebit = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => db.client,
  createServiceClient: () => db.client,
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  recordMessagingDebit: (...a: unknown[]) => mockDebit(...a),
}))

import { runDebitMessagingCosts, debitMessagingCostsJob } from '@/lib/inngest/functions/debit-messaging-costs'

let seq = 0
function row(over: Row = {}): Row {
  seq += 1
  return {
    id: `evt-${seq}`,
    company_id: 'co-1',
    channel: 'sms',
    provider: 'twilio',
    provider_message_id: `m-${seq}`,
    purpose: 'customer_message',
    billable: true,
    status: 'sent',
    cost_usd: 0.0083,
    debited_at: null,
    debit_batch_id: null,
    ...over,
  }
}

const rowsOf = (): Row[] => db.tables.messaging_cost_events

beforeEach(() => {
  seq = 0
  mockDebit.mockReset()
  mockDebit.mockResolvedValue('debited')
})

describe('runDebitMessagingCosts', () => {
  it('sums the billable priced rows of each company, debits ONCE per company and marks them debited', async () => {
    db = makeFakeDb({
      messaging_cost_events: [
        row({ id: 'a', cost_usd: 0.0083 }),
        row({ id: 'b', channel: 'email', provider: 'resend', cost_usd: 0.0004 }),
        row({ id: 'c', channel: 'whatsapp', provider: 'meta', status: 'delivered', cost_usd: 0.0034 }),
        row({ id: 'd', company_id: 'co-2', channel: 'email', provider: 'resend', cost_usd: 0.0004 }),
      ],
    })
    const result = await runDebitMessagingCosts()

    expect(mockDebit).toHaveBeenCalledTimes(2)
    const calls = Object.fromEntries(
      mockDebit.mock.calls.map(([arg]) => [
        (arg as { companyId: string }).companyId,
        arg as { realCostUsd: number; batchId: string },
      ])
    )
    expect(calls['co-1'].realCostUsd).toBeCloseTo(0.0121, 6) // one sum, rounded once by the ledger
    expect(calls['co-2'].realCostUsd).toBeCloseTo(0.0004, 6)
    expect(calls['co-1'].batchId).not.toBe(calls['co-2'].batchId)

    for (const r of rowsOf()) {
      expect(r.debited_at).not.toBeNull()
      expect(r.debit_batch_id).toBe(calls[r.company_id as string].batchId)
    }
    expect(result).toMatchObject({ debited: 2, carriedOver: 0, failed: 0, rowsSettled: 4 })
  })

  it('skips non-billable rows, undelivered WhatsApp, unpriced, zero-cost, failed and already-debited rows', async () => {
    db = makeFakeDb({
      messaging_cost_events: [
        row({ id: 'welcome', channel: 'whatsapp', provider: 'meta', purpose: 'welcome', billable: false, status: 'delivered' }),
        row({ id: 'otp', purpose: 'otp', billable: false }),
        row({ id: 'wa-sent', channel: 'whatsapp', provider: 'meta', status: 'sent', cost_usd: null }),
        row({ id: 'wa-sent-priced', channel: 'whatsapp', provider: 'meta', status: 'sent', cost_usd: 0.0034 }),
        row({ id: 'wa-failed', channel: 'whatsapp', provider: 'meta', status: 'failed', cost_usd: 0 }),
        row({ id: 'wa-free', channel: 'whatsapp', provider: 'meta', status: 'delivered', cost_usd: 0 }),
        row({ id: 'unpriced', cost_usd: null }),
        row({ id: 'platform', company_id: null }),
        row({ id: 'done', debited_at: '2026-11-01T00:00:00Z', debit_batch_id: 'old' }),
      ],
    })
    const result = await runDebitMessagingCosts()
    expect(mockDebit).not.toHaveBeenCalled()
    expect(result).toMatchObject({ debited: 0, carriedOver: 0, failed: 0, rowsSettled: 0 })
    expect(rowsOf().filter((r) => r.debit_batch_id && r.id !== 'done')).toHaveLength(0)
  })

  it('is idempotent: a second run finds nothing to claim and debits nothing more', async () => {
    db = makeFakeDb({ messaging_cost_events: [row(), row({ cost_usd: 0.0083 })] })
    await runDebitMessagingCosts()
    expect(mockDebit).toHaveBeenCalledTimes(1)
    const second = await runDebitMessagingCosts()
    expect(mockDebit).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ debited: 0, rowsSettled: 0 })
  })

  it('a batch that rounds to 0 credits is released and keeps accumulating into the next run', async () => {
    db = makeFakeDb({
      messaging_cost_events: [row({ id: 'tiny', channel: 'email', provider: 'resend', cost_usd: 0.0004 })],
    })
    mockDebit.mockResolvedValueOnce('below_minimum')
    const first = await runDebitMessagingCosts()
    expect(first).toMatchObject({ debited: 0, carriedOver: 1 })
    expect(rowsOf()[0].debit_batch_id).toBeNull()
    expect(rowsOf()[0].debited_at).toBeNull()

    // more email arrives; the next run debits the accumulated total in one go
    rowsOf().push(row({ id: 'tiny2', channel: 'email', provider: 'resend', cost_usd: 0.0004 }))
    mockDebit.mockResolvedValueOnce('debited')
    const second = await runDebitMessagingCosts()
    expect(second).toMatchObject({ debited: 1, rowsSettled: 2 })
    expect((mockDebit.mock.calls[1][0] as { realCostUsd: number }).realCostUsd).toBeCloseTo(0.0008, 6)
  })

  it('keeps the claim when the ledger write fails and retries the SAME batch id next run', async () => {
    db = makeFakeDb({ messaging_cost_events: [row({ id: 'x' }), row({ id: 'y' })] })
    mockDebit.mockResolvedValueOnce('failed')
    const first = await runDebitMessagingCosts()
    expect(first).toMatchObject({ failed: 1, debited: 0 })
    const batchId = rowsOf()[0].debit_batch_id as string
    expect(batchId).toBeTruthy()
    expect(rowsOf().every((r) => r.debited_at === null && r.debit_batch_id === batchId)).toBe(true)

    mockDebit.mockResolvedValueOnce('already_applied') // the first attempt had actually landed
    const second = await runDebitMessagingCosts()
    expect(mockDebit).toHaveBeenCalledTimes(2)
    expect((mockDebit.mock.calls[1][0] as { batchId: string }).batchId).toBe(batchId)
    expect(second).toMatchObject({ debited: 1, rowsSettled: 2 })
    expect(rowsOf().every((r) => r.debited_at !== null)).toBe(true)
  })

  it('rows already claimed by another run are never put in a second batch', async () => {
    db = makeFakeDb({
      messaging_cost_events: [row({ id: 'taken', debit_batch_id: 'other-run' }), row({ id: 'free' })],
    })
    await runDebitMessagingCosts()
    // 'taken' is settled by the recovery pass under ITS batch id, 'free' under a fresh one.
    const batchIds = mockDebit.mock.calls.map(([a]) => (a as { batchId: string }).batchId)
    expect(new Set(batchIds).size).toBe(batchIds.length)
    expect(batchIds).toContain('other-run')
    expect(rowsOf().find((r) => r.id === 'taken')!.debit_batch_id).toBe('other-run')
  })
})

describe('debitMessagingCostsJob wiring', () => {
  it('is an hourly cron registered in the Inngest serve route', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/inngest/functions/debit-messaging-costs.ts'), 'utf8')
    expect(src).toMatch(/id: 'debit-messaging-costs'/)
    expect(src).toMatch(/cron: '10 \* \* \* \*'/)
    const route = readFileSync(resolve(process.cwd(), 'app/api/inngest/route.ts'), 'utf8')
    expect(route.match(/debitMessagingCostsJob/g)?.length).toBe(2)
    const barrel = readFileSync(resolve(process.cwd(), 'lib/inngest/functions/index.ts'), 'utf8')
    expect(barrel).toMatch(/debitMessagingCostsJob/)
    expect(debitMessagingCostsJob).toBeDefined()
  })
})
