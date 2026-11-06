import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEED-055 Phase D - getAccessState / assertCanCreate / assertCanEdit.
 * The decision matrix: {enforcement, byok, demo, tier, subscription status,
 * balance} -> active | paywalled | out_of_credits, plus the lost-signup-grant
 * self-heal and the "inert while enforcement is OFF" guarantee.
 */

let enforcementEnabled = true
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => ({ enforcementEnabled }),
}))

const grantSignupCredits = vi.fn()
vi.mock('@/lib/billing/credit-ledger', () => ({
  grantSignupCredits: (...a: unknown[]) => grantSignupCredits(...a),
}))

const requireServiceClient = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => requireServiceClient(),
}))

import {
  getAccessState,
  assertCanCreate,
  assertCanEdit,
} from '@/lib/billing/access-state'
import { DEMO_COMPANY_ID } from '@/lib/demo/config'

type Row = {
  tier: string | null
  credit_balance: number | null
  byok_enabled: boolean | null
  stripe_subscription_id: string | null
  stripe_subscription_status: string | null
  credit_debt?: number | null
}

type Lot = { source: string; remaining: number; expires_at: string | null }

const base: Row = {
  tier: 'free',
  credit_balance: 0,
  byok_enabled: false,
  stripe_subscription_id: null,
  stripe_subscription_status: null,
}

/**
 * Fake supabase client: a mutable company row + a ledger row count + credit
 * lots. When `lots` is omitted the company holds a single signup lot equal to
 * its (positive) cached balance, i.e. the cache and the lots agree.
 */
