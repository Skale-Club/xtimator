import { describe, it, expect } from 'vitest'
import { mergeRefinement, type MergeCurrentContent } from '@/lib/estimate/refine-merge'
import type { EditorItem, EditorSection, RefinementPayload } from '@/components/workspace/estimate/use-estimate-reducer'

// Phase 170 Plan 01 (REFINE-01/02) — closes audit § G2/G3.
//
// REQUIRED READING for reviewers: .planning/audits/v4.19-ESTIMATE-DEEP-AUDIT.md
// § G and the locked decision in REQUIREMENTS.md ("Refine review-before-apply
// v1 = a summary diff ... Apply merges by matching unchanged rows to preserve
// ids/created_at; only genuinely new rows get temp ids").
//
// Cases (a)-(k) below are the plan's mandated TDD matrix. (h) is THE key
// case: a REWORDED line must keep its id via pass-2 positional pairing, not
// be classified as remove+add (which would silently lose id/created_at).

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildItem(overrides: Partial<EditorItem> = {}): EditorItem {
  return {
    id: 'item-1',
    description: 'Paint bedroom walls',
    quantity: 1,
    unit: null,
    unit_price: 200,
    total: 200,
    sort_order: 0,
    price_source: 'ai_estimate',
    isManuallyEdited: false,
    taxable: true,
    tax_category: null,
    discount: 0,
    cost: null,
    markup_pct: null,
    ...overrides,
  }
}

function buildSection(overrides: Partial<EditorSection> = {}): EditorSection {
  return {
    id: 'sec-1',
    title: 'General',
    sort_order: 0,
    subtotal: 200,
    items: [buildItem()],
    ...overrides,
  }
}

function buildCurrent(overrides: Partial<MergeCurrentContent> = {}): MergeCurrentContent {
  return {
    sections: [buildSection()],
    summary: 'Original summary.',
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    ...overrides,
  }
}

type RefinedItem = RefinementPayload['sections'][number]['items'][number]

function buildRefinedItem(overrides: Partial<RefinedItem> = {}): RefinedItem {
  return {
    description: 'Paint bedroom walls',
    quantity: 1,
    unit_price: 200,
    price_source: 'ai_estimate',
    ...overrides,
  }
}

