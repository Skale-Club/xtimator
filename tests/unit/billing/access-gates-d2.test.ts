import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEED-055 Phase D2 - the remaining paywall (read-only) gates, run against the
 * REAL access-state + access-guard with a fake company row:
 *   markAsSentAction, logDeliveryAction, setEstimateSharePassword,
 *   photo actions, estimate-photo actions, estimate-template, company-knowledge,
 *   agent tools (create-service, add-knowledge, customer-message draft/confirm)
 *   -> refused while paywalled, allowed when out_of_credits / credits left /
 *      enforcement OFF.
 * createTextRecording additionally has a CREATE gate (out_of_credits refused).
 */

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
              select: () => ({
                eq: () => ({
                  in: async () => ({
                    data: [{ source: 'signup', remaining: Math.max(0, companyRow.credit_balance), expires_at: null }],
                    error: null,
                  }),
                }),
              }),
            }
          : { select: () => ({ eq: async () => ({ count: 3, error: null }) }) },
  }),
  createServiceClient: () => null,
}))

/** Records every table that gets written to, so "refused" can prove no write. */
const writes: string[] = []
function chain(result: unknown, table?: string): unknown {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      if ((prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'upsert') && table) {
        return () => {
          writes.push(`${table}.${String(prop)}`)
          return p
        }
      }
      return () => p
    },
    apply: () => p,
  })
  return p
}
const supabaseStub = {
  auth: { getClaims: async () => ({ data: { claims: { sub: 'user-1', email: 'o@x.com' } } }) },
  rpc: async () => ({ data: null, error: { message: 'stub' } }),
  from: (table: string) =>
    table === 'companies'
      ? chain({ data: { id: 'co-1', currency_code: 'USD', default_tax_rate: 0 }, error: null }, table)
      : chain({ data: null, error: null }, table),
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabaseStub }))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: async () => 'co-1',
  ACTIVE_COMPANY_COOKIE: 'x',
  ACTIVE_COMPANY_COOKIE_OPTIONS: {},
}))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: async () => null,
  assertCompanyWritable: async () => null,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue({ ids: [] }) } }))
