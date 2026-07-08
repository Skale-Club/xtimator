import { describe, it } from 'vitest'

// Wave 0 scaffold — Phase 162 plan 162-03 converts these to real tests during
// the alignment pass per DOCUX-05. The DOM-snapshot test (view mode) captures
// its baseline the first time it runs post-alignment — expected to be a
// one-time intentional artifact of Phase 162.

describe('EstimateDocument alignment (DOCUX-05)', () => {
  it.todo('section padding — DocumentSectionBlock header uses px-6 sm:px-10 (not px-3)')
  it.todo('section padding — item-table row parent uses px-6 sm:px-10 (not px-3)')
  it.todo('section padding — section subtotal footer uses px-6 sm:px-10 (not px-3)')
  it.todo('section padding — add-item row uses px-6 sm:px-10 (not px-3)')
  it.todo('section padding — mobile stacked-item read-only row uses px-6 sm:px-10 (not px-3)')
  it.todo('vertical rhythm — info grid uses py-6 sm:py-8 (not pt-8 sm:pt-10 pb-5)')
  it.todo('vertical rhythm — DocumentTotals uses py-6 (not py-5)')
  it.todo('vertical rhythm — Terms section uses py-6 (not pt-4 pb-6)')
  it.todo('view mode DOM — snapshot stable post-alignment (mode="view" toMatchSnapshot)')
})
