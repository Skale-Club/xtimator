import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

/**
 * Phase 2a - lib/whatsapp/credits.ts: WhatsApp-originated AI work debits credits
 * like the web paths. Runs the REAL recordCreditDebit / recordAICost against a
 * stateful fake service client whose consume_credits RPC dedupes on
 * p_idempotency_key (as the SQL function does), so "retry -> no second debit" is
 * proven end to end through the ledger key, not just asserted on call counts.
 */

vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/billing/auto-topup', () => ({
  triggerAutoTopupIfNeeded: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/copy', () => ({
  buildNotificationCopy: vi.fn().mockReturnValue({ title: 't', body: 'b' }),
}))

let billingConfig: {
  markup: number
  creditUnitUsd: number
  enforcementEnabled: boolean
  lowBalanceThresholds: number[]
  meteredOperations?: Record<string, boolean>
} = {
  markup: 4.5,
  creditUnitUsd: 0.01,
  enforcementEnabled: false,
  lowBalanceThresholds: [],
}
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => billingConfig,
}))

type CostRow = { attempt_id: string; operation_type: string; real_cost_usd: number | null }
const state = {
  costRows: [] as CostRow[],
  inserted: [] as Array<Record<string, unknown>>,
  byok: false,
  appliedKeys: new Set<string>(),
  rpcCalls: [] as Array<{ fn: string; params: Record<string, unknown> }>,
}

function makeSvc() {
  return {
    from(table: string) {
      if (table === 'ai_cost_events') {
        return {
          select() {
            const filter = { attempt: '' }
            const chain = {
              eq(_col: string, value: string) {
                filter.attempt = value
                return chain
              },
              in(_col: string, ops: string[]) {
                return Promise.resolve({
                  data: state.costRows.filter(
                    (r) => r.attempt_id === filter.attempt && ops.includes(r.operation_type)
                  ),
                  error: null,
                })
              },
            }
            return chain
          },
          insert(row: Record<string, unknown>) {
            state.inserted.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      // companies: BYOK flag + cached balance
      return {
        select() {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({ data: { byok_enabled: state.byok }, error: null }),
            single: async () => ({ data: { credit_balance: 1000 }, error: null }),
          }
          return chain
        },
      }
    },
    rpc(fn: string, params: Record<string, unknown>) {
      state.rpcCalls.push({ fn, params })
      const key = params.p_idempotency_key as string
      if (state.appliedKeys.has(key)) {
        return Promise.resolve({ data: [{ balance_after: 900, applied: false }], error: null })
      }
      state.appliedKeys.add(key)
      return Promise.resolve({ data: [{ balance_after: 900, applied: true }], error: null })
    },
  }
}
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => makeSvc() }))

import {
  waAttemptId,
  waGenerationAttemptId,
  debitWhatsAppMedia,
  debitWhatsAppEstimate,
  settleWhatsAppChat,
} from '@/lib/whatsapp/credits'
import { createCostMeter } from '@/lib/whatsapp/cost-meter'

const COMPANY = 'company-1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  state.costRows = []
  state.inserted = []
  state.byok = false
  state.appliedKeys = new Set()
  state.rpcCalls = []
  billingConfig = {
    markup: 4.5,
    creditUnitUsd: 0.01,
    enforcementEnabled: false,
    lowBalanceThresholds: [],
  }
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('attempt ids', () => {
  it('are deterministic UUIDs (ai_cost_events.attempt_id is a uuid column)', () => {
    expect(waAttemptId('wamid.A')).toMatch(UUID_RE)
    expect(waAttemptId('wamid.A')).toBe(waAttemptId('wamid.A'))
    expect(waAttemptId('wamid.A')).not.toBe(waAttemptId('wamid.B'))
  })

  it('keep message attempts and generation attempts apart', () => {
    expect(waGenerationAttemptId('wa-batch-1')).toMatch(UUID_RE)
    expect(waGenerationAttemptId('wa-batch-1')).not.toBe(waAttemptId('wa-batch-1'))
  })
})

describe('debitWhatsAppMedia - audio', () => {
  it('debits audio_minutes once with the stable `${attemptId}:debit:audio_minutes` key; a retry does not debit again', async () => {
    const attemptId = waAttemptId('wamid.voice')
    state.costRows = [{ attempt_id: attemptId, operation_type: 'audio_minutes', real_cost_usd: 0.006 }]

    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.voice', kind: 'audio' })
    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.voice', kind: 'audio' }) // Inngest retry

    expect(state.rpcCalls).toHaveLength(2)
    const [first, second] = state.rpcCalls
    expect(first.params.p_idempotency_key).toBe(`${attemptId}:debit:audio_minutes`)
    expect(second.params.p_idempotency_key).toBe(first.params.p_idempotency_key)
    expect(first.params.p_operation_type).toBe('audio_minutes')
    expect(first.params.p_company_id).toBe(COMPANY)
    // round(0.006 x 4.5 / 0.01) = 3 credits, same formula as the web paths.
    expect(first.params.p_credits).toBe(3)
    // The ledger dedupes on the key: exactly one key was ever applied.
    expect(state.appliedKeys.size).toBe(1)
  })

  it('does not debit when no cost was recorded (null, never a guessed 0)', async () => {
    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.silent', kind: 'audio' })
    expect(state.rpcCalls).toHaveLength(0)
  })
})

