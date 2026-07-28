// tests/unit/pagination/rules.test.ts
//
// Plan 184-02, Task 2 (RED) — pure predicate coverage for isAtomic/isPage1Only.
import { describe, it, expect } from 'vitest'
import { isAtomic, isPage1Only } from '@/lib/estimate/pagination/rules'
import type { PageBlock } from '@/lib/estimate/pagination/types'

function makeBlock(overrides: Partial<PageBlock> = {}): PageBlock {
  return {
    kind: 'totals',
    id: 'block-1',
    baseHeightPt: 10,
    atomic: true,
    ...overrides,
  }
}

describe('isAtomic', () => {
  it('returns true when block.atomic is true', () => {
    expect(isAtomic(makeBlock({ atomic: true }))).toBe(true)
  })

  it('returns false when block.atomic is false', () => {
    expect(isAtomic(makeBlock({ atomic: false }))).toBe(false)
  })
})

describe('isPage1Only', () => {
  it('returns true when block.page1Only is true', () => {
    expect(isPage1Only(makeBlock({ page1Only: true }))).toBe(true)
  })

  it('returns false when block.page1Only is false', () => {
    expect(isPage1Only(makeBlock({ page1Only: false }))).toBe(false)
  })

  it('returns false when block.page1Only is undefined (coerced via !!)', () => {
    expect(isPage1Only(makeBlock({ page1Only: undefined }))).toBe(false)
  })
})
