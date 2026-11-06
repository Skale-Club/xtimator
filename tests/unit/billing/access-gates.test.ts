import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEED-055 Phase D - the server-side creation / edit gates.
 *
 * Runs the REAL access-state + access-guard against a fake company row, with the
 * action modules' own dependencies stubbed. For every gated entry point:
 *   - paywalled        -> refused with code 'paywalled' (create AND edit)
 *   - out_of_credits   -> create refused with 'out_of_credits', edit allowed
 *   - enforcement OFF  -> the gate is inert (the action proceeds past it)
 */

// ---- mutable fixtures -------------------------------------------------------
let enforcementEnabled = true
type CompanyRow = {
  tier: string
  credit_balance: number
  byok_enabled: boolean
  stripe_subscription_id: string | null
  stripe_subscription_status: string | null
}
const FREE_EMPTY: CompanyRow = {
  tier: 'free',
  credit_balance: 0,
  byok_enabled: false,
  stripe_subscription_id: null,
  stripe_subscription_status: null,
}
const PRO_EMPTY: CompanyRow = {
  tier: 'pro',
  credit_balance: 0,
  byok_enabled: false,
  stripe_subscription_id: 'sub_1',
  stripe_subscription_status: 'active',
}
let companyRow: CompanyRow = FREE_EMPTY

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: async () => ({
    enforcementEnabled,
    estimatedCreditsByOp: { estimate: 1, photo_batch: 1, audio_minutes: 1, price_research: 1, chat: 1 },
  }),
}))
vi.mock('@/lib/billing/credit-ledger', () => ({
  grantSignupCredits: vi.fn().mockResolvedValue({ applied: false }),
  checkCredits: vi.fn().mockResolvedValue({ allowed: true, balance: 1, shortfall: 0 }),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) =>
      table === 'companies'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: companyRow, error: null }) }) }) }
        : table === 'credit_lots'
          ? {
              // Non-subscribers spend signup/adjust lots only: one signup lot
              // that mirrors the fixture's cached balance.
              select: () => ({
                eq: () => ({
                  in: async () => ({
                    data: [{ source: 'signup', remaining: Math.max(0, companyRow?.credit_balance ?? 0), expires_at: null }],
                    error: null,
                  }),
                }),
              }),
            }
          : { select: () => ({ eq: async () => ({ count: 3, error: null }) }) },
  }),
  createServiceClient: () => null,
}))

// ---- action-module dependencies ---------------------------------------------
/** A chainable, awaitable stand-in for a supabase query builder. */
function chain(result: unknown): unknown {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return () => p
    },
    apply: () => p,
  })
  return p
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1', email: 'o@x.com' } } }) },
    rpc: async () => ({ data: null, error: { message: 'stub' } }),
    from: (table: string) =>
      table === 'companies'
        ? chain({ data: { id: 'co-1', currency_code: 'USD', default_tax_rate: 0 }, error: null })
        : chain({ data: null, error: null }),
  }),
}))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: async () => 'co-1',
  ACTIVE_COMPANY_COOKIE: 'x',
  ACTIVE_COMPANY_COOKIE_OPTIONS: {},
}))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: async () => null,
  assertCompanyWritable: async () => null,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }))
vi.mock('@/lib/inngest/job-ownership', () => ({ recordJobOwnership: vi.fn() }))

import { createBlankEstimate, saveEstimate, deleteEstimateSection } from '@/lib/actions/estimate'
import { createProjectAction, renameProjectAction, duplicateProjectAction } from '@/lib/actions/project'
import { createClientAction, updateClientAction } from '@/lib/actions/client'
import { createFolder } from '@/lib/actions/price-book'
import { createEstimate } from '@/lib/agent-tools/create-estimate'
import { createProject as createAgentProject } from '@/lib/agent-tools/create-project'

const clientForm = { name: 'Acme' } as never
const estimatePayload = {
  id: 'e1',
  summary: null,
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
  discount_type: null,
  discount_value: 0,
  tax_rate: 0,
  sections: [],
  estimate_date: null,
  estimate_number: null,
} as never

beforeEach(() => {
  enforcementEnabled = true
  companyRow = FREE_EMPTY
})