vi.mock('@/lib/inngest/job-ownership', () => ({ recordJobOwnership: vi.fn() }))
vi.mock('@/lib/storage/server', () => ({ serverStorage: () => ({ upload: vi.fn(), remove: vi.fn() }) }))
vi.mock('@/lib/image/webp', () => ({ convertImageToWebp: vi.fn().mockResolvedValue(Buffer.from('x')) }))
vi.mock('@/lib/knowledge/embed', () => ({ embed: vi.fn().mockResolvedValue([0.1, 0.2]) }))
vi.mock('@/lib/notifications/agentic-send-confirm', () => ({
  createSendConfirmation: vi.fn().mockResolvedValue({ id: 'c1', token: 't1' }),
  resolvePendingByChannelRef: vi.fn().mockResolvedValue(null),
  resolveByToken: vi.fn().mockResolvedValue(null),
  markConfirmed: vi.fn(),
  markCancelled: vi.fn(),
  markRefused: vi.fn(),
  verifyBinding: vi.fn(),
  checkAgenticSendRateLimit: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/notifications/customer-send-gate', () => ({ assertSendAllowed: vi.fn() }))
vi.mock('@/lib/notifications/customer-send', () => ({ sendCustomerMessage: vi.fn() }))

import { markAsSentAction, logDeliveryAction, setEstimateSharePassword } from '@/lib/actions/estimate'
import { updatePhotoCaption, deletePhoto, reorderPhotos, createPhoto } from '@/lib/actions/photo'
import { addPhotoToEstimate, removePhotoFromEstimate } from '@/lib/actions/estimate-photo'
import { saveEstimateTemplate } from '@/lib/actions/estimate-template'
import { createCompanyEntry, deleteCompanyEntry } from '@/lib/actions/company-knowledge'
import { createTextRecording } from '@/lib/actions/recording'
import { createPriceBookService } from '@/lib/agent-tools/create-service'
import { addCompanyKnowledge } from '@/lib/agent-tools/add-knowledge'
import {
  draftCustomerMessage,
  confirmSendByToken,
  confirmSendByChannelRef,
} from '@/lib/agent-tools/send-customer-message'

beforeEach(() => {
  enforcementEnabled = true
  companyRow = FREE_EMPTY
  writes.length = 0
})

type Result = { code?: string; error?: string; message?: string } | undefined | null
const asResult = (r: unknown) => r as Result
/** Refused by the paywall: machine code, or (when an action only forwards the text) its message. */
const paywalled = (r: unknown) =>
  asResult(r)?.code === 'paywalled' ||
  /subscribe/i.test(asResult(r)?.error ?? '') ||
  /subscribe/i.test(asResult(r)?.message ?? '')

const svc = supabaseStub as never
const draftParams = {
  companyId: 'co-1',
  clientQuery: 'Sarah',
  channel: 'sms' as const,
  body: 'Running late',
  triggerSource: 'agentic-mcp' as never,
}

/** Each entry resolves to whether the call was refused by the billing gate. */
const gated: Array<[string, () => Promise<boolean>]> = [
  ['markAsSentAction', async () => paywalled(await markAsSentAction('e1'))],
  [
    'setEstimateSharePassword',
    async () => /subscribe/i.test(asResult(await setEstimateSharePassword('e1', 'secret123'))?.error ?? ''),
  ],
  ['updatePhotoCaption', async () => paywalled(await updatePhotoCaption('ph1', 'x'))],
  ['deletePhoto', async () => paywalled(await deletePhoto('ph1'))],
  ['reorderPhotos', async () => paywalled(await reorderPhotos(['a', 'b']))],
  ['createPhoto', async () => paywalled(await createPhoto('p1', 'co-1/p1/x.webp', 0))],
  ['addPhotoToEstimate', async () => paywalled(await addPhotoToEstimate('e1', 'ph1'))],
  [
    'removePhotoFromEstimate',
    async () => paywalled(await removePhotoFromEstimate('e1', 'ph1')),
  ],
  [
    'saveEstimateTemplate',
    async () => paywalled(await saveEstimateTemplate({ greeting: null, opener: null } as never)),
  ],
  [
    'createCompanyEntry',
    async () => paywalled(await createCompanyEntry({ title: 'T', body: 'B' } as never)),
  ],
  ['deleteCompanyEntry', async () => paywalled(await deleteCompanyEntry('k1'))],
  [
    'agent createPriceBookService',
    async () =>
      /subscribe/i.test(
        asResult(await createPriceBookService(svc, 'co-1', { name: 'Faucet', unitPrice: 10 }))?.message ?? ''
      ),
  ],
  [
    'agent addCompanyKnowledge',
    async () =>
      /subscribe/i.test(asResult(await addCompanyKnowledge(svc, 'co-1', { title: 'T', body: 'B' }))?.message ?? ''),
  ],
  [
    'agent draftCustomerMessage',
    async () => {
      const r = (await draftCustomerMessage(svc, draftParams as never)) as { ok: boolean; error?: string }
      return r.ok === false && r.error === 'paywalled'
    },
  ],
  ['agent confirmSendByToken', async () => (await confirmSendByToken(svc, 'co-1', 'tok')).error === 'paywalled'],
  [
    'agent confirmSendByChannelRef',
    async () => (await confirmSendByChannelRef(svc, 'co-1', 'ref')).error === 'paywalled',
  ],
]

describe('paywalled company is read-only on the D2 entry points', () => {
  it.each(gated)('%s is refused', async (_name, run) => {
    expect(await run()).toBe(true)
  })

  it('logDeliveryAction writes nothing', async () => {
    await logDeliveryAction({ estimateId: 'e1', format: 'pdf', channel: 'copy' })
    expect(writes).not.toContain('estimate_deliveries.insert')
  })

  it('markAsSentAction writes nothing', async () => {
    await markAsSentAction('e1')
    expect(writes).toEqual([])
  })

  it('createTextRecording is refused with code paywalled and writes nothing (no auto-generate)', async () => {
    const res = asResult(await createTextRecording('p1', 'a leaking pipe'))
    expect(res?.code).toBe('paywalled')
    expect(writes).not.toContain('recordings.insert')
  })
})

describe('out_of_credits company (Pro, live subscription)', () => {
  beforeEach(() => {
    companyRow = PRO_EMPTY
  })

  it.each(gated)('%s is NOT refused (editing stays allowed)', async (_name, run) => {
    expect(await run()).toBe(false)
  })

  it('createTextRecording is refused with code out_of_credits (a create gate)', async () => {
    const res = asResult(await createTextRecording('p1', 'a leaking pipe'))
    expect(res?.code).toBe('out_of_credits')
    expect(writes).not.toContain('recordings.insert')
  })
})

describe('active company and enforcement OFF', () => {
  it.each(gated)('%s is not refused with credits left', async (_name, run) => {
    companyRow = { ...FREE_EMPTY, credit_balance: 40 }
    expect(await run()).toBe(false)
  })

  it.each(gated)('%s is inert with enforcement OFF', async (_name, run) => {
    enforcementEnabled = false
    expect(await run()).toBe(false)
  })

  it('createTextRecording proceeds past the gate with credits / enforcement OFF', async () => {
    companyRow = { ...FREE_EMPTY, credit_balance: 40 }
    expect(asResult(await createTextRecording('p1', 'x'))?.code).toBeUndefined()
    companyRow = FREE_EMPTY
    enforcementEnabled = false
    expect(asResult(await createTextRecording('p1', 'x'))?.code).toBeUndefined()
  })
})
