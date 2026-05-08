import { describe, it, expect } from 'vitest'
import { priceBookItemSchema, bulkAdjustSchema } from '@/lib/schemas/price-book'

describe('priceBookItemSchema', () => {
  it('valid item with category, name, unit_price passes', () => {
    const result = priceBookItemSchema.safeParse({
      category: 'Labor',
      name: 'General Labor',
      unit: 'hr',
      unit_price: 75,
      notes: '',
    })
    expect(result.success).toBe(true)
  })

  it('missing category fails with "Category is required"', () => {
    const result = priceBookItemSchema.safeParse({
      category: '',
      name: 'General Labor',
      unit_price: 75,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const categoryError = result.error.issues.find((i) =>
        i.path.includes('category')
      )
      expect(categoryError?.message).toBe('Category is required')
    }
  })

  it('missing name fails with "Item name is required"', () => {
    const result = priceBookItemSchema.safeParse({
      category: 'Labor',
      name: '',
      unit_price: 75,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path.includes('name'))
      expect(nameError?.message).toBe('Item name is required')
    }
  })

  it('unit_price coerces string "42.50" to number 42.5', () => {
    const result = priceBookItemSchema.safeParse({
      category: 'Materials',
      name: 'Pipe',
      unit_price: '42.50',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unit_price).toBe(42.5)
    }
  })

  it('unit_price of -1 fails with "Price must be 0 or greater"', () => {
    const result = priceBookItemSchema.safeParse({
      category: 'Labor',
      name: 'General Labor',
      unit_price: -1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const priceError = result.error.issues.find((i) =>
        i.path.includes('unit_price')
      )
      expect(priceError?.message).toBe('Price must be 0 or greater')
    }
  })

  it('unit and notes can be empty string (optional fields)', () => {
    const result = priceBookItemSchema.safeParse({
      category: 'Labor',
      name: 'General Labor',
      unit: '',
      unit_price: 75,
      notes: '',
    })
    expect(result.success).toBe(true)
  })
})

describe('bulkAdjustSchema', () => {
  it('accepts valid positive percent 10', () => {
    const r = bulkAdjustSchema.safeParse({ adjustmentPercent: 10 })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.adjustmentPercent).toBe(10)
  })
  it('accepts valid negative percent -50', () => {
    const r = bulkAdjustSchema.safeParse({ adjustmentPercent: -50 })
    expect(r.success).toBe(true)
  })
  it('rejects -101 with "Cannot reduce prices by more than 100%"', () => {
    const r = bulkAdjustSchema.safeParse({ adjustmentPercent: -101 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Cannot reduce prices by more than 100%')
    }
  })
  it('rejects 501 with "Maximum adjustment is 500%"', () => {
    const r = bulkAdjustSchema.safeParse({ adjustmentPercent: 501 })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Maximum adjustment is 500%')
    }
  })
  it('coerces string "10" to number 10', () => {
    const r = bulkAdjustSchema.safeParse({ adjustmentPercent: '10' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.adjustmentPercent).toBe(10)
  })
})
