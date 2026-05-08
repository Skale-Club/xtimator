import { describe, it, expect } from 'vitest'

// Stubs — all RED. Plan 23-02 turns these GREEN.

describe('price-badge: ItemRow badge rendering', () => {
  it('renders Price book badge for price_book items', () => {
    expect.fail('not implemented')
  })

  it('renders AI estimate badge for ai_estimate items', () => {
    expect.fail('not implemented')
  })

  it('renders Edited badge when isManuallyEdited is true', () => {
    expect.fail('not implemented')
  })

  it('renders no badge for null price_source', () => {
    expect.fail('not implemented')
  })
})

describe('price-badge: UPDATE_ITEM reducer behavior', () => {
  it('UPDATE_ITEM unit_price dispatch sets isManuallyEdited to true', () => {
    expect.fail('not implemented')
  })
})

describe('price-badge: saveEstimate price_source persistence', () => {
  it('saveEstimate writes price_source: null for manually-edited items', () => {
    expect.fail('not implemented')
  })
})
