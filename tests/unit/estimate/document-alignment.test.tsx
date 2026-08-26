import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentSection,
  type DocumentClient,
} from '@/components/workspace/estimate/estimate-document'

// Wave 3 (162-03) — DOCUX-05 alignment pass. Real assertions replacing the
// 162-01 scaffold placeholders. Every section-scoped surface aligns to
// `px-6 sm:px-10` (SECTION_PX), and the vertical rhythm across info grid,
// DocumentTotals, Terms + Attached Photos unifies at `py-6`/`py-6 sm:py-8`.
//
// Test #9 (DOM snapshot) captures the post-alignment baseline on first run
// — it is the primary regression guard against future doc-shell drift,
// orthogonal to Playwright's share.spec.ts visual baselines.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn().mockResolvedValue({ data: {} }),
  unlinkProjectFromClient: vi.fn().mockResolvedValue({ data: {} }),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

// ---------------------------------------------------------------------------
// Fixtures — deterministic minimal data for stable snapshot + surface checks
// ---------------------------------------------------------------------------

const section: DocumentSection = {
  id: 'sec-1',
  title: 'Materials',
  subtotal: 100,
  items: [
    {
      id: 'item-1',
      description: 'Cedar planks',
      quantity: 10,
      unit: 'ea',
      unit_price: 10,
      total: 100,
    },
  ],
}

const dataWithSections: EstimateDocumentData = {
  summary: null,
  notes: null,
  timeline: null,
  payment_terms: 'Net 30',
  warranty_terms: null,
  discount_type: null,
  discount_value: 0,
  discount_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  subtotal: 100,
  total: 100,
  deposit_type: 'none',
  deposit_value: null,
  deposit: 0,
  balance_due: 100,
  currency_code: 'USD',
  sections: [section],
  estimate_date: '2026-07-08',
  estimate_number: '0001',
  // Phase 162-04 (DOCUX-01) — NULL preserves today's all-visible behavior.
  presentation_settings: null,
}

const client: DocumentClient = {
  id: 'c1',
  name: 'Existing Ltd',
  email: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  zip: null,
}

const baseProps = {
  data: dataWithSections,
  client,
  projectName: 'Deck Rebuild',
  projectType: null,
  estimateVersion: 1,
  estimateSeq: 1,
  estimateCreatedAt: '2026-07-08T00:00:00Z',
  projectId: 'project-1',
} as const

beforeEach(() => {
  // Deterministic fetch (never called in view mode; guard anyway)
  global.fetch = vi.fn().mockResolvedValue({ json: async () => [] }) as unknown as typeof fetch
})

// Helper — match a className string containing every provided token separated
// by whitespace, tolerant of additional classes between/around them.
function classHas(node: Element, ...tokens: string[]): boolean {
  const cls = node.getAttribute('class') ?? ''
  return tokens.every((t) => cls.split(/\s+/).includes(t))
}

