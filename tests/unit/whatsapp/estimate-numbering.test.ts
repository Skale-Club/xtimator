import { describe, it, expect } from 'vitest'
import {
  numberSections,
  resolveItem,
  resolveSection,
  buildNumberedBreakdownLines,
  type RawSectionRow,
} from '@/lib/whatsapp/estimate-numbering'

/**
 * Ordering invariant + N.M resolution (Phase 51 follow-up).
 *
 * The numbers the owner sees in the confirmation MUST equal the numbers the edit
 * tools resolve. Both derive from numberSections() sorting by `sort_order` ASC
 * (id tiebreak). These tests pin that mapping.
 */

// Deliberately UNSORTED input (sort_order out of order) to prove the sort is
// applied here, not assumed from row arrival order.
const RAW: RawSectionRow[] = [
  {
    id: 's2',
    title: 'Materials',
    subtotal: 300,
    sort_order: 1,
    items: [
      { id: 'i2b', description: 'Paint', quantity: 2, unit_price: 100, total: 200, sort_order: 1 },
      { id: 'i2a', description: 'Primer', quantity: 1, unit_price: 100, total: 100, sort_order: 0 },
    ],
  },
  {
    id: 's1',
    title: 'Labor',
    subtotal: 250,
    sort_order: 0,
    items: [
      { id: 'i1a', description: 'Demo', quantity: 1, unit_price: 150, total: 150, sort_order: 0 },
      { id: 'i1b', description: 'Cleanup', quantity: 1, unit_price: 100, total: 100, sort_order: 1 },
    ],
  },
]

describe('numberSections — ordering invariant (sort_order ASC)', () => {
  it('numbers sections 1..N and items N.M by sort_order regardless of input order', () => {
    const numbered = numberSections(RAW)
    expect(numbered.map((s) => [s.sectionNumber, s.title])).toEqual([
      [1, 'Labor'],
      [2, 'Materials'],
    ])
    // Section 1 items in sort_order
    expect(numbered[0].items.map((i) => [i.itemNumber, i.description, i.id])).toEqual([
      [1, 'Demo', 'i1a'],
      [2, 'Cleanup', 'i1b'],
    ])
    // Section 2 items in sort_order (input had them reversed)
    expect(numbered[1].items.map((i) => [i.itemNumber, i.description, i.id])).toEqual([
      [1, 'Primer', 'i2a'],
      [2, 'Paint', 'i2b'],
    ])
  })

  it('is defensive on sparse rows (missing fields do not throw)', () => {
    const numbered = numberSections([{ items: [{}] }])
    expect(numbered[0].sectionNumber).toBe(1)
    expect(numbered[0].items[0].itemNumber).toBe(1)
    expect(numbered[0].items[0].total).toBe(0)
  })

  it('breaks sort_order ties deterministically by id (no ambiguity)', () => {
    // Two items share sort_order 0 → tiebreak by id ASC keeps numbering stable.
    const tied = numberSections([
      {
        id: 's1',
        title: 'S',
        sort_order: 0,
        items: [
          { id: 'bbb', description: 'B', sort_order: 0 },
          { id: 'aaa', description: 'A', sort_order: 0 },
        ],
      },
    ])
    expect(tied[0].items.map((i) => [i.itemNumber, i.id])).toEqual([
      [1, 'aaa'],
      [2, 'bbb'],
    ])
  })
})

describe('resolveItem / resolveSection — N.M resolution', () => {
  const sections = numberSections(RAW)

  it('happy path: resolves N.M to the exact row', () => {
    const res = resolveItem(sections, 2, 2)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.item.id).toBe('i2b')
      expect(res.item.description).toBe('Paint')
      expect(res.section.title).toBe('Materials')
    }
  })

  it('out-of-range section number → helpful error', () => {
    const res = resolveItem(sections, 9, 1)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/section 9/i)
      expect(res.error).toMatch(/2 sections/i)
    }
  })

  it('out-of-range item number → helpful error naming the section', () => {
    const res = resolveItem(sections, 1, 9)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toMatch(/item 1\.9/i)
      expect(res.error).toMatch(/labor/i)
      expect(res.error).toMatch(/2 items/i)
    }
  })

  it('resolveSection resolves and errors symmetrically', () => {
    expect(resolveSection(sections, 1).ok).toBe(true)
    const miss = resolveSection(sections, 5)
    expect(miss.ok).toBe(false)
    if (!miss.ok) expect(miss.error).toMatch(/section 5/i)
  })
})

describe('buildNumberedBreakdownLines — compact numbered bubble', () => {
  it('renders sections "N. Title" and items "N.M Desc" with qty only when > 1', () => {
    const lines = buildNumberedBreakdownLines(numberSections(RAW), 'USD')
    expect(lines).toContain('1. Labor')
    expect(lines).toContain('1.1 Demo')
    expect(lines).toContain('2.2 Paint (x2)')
    // qty 1 items omit the "(x1)" suffix
    expect(lines).not.toMatch(/Demo \(x1\)/)
    // money is formatted
    expect(lines).toMatch(/\$150\.00/)
  })
})
