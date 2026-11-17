import { describe, it, expect } from 'vitest'
import {
  computeChangeOrderTotals,
  formatChangeOrderNumber,
  changeOrderPublicPath,
} from '@/lib/change-orders/types'
import {
  buildContractSummary,
  resolveEstimateNumber,
  type ContractChangeOrderInput,
} from '@/lib/change-orders/contract'
import {
  buildChangeOrderSnapshot,
  hashChangeOrderSnapshot,
  canonicalJsonStringify,
} from '@/lib/change-orders/snapshot'
import { createHash } from 'node:crypto'

describe('computeChangeOrderTotals', () => {
  it('rounds each line to cents and taxes only taxable lines', () => {
    const r = computeChangeOrderTotals(
      [
        { quantity: 3, unit_price: 19.99, taxable: true },
        { quantity: 1, unit_price: 100, taxable: false },
      ],
      0.0625,
    )
    expect(r.subtotal).toBe(159.97)
    expect(r.tax_amount).toBe(3.75)
    expect(r.total).toBe(163.72)
  })

  it('handles credits (negative unit price) and an empty list', () => {
    expect(
      computeChangeOrderTotals([{ quantity: 2, unit_price: -50, taxable: true }], 0.1),
    ).toEqual({ subtotal: -100, tax_amount: -10, total: -110 })
    expect(computeChangeOrderTotals([], 0.08)).toEqual({ subtotal: 0, tax_amount: 0, total: 0 })
  })

  it('formats the number and public path', () => {
    expect(formatChangeOrderNumber('SK-1045', 2)).toBe('SK-1045-CO2')
    expect(changeOrderPublicPath('abc')).toBe('/change-order/abc')
  })
})

const co = (over: Partial<ContractChangeOrderInput>): ContractChangeOrderInput => ({
  id: 'co',
  number: 1,
  title: 'T',
  status: 'draft',
  client_response: null,
  total: 0,
  sent_at: null,
  responded_at: null,
  view_count: 0,
  ...over,
})

const base = {
  estimateId: 'est-1',
  currencyCode: 'USD',
  estimateNumber: 'SK-1045',
  acceptedAt: '2026-11-01T00:00:00Z',
  signedOnline: true,
  baseTotal: 10000,
}

describe('buildContractSummary', () => {
  const rows = [
    co({ id: 'c3', number: 3, status: 'draft', total: 70 }),
    co({ id: 'c1', number: 1, status: 'accepted', client_response: 'accepted', total: 500.5 }),
    co({ id: 'c2', number: 2, status: 'sent', total: 200 }),
    co({ id: 'c4', number: 4, status: 'declined', client_response: 'declined', total: 999 }),
    co({ id: 'c5', number: 5, status: 'accepted', client_response: 'accepted', total: -100.25 }),
  ]

  it('owner view: ordered by number, drafts included, only approved count in the contract', () => {
    const s = buildContractSummary(base, rows, { includeDrafts: true })
    expect(s.changeOrders.map((r) => r.number)).toEqual([1, 2, 3, 4, 5])
    expect(s.approvedTotal).toBe(400.25)
    expect(s.pendingTotal).toBe(200)
    expect(s.contractTotal).toBe(10400.25)
    expect(s.baseTotal).toBe(10000)
    expect(s.signedOnline).toBe(true)
  })

  it('public view: drafts are excluded and never leak into any total', () => {
    const s = buildContractSummary(base, rows, { includeDrafts: false })
    expect(s.changeOrders.map((r) => r.id)).toEqual(['c1', 'c2', 'c4', 'c5'])
    expect(s.contractTotal).toBe(10400.25)
  })

  it('a declined or sent change order never changes the contract total', () => {
    const s = buildContractSummary(
      base,
      [co({ number: 1, status: 'declined', client_response: 'declined', total: 50 }), co({ number: 2, status: 'sent', total: 60 })],
      { includeDrafts: true },
    )
    expect(s.approvedTotal).toBe(0)
    expect(s.contractTotal).toBe(10000)
    expect(s.pendingTotal).toBe(60)
  })
})

describe('resolveEstimateNumber', () => {
  it('prefers the override, then the zero-padded sequence, then the version', () => {
    expect(resolveEstimateNumber({ estimate_number: ' SK-9 ', estimate_seq: 4, version: 2 })).toBe('SK-9')
    expect(resolveEstimateNumber({ estimate_number: null, estimate_seq: 4, version: 2 })).toBe('0004')
    expect(resolveEstimateNumber({ estimate_number: '', estimate_seq: 0, version: 2 })).toBe('2')
    expect(resolveEstimateNumber({})).toBe('1')
  })
})

describe('change order snapshot', () => {
  const header = {
    id: 'co-1',
    estimate_id: 'est-1',
    number: 2,
    title: 'Garage painting',
    reason: null,
    extra_days: 3,
    tax_rate: 6.25,
    subtotal: 100,
    tax_amount: 6.25,
    total: 106.25,
    currency_code: 'USD',
  }
  const items = [
    { id: 'b', description: 'B', quantity: 1, unit: null, unit_price: 50, total: 50, taxable: true, sort_order: 1 },
    { id: 'a', description: 'A', quantity: 1, unit: 'ea', unit_price: 50, total: 50, taxable: false, sort_order: 0 },
  ]

  it('freezes the header and the items sorted by sort_order, with nulls never undefined', () => {
    const s = buildChangeOrderSnapshot(header, items)
    expect(s.version).toBe(1)
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(s.reason).toBeNull()
    expect(s.items[1].unit).toBeNull()
    expect(s.total).toBe(106.25)
    expect(s.consent.key).toBe('sign_change_order_consent_v1')
  })

  it('hashes the canonical (key-order independent) serialization with sha256', () => {
    const s = buildChangeOrderSnapshot(header, items)
    const reordered = Object.fromEntries(Object.entries(s).reverse())
    expect(hashChangeOrderSnapshot(s)).toBe(createHash('sha256').update(canonicalJsonStringify(reordered)).digest('hex'))
    expect(hashChangeOrderSnapshot(s)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashChangeOrderSnapshot(buildChangeOrderSnapshot({ ...header, total: 1 }, items))).not.toBe(
      hashChangeOrderSnapshot(s),
    )
  })
})