type Result = { code?: string; error?: string } | undefined | null
const codeOf = (r: unknown) => (r as Result)?.code

// Entry points that CREATE something.
const createGates: Array<[string, () => Promise<unknown>]> = [
  ['createBlankEstimate', () => createBlankEstimate('p1')],
  ['createProjectAction', () => createProjectAction({} as never)],
  ['duplicateProjectAction', () => duplicateProjectAction('p1')],
  ['createClientAction', () => createClientAction(clientForm)],
]
// Entry points that EDIT existing data (refused only when paywalled).
const editGates: Array<[string, () => Promise<unknown>]> = [
  ['saveEstimate', () => saveEstimate(estimatePayload)],
  ['deleteEstimateSection', () => deleteEstimateSection('s1')],
  ['renameProjectAction', () => renameProjectAction('p1', 'New name')],
  ['updateClientAction', () => updateClientAction('c1', clientForm)],
  ['createFolder (price book write)', () => createFolder('Plumbing')],
]

describe('paywalled company (free, no credits): read-only', () => {
  it.each([...createGates, ...editGates])('%s is refused with code paywalled', async (_name, run) => {
    const res = await run()
    expect(codeOf(res)).toBe('paywalled')
    expect((res as { error: string }).error).toMatch(/subscribe/i)
  })

  it('the neutral agent createEstimate (MCP / chat / WhatsApp) refuses', async () => {
    const { checkCredits } = await import('@/lib/billing/credit-ledger')
    vi.mocked(checkCredits).mockResolvedValueOnce({ allowed: false, balance: 0, shortfall: 1 })
    await expect(
      createEstimate({ companyId: 'co-1', projectId: 'p1', channel: 'mcp' })
    ).rejects.toThrow(/subscribe/i)
  })

  it('the agent createProject tool refuses with a message', async () => {
    const res = await createAgentProject({} as never, 'co-1', { name: 'Job' }, 'mcp')
    expect(res).toMatchObject({ ok: false })
    expect((res as { message: string }).message).toMatch(/subscribe/i)
  })
})

describe('out_of_credits company (Pro, subscription live, no credits)', () => {
  beforeEach(() => {
    companyRow = PRO_EMPTY
  })

  it.each(createGates)('%s is refused with code out_of_credits', async (_name, run) => {
    expect(codeOf(await run())).toBe('out_of_credits')
  })

  it.each(editGates)('%s is NOT blocked by billing (editing stays allowed)', async (_name, run) => {
    const code = codeOf(await run())
    expect(code).not.toBe('paywalled')
    expect(code).not.toBe('out_of_credits')
  })

  it('the neutral agent createEstimate names the Buy credits path', async () => {
    const { checkCredits } = await import('@/lib/billing/credit-ledger')
    vi.mocked(checkCredits).mockResolvedValueOnce({ allowed: false, balance: 0, shortfall: 1 })
    await expect(
      createEstimate({ companyId: 'co-1', projectId: 'p1', channel: 'mcp' })
    ).rejects.toThrow(/buy credits/i)
  })
})

describe('active company (credits left)', () => {
  it.each([...createGates, ...editGates])('%s is not blocked', async (_name, run) => {
    companyRow = { ...FREE_EMPTY, credit_balance: 40 }
    const code = codeOf(await run())
    expect(code).not.toBe('paywalled')
    expect(code).not.toBe('out_of_credits')
  })
})

describe('enforcement OFF: every gate is inert', () => {
  beforeEach(() => {
    enforcementEnabled = false
    companyRow = FREE_EMPTY
  })

  it.each([...createGates, ...editGates])('%s is not blocked', async (_name, run) => {
    const code = codeOf(await run())
    expect(code).not.toBe('paywalled')
    expect(code).not.toBe('out_of_credits')
  })
})

describe('gates fail open on infrastructure errors', () => {
  it('an unreadable company row never blocks the action', async () => {
    const { billingCreateDenied, billingEditDenied } = await import('@/lib/billing/access-guard')
    companyRow = null as never // makes the fake company read throw downstream
    expect(await billingCreateDenied('co-1')).toBeNull()
    expect(await billingEditDenied('co-1')).toBeNull()
    expect(await billingCreateDenied(null)).toBeNull()
  })
})
