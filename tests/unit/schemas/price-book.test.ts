import { describe, it, expect } from 'vitest'
import { priceBookItemSchema } from '@/lib/schemas/price-book'

describe('priceBookItemSchema', () => {
  it('valid item with category, name, unit_price passes', () => {
    expect.fail('not implemented')
  })

  it('missing category fails with "Category is required"', () => {
    expect.fail('not implemented')
  })

  it('missing name fails with "Item name is required"', () => {
    expect.fail('not implemented')
  })

  it('unit_price coerces string "42.50" to number 42.5', () => {
    expect.fail('not implemented')
  })

  it('unit_price of -1 fails with "Price must be 0 or greater"', () => {
    expect.fail('not implemented')
  })

  it('unit and notes can be empty string (optional fields)', () => {
    expect.fail('not implemented')
  })
})