function buildRefined(overrides: Partial<RefinementPayload> = {}): RefinementPayload {
  return {
    summary: 'Original summary.',
    sections: [{ title: 'General', items: [buildRefinedItem()] }],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// (a) one-line price change -> row keeps its id, diff.changed has old->new
// ---------------------------------------------------------------------------

describe('mergeRefinement — (a) price-only change', () => {
  it('preserves the id and reports old->new in diff.changed', () => {
    const current = buildCurrent()
    const refined = buildRefined({
      sections: [{ title: 'General', items: [buildRefinedItem({ unit_price: 250 })] }],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections[0].items[0].id).toBe('item-1')
    expect(diff.changed).toEqual([
      { description: 'Paint bedroom walls', oldPrice: 200, newPrice: 250, oldQty: 1, newQty: 1 },
    ])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (b) an added line -> temp- id, diff.added
// ---------------------------------------------------------------------------

describe('mergeRefinement — (b) added line', () => {
  it('gives the new line a temp- id and reports it in diff.added', () => {
    const current = buildCurrent()
    const refined = buildRefined({
      sections: [
        {
          title: 'General',
          items: [buildRefinedItem(), buildRefinedItem({ description: 'Install ceiling fan', unit_price: 150 })],
        },
      ],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections[0].items).toHaveLength(2)
    expect(mergedSections[0].items[0].id).toBe('item-1')
    expect(mergedSections[0].items[1].id).toMatch(/^temp-/)
    expect(diff.added).toEqual([{ description: 'Install ceiling fan', unit_price: 150 }])
    expect(diff.changed).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (c) a removed line -> dropped, diff.removed
// ---------------------------------------------------------------------------

describe('mergeRefinement — (c) removed line', () => {
  it('drops the line from the merged section and reports it in diff.removed', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [buildItem(), buildItem({ id: 'item-2', description: 'Carpet shampoo', unit_price: 80 })],
        }),
      ],
    })
    const refined = buildRefined() // only "Paint bedroom walls" survives

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections[0].items).toHaveLength(1)
    expect(mergedSections[0].items[0].id).toBe('item-1')
    expect(diff.removed).toEqual([{ description: 'Carpet shampoo' }])
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (d) untouched lines keep ids and are NOT in any diff bucket
// ---------------------------------------------------------------------------

describe('mergeRefinement — (d) untouched line', () => {
  it('is a pure passthrough: id preserved, no diff entries', () => {
    const current = buildCurrent()
    const refined = buildRefined()

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections[0].items[0].id).toBe('item-1')
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (e) a new section -> temp- section id
// ---------------------------------------------------------------------------

describe('mergeRefinement — (e) new section', () => {
  it('assigns a temp- id to a section with no current-title match and reports its items as added', () => {
    const current = buildCurrent()
    const refined = buildRefined({
      sections: [
        { title: 'General', items: [buildRefinedItem()] },
        { title: 'Extra Work', items: [buildRefinedItem({ description: 'Pressure wash deck', unit_price: 300 })] },
      ],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections).toHaveLength(2)
    expect(mergedSections[0].id).toBe('sec-1')
    expect(mergedSections[1].id).toMatch(/^temp-/)
    expect(mergedSections[1].items[0].id).toMatch(/^temp-/)
    expect(diff.added).toEqual([{ description: 'Pressure wash deck', unit_price: 300 }])
  })
})

// ---------------------------------------------------------------------------
// (f) advanced-pricing fields carry through
// ---------------------------------------------------------------------------

describe('mergeRefinement — (f) advanced-pricing carry-through', () => {
  it('carries refined taxable/tax_category/discount/cost/markup_pct when present, defaults when absent', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [
            buildItem({
              id: 'adv-1',
              description: 'Materials',
              taxable: false,
              tax_category: 'materials',
              discount: 10,
              cost: 50,
              markup_pct: 20,
            }),
          ],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        {
          title: 'General',
          items: [
            buildRefinedItem({
              description: 'Materials',
              taxable: false,
              tax_category: 'materials',
              discount: 10,
              cost: 50,
              markup_pct: 20,
            }),
          ],
        },
      ],
    })

    const { mergedSections } = mergeRefinement(current, refined)
    const merged = mergedSections[0].items[0]

    expect(merged.id).toBe('adv-1')
    expect(merged.taxable).toBe(false)
    expect(merged.tax_category).toBe('materials')
    expect(merged.discount).toBe(10)
    expect(merged.cost).toBe(50)
    expect(merged.markup_pct).toBe(20)
  })

  it('falls back to no-op defaults when the refined item omits advanced-pricing fields', () => {
    const current = buildCurrent()
    const refined = buildRefined() // buildRefinedItem() has no advanced-pricing fields

    const { mergedSections } = mergeRefinement(current, refined)
    const merged = mergedSections[0].items[0]

    expect(merged.taxable).toBe(true)
    expect(merged.tax_category).toBeNull()
    expect(merged.discount).toBe(0)
    expect(merged.cost).toBeNull()
    expect(merged.markup_pct).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// (g) reordering within a section still matches by description (id preserved)
// ---------------------------------------------------------------------------

describe('mergeRefinement — (g) reordering', () => {
  it('matches by description regardless of position, preserving both ids', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [
            buildItem({ id: 'a1', description: 'Item A', unit_price: 100 }),
            buildItem({ id: 'b1', description: 'Item B', unit_price: 200 }),
          ],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        {
          title: 'General',
          items: [
            buildRefinedItem({ description: 'Item B', unit_price: 200 }),
            buildRefinedItem({ description: 'Item A', unit_price: 100 }),
          ],
        },
      ],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    const byDesc = Object.fromEntries(mergedSections[0].items.map((i) => [i.description, i.id]))
    expect(byDesc['Item A']).toBe('a1')
    expect(byDesc['Item B']).toBe('b1')
    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (h) THE KEY CASE — a reworded line keeps its id via pass-2 positional
// pairing, and shows as diff.changed, NOT remove+add.
// ---------------------------------------------------------------------------

describe('mergeRefinement — (h) reworded line (pass-2 positional pairing)', () => {
  it('keeps the current id for a description rewrite with substantial word overlap', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [
            buildItem({
              id: 'x1',
              description: 'Install 30 sq ft of quartz countertop',
              unit_price: 1200,
            }),
          ],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        {
          title: 'General',
          items: [
            buildRefinedItem({
              description: 'Install 32 sq ft of quartz countertop with polished edge',
              unit_price: 1200,
            }),
          ],
        },
      ],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    // Pass 1 fails (descriptions differ verbatim) -> pass 2 positional pairing
    // with a passing similarity guard -> id REUSED, not regenerated.
    expect(mergedSections[0].items).toHaveLength(1)
    expect(mergedSections[0].items[0].id).toBe('x1')
    expect(mergedSections[0].items[0].description).toBe(
      'Install 32 sq ft of quartz countertop with polished edge'
    )
    expect(diff.changed).toEqual([
      {
        description: 'Install 32 sq ft of quartz countertop with polished edge',
        oldPrice: 1200,
        newPrice: 1200,
        oldQty: 1,
        newQty: 1,
      },
    ])
    // NOT classified as remove+add.
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (i) a narrative-only refine (summary changed, zero line changes) yields
// empty changed/added/removed but a populated diff.fields.summary.
// ---------------------------------------------------------------------------

describe('mergeRefinement — (i) narrative-only refine', () => {
  it('leaves line-item diff buckets empty but populates diff.fields.summary', () => {
    const current = buildCurrent({ summary: 'Old summary text.' })
    const refined = buildRefined({ summary: 'New, more professional summary text.' })

    const { diff } = mergeRefinement(current, refined)

    expect(diff.changed).toEqual([])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.fields.summary).toEqual({ old: 'Old summary text.', new: 'New, more professional summary text.' })
  })

  it('leaves diff.fields.summary undefined when the summary is unchanged', () => {
    const current = buildCurrent()
    const refined = buildRefined()

    const { diff } = mergeRefinement(current, refined)

    expect(diff.fields.summary).toBeUndefined()
  })

  it('flags notes/timeline/payment_terms/warranty_terms as booleans when changed', () => {
    const current = buildCurrent({
      notes: 'Old notes',
      timeline: 'Old timeline',
      payment_terms: 'Old terms',
      warranty_terms: 'Old warranty',
    })
    const refined = buildRefined({
      notes: 'New notes',
      timeline: 'New timeline',
      payment_terms: 'New terms',
      warranty_terms: 'New warranty',
    })

    const { diff } = mergeRefinement(current, refined)

    expect(diff.fields.notes).toBe(true)
    expect(diff.fields.timeline).toBe(true)
    expect(diff.fields.payment_terms).toBe(true)
    expect(diff.fields.warranty_terms).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// (j) isManuallyEdited preserved when price unchanged, reset when changed
// ---------------------------------------------------------------------------

describe('mergeRefinement — (j) isManuallyEdited on merge', () => {
  it('preserves isManuallyEdited when the matched row price is unchanged', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [
            buildItem({
              id: 'p1',
              description: 'Custom manual price line',
              unit_price: 500,
              isManuallyEdited: true,
            }),
          ],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        { title: 'General', items: [buildRefinedItem({ description: 'Custom manual price line', unit_price: 500 })] },
      ],
    })

    const { mergedSections } = mergeRefinement(current, refined)
    expect(mergedSections[0].items[0].isManuallyEdited).toBe(true)
  })

  it('resets isManuallyEdited to false when the matched row price changed', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [
            buildItem({
              id: 'p2',
              description: 'Another manual line',
              unit_price: 300,
              isManuallyEdited: true,
            }),
          ],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        { title: 'General', items: [buildRefinedItem({ description: 'Another manual line', unit_price: 350 })] },
      ],
    })

    const { mergedSections } = mergeRefinement(current, refined)
    expect(mergedSections[0].items[0].isManuallyEdited).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (k) a genuine replace (very dissimilar leftover pair) falls below the
// similarity guard -> removed+added, not a wrong-id reuse.
// ---------------------------------------------------------------------------

describe('mergeRefinement — (k) genuine replace below the similarity guard', () => {
  it('drops the old id (removed) and mints a fresh temp- id (added) instead of force-pairing', () => {
    const current = buildCurrent({
      sections: [
        buildSection({
          items: [buildItem({ id: 'y1', description: 'Paint bedroom walls', unit_price: 200 })],
        }),
      ],
    })
    const refined = buildRefined({
      sections: [
        { title: 'General', items: [buildRefinedItem({ description: 'Install new HVAC unit', unit_price: 3000 })] },
      ],
    })

    const { mergedSections, diff } = mergeRefinement(current, refined)

    expect(mergedSections[0].items).toHaveLength(1)
    expect(mergedSections[0].items[0].id).not.toBe('y1')
    expect(mergedSections[0].items[0].id).toMatch(/^temp-/)
    expect(diff.removed).toEqual([{ description: 'Paint bedroom walls' }])
    expect(diff.added).toEqual([{ description: 'Install new HVAC unit', unit_price: 3000 }])
    expect(diff.changed).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Purity: no React/DOM imports (enforced structurally by this file's own
// import of the util having zero side effects); a smoke check that calling
// it twice with the same input is deterministic.
// ---------------------------------------------------------------------------

describe('mergeRefinement — determinism', () => {
  it('produces the same diff shape across repeated calls with identical input', () => {
    const current = buildCurrent()
    const refined = buildRefined({ sections: [{ title: 'General', items: [buildRefinedItem({ unit_price: 250 })] }] })

    const run1 = mergeRefinement(current, refined)
    const run2 = mergeRefinement(current, refined)

    expect(run1.diff.changed).toEqual(run2.diff.changed)
    expect(run1.mergedSections[0].items[0].id).toBe(run2.mergedSections[0].items[0].id)
  })
})