function fakeClient(state: { row: Row | null; ledgerCount: number; lots?: Lot[] }) {
  return {
    from: (table: string) => {
      if (table === 'credit_lots') {
        return {
          select: () => ({
            eq: () => ({
              in: async (_col: string, sources: string[]) => {
                const lots = state.lots ?? [
                  {
                    source: 'signup',
                    remaining: Math.max(0, state.row?.credit_balance ?? 0),
                    expires_at: null,
                  },
                ]
                return { data: lots.filter((l) => sources.includes(l.source)), error: null }
              },
            }),
          }),
        }
      }
      if (table === 'companies') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
          }),
        }
      }
      if (table === 'credit_ledger') {
        return {
          select: () => ({
            eq: async () => ({ count: state.ledgerCount, error: null }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as never
}

const COMPANY = 'co-1'

beforeEach(() => {
  enforcementEnabled = true
  grantSignupCredits.mockReset()
  requireServiceClient.mockReset()
})

async function stateFor(
  row: Partial<Row>,
  opts: { ledgerCount?: number; companyId?: string; lots?: Lot[] } = {}
) {
  const client = fakeClient({
    row: { ...base, ...row },
    ledgerCount: opts.ledgerCount ?? 5,
    lots: opts.lots,
  })
  return getAccessState(opts.companyId ?? COMPANY, client)
}

describe('getAccessState matrix', () => {
  it('enforcement OFF is always active and never reads the database', async () => {
    enforcementEnabled = false
    const res = await getAccessState(COMPANY)
    expect(res.state).toBe('active')
    expect(res.enforcement).toBe(false)
    expect(requireServiceClient).not.toHaveBeenCalled()
    expect(grantSignupCredits).not.toHaveBeenCalled()
  })

  it('byok company is active even with an empty balance', async () => {
    expect((await stateFor({ byok_enabled: true, credit_balance: 0 })).state).toBe('active')
  })

  it('the demo company is active even with an empty balance', async () => {
    const res = await stateFor({ credit_balance: -50 }, { companyId: DEMO_COMPANY_ID })
    expect(res.state).toBe('active')
  })

  it('positive balance is active on every tier', async () => {
    expect((await stateFor({ tier: 'free', credit_balance: 3 })).state).toBe('active')
    expect(
      (
        await stateFor({
          tier: 'pro',
          credit_balance: 3,
          stripe_subscription_id: 'sub_1',
          stripe_subscription_status: 'active',
        })
      ).state
    ).toBe('active')
  })

  it('free tier with balance <= 0 is paywalled', async () => {
    expect((await stateFor({ tier: 'free', credit_balance: 0 })).state).toBe('paywalled')
    expect((await stateFor({ tier: 'free', credit_balance: -4 })).state).toBe('paywalled')
  })

  it.each(['canceled', 'unpaid'])(
    'pro with %s subscription and no credits is paywalled',
    async (status) => {
      const res = await stateFor({
        tier: 'pro',
        credit_balance: 0,
        stripe_subscription_id: 'sub_1',
        stripe_subscription_status: status,
      })
      expect(res.state).toBe('paywalled')
    }
  )

  it('pro without a subscription id and no credits is paywalled', async () => {
    expect((await stateFor({ tier: 'pro', credit_balance: 0 })).state).toBe('paywalled')
  })

  it.each(['active', 'trialing', 'past_due', null])(
    'pro/business with live status %s and no credits is out_of_credits',
    async (status) => {
      for (const tier of ['pro', 'business']) {
        const res = await stateFor({
          tier,
          credit_balance: 0,
          stripe_subscription_id: 'sub_1',
          stripe_subscription_status: status,
        })
        expect(res.state).toBe('out_of_credits')
      }
    }
  )

  it('reports tier, balance and enforcement', async () => {
    const res = await stateFor({
      tier: 'pro',
      credit_balance: 12,
      stripe_subscription_id: 'sub_1',
      stripe_subscription_status: 'active',
    })
    expect(res).toEqual({ state: 'active', tier: 'pro', balance: 12, enforcement: true })
  })

  it('an unknown company is never locked out', async () => {
    const client = fakeClient({ row: null, ledgerCount: 0 })
    expect((await getAccessState(COMPANY, client)).state).toBe('active')
  })
})

describe('signup-grant self-heal', () => {
  it('grants once and re-reads when a free company has no ledger rows at all', async () => {
    const state = { row: { ...base } as Row, ledgerCount: 0 }
    grantSignupCredits.mockImplementation(async () => {
      state.row = { ...state.row!, credit_balance: 2000 }
      return { applied: true }
    })
    const res = await getAccessState(COMPANY, fakeClient(state))
    expect(grantSignupCredits).toHaveBeenCalledTimes(1)
    expect(grantSignupCredits).toHaveBeenCalledWith(COMPANY)
    expect(res.state).toBe('active')
    expect(res.balance).toBe(2000)
  })

  it('stays paywalled when the grant did not land', async () => {
    grantSignupCredits.mockResolvedValue({ applied: false })
    const res = await getAccessState(COMPANY, fakeClient({ row: { ...base }, ledgerCount: 0 }))
    expect(res.state).toBe('paywalled')
  })

  it('does not grant when the company already has ledger history', async () => {
    await stateFor({ tier: 'free', credit_balance: 0 }, { ledgerCount: 3 })
    expect(grantSignupCredits).not.toHaveBeenCalled()
  })

  it('does not grant to a paid tier, byok, demo or a positive balance', async () => {
    await stateFor({ tier: 'pro', credit_balance: 0 }, { ledgerCount: 0 })
    await stateFor({ byok_enabled: true }, { ledgerCount: 0 })
    await stateFor({}, { ledgerCount: 0, companyId: DEMO_COMPANY_ID })
    await stateFor({ credit_balance: 5 }, { ledgerCount: 0 })
    expect(grantSignupCredits).not.toHaveBeenCalled()
  })
})

describe('assertCanCreate', () => {
  it('ok when active with enough balance', async () => {
    const client = fakeClient({ row: { ...base, credit_balance: 5 }, ledgerCount: 1 })
    expect(await assertCanCreate(COMPANY, 1, client)).toEqual({ ok: true })
  })

  it('refuses paywalled and out_of_credits with the machine code', async () => {
    const free = fakeClient({ row: { ...base }, ledgerCount: 1 })
    expect(await assertCanCreate(COMPANY, 1, free)).toEqual({ ok: false, code: 'paywalled' })
    const pro = fakeClient({
      row: { ...base, tier: 'pro', stripe_subscription_id: 'sub_1', stripe_subscription_status: 'active' },
      ledgerCount: 1,
    })
    expect(await assertCanCreate(COMPANY, 1, pro)).toEqual({ ok: false, code: 'out_of_credits' })
  })

  it('refuses a positive balance that is below the op estimate', async () => {
    const client = fakeClient({ row: { ...base, credit_balance: 2 }, ledgerCount: 1 })
    expect(await assertCanCreate(COMPANY, 5, client)).toEqual({ ok: false, code: 'paywalled' })
  })

  it('byok and demo ignore the estimate', async () => {
    const byok = fakeClient({ row: { ...base, byok_enabled: true }, ledgerCount: 1 })
    expect(await assertCanCreate(COMPANY, 99, byok)).toEqual({ ok: true })
    const demo = fakeClient({ row: { ...base }, ledgerCount: 1 })
    expect(await assertCanCreate(DEMO_COMPANY_ID, 99, demo)).toEqual({ ok: true })
  })

  it('is ok with enforcement OFF', async () => {
    enforcementEnabled = false
    expect(await assertCanCreate(COMPANY, 99)).toEqual({ ok: true })
  })
})

describe('assertCanEdit', () => {
  it('refuses only when paywalled', async () => {
    const free = fakeClient({ row: { ...base }, ledgerCount: 1 })
    expect(await assertCanEdit(COMPANY, free)).toEqual({ ok: false, code: 'paywalled' })
  })

  it('allows editing when out_of_credits (fix a price before sending)', async () => {
    const pro = fakeClient({
      row: { ...base, tier: 'pro', stripe_subscription_id: 'sub_1', stripe_subscription_status: 'active' },
      ledgerCount: 1,
    })
    expect(await assertCanEdit(COMPANY, pro)).toEqual({ ok: true })
  })

  it('allows editing with credits, byok, demo, and with enforcement OFF', async () => {
    expect(
      await assertCanEdit(COMPANY, fakeClient({ row: { ...base, credit_balance: 1 }, ledgerCount: 1 }))
    ).toEqual({ ok: true })
    expect(
      await assertCanEdit(COMPANY, fakeClient({ row: { ...base, byok_enabled: true }, ledgerCount: 1 }))
    ).toEqual({ ok: true })
    expect(
      await assertCanEdit(DEMO_COMPANY_ID, fakeClient({ row: { ...base }, ledgerCount: 1 }))
    ).toEqual({ ok: true })
    enforcementEnabled = false
    expect(await assertCanEdit(COMPANY)).toEqual({ ok: true })
  })
})

describe('spendable balance for non-subscribers (SEED-055 D4)', () => {
  const topup: Lot = { source: 'topup', remaining: 500, expires_at: null }
  const signup = (remaining: number): Lot => ({ source: 'signup', remaining, expires_at: null })
  const proSub = {
    tier: 'pro',
    stripe_subscription_id: 'sub_1',
    stripe_subscription_status: 'active',
  }

  it('a free company holding only a topup lot is paywalled despite a positive cached balance', async () => {
    const res = await stateFor({ tier: 'free', credit_balance: 500 }, { lots: [topup] })
    expect(res.state).toBe('paywalled')
    expect(res.balance).toBe(0)
  })

  it('a pro subscriber with the same topup lot is active and uses credit_balance', async () => {
    const res = await stateFor({ ...proSub, credit_balance: 500 }, { lots: [topup] })
    expect(res.state).toBe('active')
    expect(res.balance).toBe(500)
  })

  it('signup and adjust lots stay spendable without a subscription', async () => {
    const adjust: Lot = { source: 'adjust', remaining: 40, expires_at: null }
    const res = await stateFor(
      { tier: 'free', credit_balance: 590 },
      { lots: [signup(50), adjust, topup] }
    )
    expect(res.state).toBe('active')
    expect(res.balance).toBe(90)
  })

  it('credit_debt is subtracted from the spendable balance', async () => {
    const res = await stateFor(
      { tier: 'free', credit_balance: 0, credit_debt: 30 },
      { lots: [signup(30)] }
    )
    expect(res.state).toBe('paywalled')
    expect(res.balance).toBe(0)
  })

  it('expired signup lots do not count', async () => {
    const expired: Lot = { source: 'signup', remaining: 100, expires_at: '2020-01-01T00:00:00Z' }
    expect((await stateFor({ tier: 'free', credit_balance: 100 }, { lots: [expired] })).state).toBe(
      'paywalled'
    )
  })

  it('a canceled subscriber cannot spend a leftover topup lot', async () => {
    const res = await stateFor(
      { tier: 'pro', credit_balance: 500, stripe_subscription_id: 'sub_1', stripe_subscription_status: 'canceled' },
      { lots: [topup] }
    )
    expect(res.state).toBe('paywalled')
  })

  it('assertCanCreate compares the estimate against the spendable balance', async () => {
    const client = fakeClient({
      row: { ...base, credit_balance: 500 },
      ledgerCount: 1,
      lots: [signup(2), topup],
    })
    expect(await assertCanCreate(COMPANY, 5, client)).toEqual({ ok: false, code: 'paywalled' })
    expect(await assertCanCreate(COMPANY, 2, client)).toEqual({ ok: true })
  })

  it('falls back to the cached balance when the lots cannot be read', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'credit_lots') {
          return {
            select: () => ({
              eq: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }),
            }),
          }
        }
        return fakeClient({ row: { ...base, credit_balance: 7 }, ledgerCount: 1 }).from(table)
      },
    } as never
    expect((await getAccessState(COMPANY, client)).state).toBe('active')
  })
})