describe('EstimateDocument alignment (DOCUX-05)', () => {
  it('section padding — DocumentSectionBlock header uses px-6 sm:px-10 (not px-3)', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // The section header bar contains the section title text.
    const header = container.querySelector('.divide-y > div > div > div')
    // Fallback: find by content — the header bar contains "Materials".
    const candidates = Array.from(container.querySelectorAll('div')).filter((el) =>
      (el.textContent ?? '').trim() === 'Materials'
    )
    const bar = candidates
      .map((n) => n.closest('div[class*="px-"]') ?? n)
      .find((n) => (n as HTMLElement).className?.includes('px-6') || (n as HTMLElement).className?.includes('px-3'))
    expect(bar).toBeTruthy()
    expect(classHas(bar as Element, 'px-6', 'sm:px-10')).toBe(true)
    expect((bar as Element).className.split(/\s+/).includes('px-3')).toBe(false)
    // Silence unused-var lint
    void header
  })

  it('section padding — read-only mobile stacked-item CARD sits ON the gutter (mx-6), not inside it', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // It is a CARD, not a bare section surface, so the gutter belongs on its
    // OUTER edge (mx-6 = the mobile SECTION_PX value), with its own inner
    // padding inside that. The old `mx-4 px-6` pair put the card edge at 16px
    // and its text at 40px, i.e. on neither rail.
    // Read-only branch: the mobile stacked row contains the item description.
    const rows = Array.from(container.querySelectorAll('div.sm\\:hidden > div'))
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0] as HTMLElement
    expect(classHas(row, 'mx-6')).toBe(true)
    expect(row.className.split(/\s+/).includes('mx-4')).toBe(false)
    expect(row.className.split(/\s+/).includes('px-3')).toBe(false)
  })

  it('section padding — section subtotal footer uses px-6 sm:px-10 (not px-3)', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // Subtotal footer contains "Section Subtotal".
    const nodes = Array.from(container.querySelectorAll('div')).filter((el) =>
      (el.textContent ?? '').includes('Section Subtotal')
    )
    const footer = nodes.find((n) => n.className.includes('flex') && n.className.includes('justify-end'))
    expect(footer).toBeTruthy()
    expect(classHas(footer as Element, 'px-6', 'sm:px-10')).toBe(true)
    expect((footer as Element).className.split(/\s+/).includes('px-3')).toBe(false)
  })

  it('section padding — add-item row uses px-6 sm:px-10 in edit mode (not px-3)', () => {
    const { container } = render(
      <EstimateDocument mode="edit" dispatch={vi.fn()} {...baseProps} />
    )
    // The add-item row lives inside DocumentSectionBlock; identified by
    // the `border-t border-dashed border-border/50` class combo.
    const rows = Array.from(container.querySelectorAll('div.border-dashed'))
    const addItem = rows.find((r) => (r.textContent ?? '').includes('Add item'))
    expect(addItem).toBeTruthy()
    expect(classHas(addItem as Element, 'px-6', 'sm:px-10')).toBe(true)
    expect((addItem as Element).className.split(/\s+/).includes('px-3')).toBe(false)
  })

  it('section padding — edit-mode mobile stacked item card wrapper uses SECTION_PX (px-6 sm:px-10)', () => {
    // Sanity check that the ItemCardMobile branch (the sm:hidden div's edit
    // rendering) does NOT introduce a px-3 mismatch — the mobile edit branch
    // is delegated to ItemCardMobile which owns its own padding; the parent
    // wrapper div.sm:hidden has no explicit px so this test asserts absence
    // rather than presence to avoid coupling to ItemCardMobile internals.
    const { container } = render(
      <EstimateDocument mode="edit" dispatch={vi.fn()} {...baseProps} />
    )
    const mobileBranch = container.querySelector('div.sm\\:hidden')
    expect(mobileBranch).toBeTruthy()
    // The wrapper itself carries no px-3 (defensive).
    expect((mobileBranch as Element).className.split(/\s+/).includes('px-3')).toBe(false)
  })

  it('vertical rhythm — info grid uses py-6 sm:py-8 (not pt-8 sm:pt-10 pb-5)', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // Info grid: has `grid-cols-1 sm:grid-cols-2`.
    const grid = container.querySelector('div.grid.grid-cols-1.sm\\:grid-cols-2')
    expect(grid).toBeTruthy()
    const cls = (grid as Element).className
    expect(classHas(grid as Element, 'py-6', 'sm:py-8')).toBe(true)
    expect(cls.includes('pt-8 sm:pt-10 pb-5')).toBe(false)
  })

  it('vertical rhythm — DocumentTotals wrapper uses py-6 (not py-5)', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // DocumentTotals wrapper: flex + justify-end + px-6 sm:px-10, and NOT the
    // section subtotal footer (which also has flex+justify-end+px-6 but adds
    // items-center + gap-3 + bg-muted/10). Filter by absence of bg-muted/10.
    const totals = Array.from(container.querySelectorAll('div.flex.justify-end')).find(
      (n) =>
        n.className.includes('px-6') &&
        n.className.includes('sm:px-10') &&
        !n.className.includes('bg-muted/10')
    )
    expect(totals).toBeTruthy()
    expect((totals as Element).className.split(/\s+/).includes('py-6')).toBe(true)
    expect((totals as Element).className.split(/\s+/).includes('py-5')).toBe(false)
  })

  it('vertical rhythm — Terms section uses py-6 (not pt-4 pb-6)', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    // Terms wrapper contains 'Payment Terms' (the seeded payment_terms field).
    const terms = Array.from(container.querySelectorAll('div')).find(
      (n) =>
        n.className.includes('space-y-4') &&
        n.className.includes('border-t') &&
        n.className.includes('px-6')
    )
    expect(terms).toBeTruthy()
    const cls = (terms as Element).className
    expect((terms as Element).className.split(/\s+/).includes('py-6')).toBe(true)
    expect(cls.includes('pt-4')).toBe(false)
    expect(cls.includes('pb-6 pt-4')).toBe(false)
  })

  it('view mode DOM — snapshot stable post-alignment', () => {
    const { container } = render(<EstimateDocument mode="view" {...baseProps} />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
