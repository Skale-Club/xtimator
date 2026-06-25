import { describe, it, expect } from 'vitest'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'

describe('deriveDepositDisplay', () => {
  it('Test 1 — retrocompat (none): deposit_type none hides deposit, balance = total', () => {
    const result = deriveDepositDisplay({
      total: 500,
      deposit_type: 'none',
      deposit_value: null,
      balance_due: null,
    })
    expect(result).toEqual({ showDeposit: false, depositAmount: 0, balanceDue: 500 })
  })

  it('Test 2 — retrocompat (null/legacy): null deposit_type or null balance_due hides deposit', () => {
    const nullType = deriveDepositDisplay({
      total: 800,
      deposit_type: null,
      deposit_value: null,
      balance_due: null,
    })
    expect(nullType).toEqual({ showDeposit: false, depositAmount: 0, balanceDue: 800 })

    // legacy row: an active-looking deposit_type but no persisted balance_due → still hidden
    const nullBalance = deriveDepositDisplay({
      total: 800,
      deposit_type: 'percent',
      deposit_value: 30,
      balance_due: null,
    })
    expect(nullBalance).toEqual({ showDeposit: false, depositAmount: 0, balanceDue: 800 })
  })

  it('Test 3 — percent: depositAmount = round2(total − balance_due), not recomputed from deposit_value', () => {
    const result = deriveDepositDisplay({
      total: 1000,
      deposit_type: 'percent',
      deposit_value: 30,
      balance_due: 700,
    })
    expect(result).toEqual({ showDeposit: true, depositAmount: 300, balanceDue: 700 })
  })

  it('Test 4 — amount: depositAmount derived from persisted balance_due', () => {
    const result = deriveDepositDisplay({
      total: 1000,
      deposit_type: 'amount',
      deposit_value: 250,
      balance_due: 750,
    })
    expect(result).toEqual({ showDeposit: true, depositAmount: 250, balanceDue: 750 })
  })

  it('Test 5 — reads persisted balance_due, never recomputes from deposit_value', () => {
    // deposit_value 30% of 1000 would imply balance 700, but the server persisted 800.
    // The helper must TRUST 800 → depositAmount 200, balanceDue 800 (GUARD-03).
    const result = deriveDepositDisplay({
      total: 1000,
      deposit_type: 'percent',
      deposit_value: 30,
      balance_due: 800,
    })
    expect(result).toEqual({ showDeposit: true, depositAmount: 200, balanceDue: 800 })
  })
})
