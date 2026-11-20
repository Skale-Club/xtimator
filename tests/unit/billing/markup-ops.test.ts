import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => null }))

import {
  MARKUP_OPS,
  chargeableGenerationCostUsd,
  lowestMarkup,
  markupFor,
  markupForCostOp,
} from '@/lib/billing/markup-ops'
import { DEFAULT_BILLING_CONFIG, mergeStoredBillingConfig } from '@/lib/billing/billing-config'
import { validateMarginInvariant } from '@/lib/billing/calibration'

const credits = (usd: number, markup: number) => Math.round((usd * markup) / 0.01)

describe('markupFor', () => {
  it('uses the operation markup, else the global markup', () => {
    const cfg = { markup: 4.5, markupByOp: { estimate: 30 } }
    expect(markupFor(cfg, 'estimate')).toBe(30)
    expect(markupFor(cfg, 'photo_batch')).toBe(4.5)
  })

  it('ignores invalid entries', () => {
    const cfg = { markup: 4.5, markupByOp: { estimate: 0, chat: Number.NaN } }
    expect(markupFor(cfg, 'estimate')).toBe(4.5)
    expect(markupFor(cfg, 'chat')).toBe(4.5)
  })

  it('maps measured cost rows to their debit operation', () => {
    const cfg = { markup: 5, markupByOp: { estimate: 30, photo_batch: 6 } }
    expect(markupForCostOp(cfg, 'estimate_retry')).toBe(30)
    expect(markupForCostOp(cfg, 'vision')).toBe(6)
    expect(markupForCostOp(cfg, 'translation')).toBe(5)
  })

  it('lowestMarkup is the minimum over every operation', () => {
    expect(lowestMarkup({ markup: 4.5, markupByOp: { estimate: 30 } })).toBe(4.5)
    expect(lowestMarkup(DEFAULT_BILLING_CONFIG)).toBe(5)
  })
})

describe('chargeableGenerationCostUsd', () => {
  it('charges the most expensive call, not the sum of retries', () => {
    expect(chargeableGenerationCostUsd([0.031, 0.034, null])).toBe(0.034)
  })

  it('returns null when no cost is known', () => {
    expect(chargeableGenerationCostUsd([null, undefined])).toBeNull()
    expect(chargeableGenerationCostUsd([])).toBeNull()
  })
})

describe('stored billing_config without per-operation markups', () => {
  it('keeps every operation at the stored global markup', () => {
    const cfg = mergeStoredBillingConfig({ markup: 4.5 } as never)
    expect(cfg.markupByOp).toEqual({})
    for (const op of MARKUP_OPS) expect(markupFor(cfg, op)).toBe(4.5)
  })

  it('merges a stored map per key', () => {
    const cfg = mergeStoredBillingConfig({ markup: 5, markupByOp: { estimate: 30 } } as never)
    expect(markupFor(cfg, 'estimate')).toBe(30)
    expect(markupFor(cfg, 'refine')).toBe(5)
  })
})

describe('launch calibration (owner targets 2026-11-19)', () => {
  const cfg = DEFAULT_BILLING_CONFIG
  const m = (op: Parameters<typeof markupFor>[1]) => markupFor(cfg, op)
  // Measured production cost: generation p50 0.0314, photo 0.0101, audio 0.006/min, AI edit ~0.022.
  const generation = credits(0.0314, m('estimate'))
  const photo = credits(0.0101, m('photo_batch'))
  const audioMinute = credits(0.006, m('audio_minutes'))
  const edit = credits(0.022, m('refine'))
  // Text-only small job: the Skleanings battery measured 64-71 credits; the
  // cheapest (64) is the hardest case for the 3-estimate limit.
  const small = 64
  const normal = generation + 3 * audioMinute + 5 * photo + edit
  const huge = credits(0.041, m('estimate')) + 10 * audioMinute + 20 * photo + 2 * edit

  it('free signup gives 3 small, 2 normal or 1 huge estimate', () => {
    const grant = cfg.signupCreditGrant
    const gate = cfg.estimatedCreditsByOp.estimate
    const startable = (cost: number) => {
      let balance = grant
      let n = 0
      while (balance >= gate) {
        balance -= cost
        n += 1
      }
      return n
    }
    expect(startable(small)).toBe(3)
    expect(startable(normal)).toBe(2)
    expect(startable(huge)).toBe(1)
  })

  it('two normal estimates leave a positive balance (the second can still be sent)', () => {
    expect(cfg.signupCreditGrant - 2 * normal).toBeGreaterThan(0)
  })

  it('Pro gives about 20 normal estimates a month', () => {
    const pro = cfg.tiers.pro.monthlyCreditGrant
    expect(Math.floor(pro / normal)).toBeGreaterThanOrEqual(19)
    expect(Math.floor(pro / normal)).toBeLessThanOrEqual(30)
  })

  it('an AI edit only starts when the balance survives it', () => {
    expect(cfg.estimatedCreditsByOp.refine).toBeGreaterThan(credits(0.03, m('refine')))
  })

  it('every priced tier passes the margin invariant at the lowest markup', () => {
    const check = validateMarginInvariant(cfg)
    expect(check.pass).toBe(true)
    expect(check.tiers.pro.ratio).toBeCloseTo(0.207, 2)
    expect(check.tiers.business.annualRatio).toBeLessThanOrEqual(0.3)
  })
})