describe('debitWhatsAppMedia - photo', () => {
  it('debits photo_batch from the vision cost row under the message attempt, ignoring other ops', async () => {
    const attemptId = waAttemptId('wamid.photo')
    state.costRows = [
      { attempt_id: attemptId, operation_type: 'vision', real_cost_usd: 0.004 },
      { attempt_id: attemptId, operation_type: 'chat', real_cost_usd: 5 },
      { attempt_id: waAttemptId('wamid.other'), operation_type: 'vision', real_cost_usd: 5 },
    ]

    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.photo', kind: 'photo' })

    expect(state.rpcCalls).toHaveLength(1)
    const call = state.rpcCalls[0].params
    expect(call.p_operation_type).toBe('photo_batch')
    expect(call.p_idempotency_key).toBe(`${attemptId}:debit:photo_batch`)
    expect(call.p_real_cost_usd).toBeCloseTo(0.004)
    expect(call.p_credits).toBe(2) // round(0.004 x 4.5 / 0.01) = 2
  })

  it('router and CREATE graph reading the same voice note share ONE key (no double debit)', async () => {
    const attemptId = waAttemptId('wamid.shared')
    state.costRows = [{ attempt_id: attemptId, operation_type: 'audio_minutes', real_cost_usd: 0.01 }]

    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.shared', kind: 'audio' }) // router normalize
    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.shared', kind: 'audio' }) // CREATE graph

    expect(state.appliedKeys.size).toBe(1)
  })
})

describe('BYOK and metering config are honoured centrally', () => {
  it('BYOK company: nothing is debited for media, estimate or chat', async () => {
    state.byok = true
    const media = waAttemptId('wamid.byok')
    const gen = waGenerationAttemptId('wa-batch-byok')
    state.costRows = [
      { attempt_id: media, operation_type: 'audio_minutes', real_cost_usd: 0.01 },
      { attempt_id: gen, operation_type: 'estimate', real_cost_usd: 0.5 },
    ]
    const meter = createCostMeter()
    meter.calls = 1
    meter.addCost(0.02)

    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.byok', kind: 'audio' })
    await debitWhatsAppEstimate({ companyId: COMPANY, attemptId: gen })
    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.byok', meter })

    expect(state.rpcCalls).toHaveLength(0)
    // The real cost is still RECORDED for BYOK (the web chat route does the same).
    expect(state.inserted.some((r) => r.operation_type === 'chat')).toBe(true)
  })

  it('an operation switched off in billing_config.meteredOperations is absorbed', async () => {
    billingConfig = { ...billingConfig, meteredOperations: { chat: false } }
    const meter = createCostMeter()
    meter.calls = 1
    meter.addCost(0.02)
    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.absorbed', meter })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('enforcementEnabled does not change recording: the debit is still written (blocking is checkCredits)', async () => {
    billingConfig = { ...billingConfig, enforcementEnabled: true }
    const attemptId = waAttemptId('wamid.enforced')
    state.costRows = [{ attempt_id: attemptId, operation_type: 'audio_minutes', real_cost_usd: 0.01 }]
    await debitWhatsAppMedia({ companyId: COMPANY, wamid: 'wamid.enforced', kind: 'audio' })
    expect(state.rpcCalls).toHaveLength(1)
  })
})

describe('debitWhatsAppEstimate', () => {
  it('debits ONE estimate per generation attempt: sums estimate + estimate_retry, ignores audio/vision/price_research', async () => {
    const gen = waGenerationAttemptId('wa-batch-1')
    state.costRows = [
      { attempt_id: gen, operation_type: 'estimate', real_cost_usd: 0.1 },
      { attempt_id: gen, operation_type: 'estimate_retry', real_cost_usd: 0.05 },
      { attempt_id: gen, operation_type: 'price_research', real_cost_usd: 9 },
      { attempt_id: gen, operation_type: 'audio_minutes', real_cost_usd: 9 },
    ]

    await debitWhatsAppEstimate({ companyId: COMPANY, attemptId: gen })
    await debitWhatsAppEstimate({ companyId: COMPANY, attemptId: gen }) // Inngest retry of the debit step

    expect(state.rpcCalls).toHaveLength(2)
    const call = state.rpcCalls[0].params
    expect(call.p_operation_type).toBe('estimate')
    expect(call.p_idempotency_key).toBe(`${gen}:debit:estimate`)
    expect(call.p_real_cost_usd).toBeCloseTo(0.15)
    expect(state.appliedKeys.size).toBe(1)
  })
})

describe('settleWhatsAppChat', () => {
  it('records ONE chat cost row and ONE chat debit keyed on the wamid, like the web chat turn', async () => {
    const meter = createCostMeter()
    meter.calls = 3 // classifier + two agent steps
    meter.addCost(0.001)
    meter.addCost(0.012)
    meter.model = 'anthropic/claude-sonnet-5.5'

    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.chat', meter })
    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.chat', meter }) // job retry

    const attemptId = waAttemptId('wamid.chat')
    const chatRow = state.inserted.find((r) => r.operation_type === 'chat')
    expect(chatRow).toMatchObject({
      attempt_id: attemptId,
      company_id: COMPANY,
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-5.5',
    })
    expect(chatRow?.real_cost_usd).toBeCloseTo(0.013)
    expect(state.rpcCalls[0].params.p_idempotency_key).toBe(`${attemptId}:debit:chat`)
    expect(state.rpcCalls[0].params.p_operation_type).toBe('chat')
    expect(state.rpcCalls[0].params.p_credits).toBe(6) // round(0.013 x 4.5 / 0.01) = 6
    expect(state.appliedKeys.size).toBe(1)
  })

  it('no LLM call (welcome, pending-send reply, unreadable media) records and charges nothing', async () => {
    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.none', meter: createCostMeter() })
    expect(state.inserted).toHaveLength(0)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('a call whose provider reported no cost records a null-cost row and no debit', async () => {
    const meter = createCostMeter()
    meter.calls = 1
    await settleWhatsAppChat({ companyId: COMPANY, wamid: 'wamid.nocost', meter })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0].real_cost_usd).toBeNull()
    expect(state.rpcCalls).toHaveLength(0)
  })
})
