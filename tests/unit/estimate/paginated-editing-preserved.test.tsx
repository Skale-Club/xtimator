// tests/unit/estimate/paginated-editing-preserved.test.tsx
//
// Phase 185 Plan 04 (PGMODE-03) — proves TWO regression-guarded claims that
// were previously only "true by architecture", not proven by a test:
//   (1) Focus/key-stability: an edit that changes an EARLIER section's item
//       count never remounts (or loses focus on) an UNRELATED item row's
//       input elsewhere in the document — even while rendered inside
//       PaginatedDocumentOverlay's paginated tray.
//   (2) dnd-kit document-order proof: the rendered section/item DOM order
//       (and therefore dnd-kit's SortableContext list) is ALWAYS driven by
//       `data.sections`/`section.items`' own array order — page membership
//       (an entirely separate, purely-visual overlay concern EstimateDocument
//       doesn't even receive as a prop) can never leak into it.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import React from 'react'
import { useEstimateReducer, type EstimateEditorState } from '@/components/workspace/estimate/use-estimate-reducer'
import { EstimateDocument, type EstimateDocumentData, type DocumentCompany } from '@/components/workspace/estimate/estimate-document'
import { PaginatedDocumentOverlay } from '@/components/workspace/estimate/paginated-document-overlay'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'

// Mirrors tests/unit/estimate/document-page-view.test.tsx's exact mock
// setup (this plan's read_first) for EstimateDocument's edit-mode surface.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: vi.fn(),
  unlinkProjectFromClient: vi.fn(),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Fixture — 3 sections so we can dispatch a structural edit on an EARLIER
// section (section-a) while asserting a LATER section's (section-c) item
// row keeps its identity/focus.
// ---------------------------------------------------------------------------

function buildEstimate(): EstimateWithSections {
  const base = {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'company-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en' as const,
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 300,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 300,
    deposit_type: 'none' as const,
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null,
    attachedPhotos: [],
    hasSignature: false,
    sections: [
      {
        id: 'section-a',
        estimate_id: 'est-1',
        company_id: 'company-1',
        title: 'Section A',
        sort_order: 0,
        subtotal: 100,
        items: [
          {
            id: 'item-a1',
            section_id: 'section-a',
            company_id: 'company-1',
            description: 'Item A1',
            quantity: 1,
            unit: 'ea',
            unit_price: 100,
            total: 100,
            sort_order: 0,
            price_source: null,
            taxable: true,
          },
        ],
      },
      {
        id: 'section-b',
        estimate_id: 'est-1',
        company_id: 'company-1',
        title: 'Section B',
        sort_order: 1,
        subtotal: 100,
        items: [
          {
            id: 'item-b1',
            section_id: 'section-b',
            company_id: 'company-1',
            description: 'Item B1',
            quantity: 1,
            unit: 'ea',
            unit_price: 100,
            total: 100,
            sort_order: 0,
            price_source: null,
            taxable: true,
          },
        ],
      },
      {
        id: 'section-c',
        estimate_id: 'est-1',
        company_id: 'company-1',
        title: 'Section C',
        sort_order: 2,
        subtotal: 100,
        items: [
          {
            id: 'item-c1',
            section_id: 'section-c',
            company_id: 'company-1',
            description: 'Item C1',
            quantity: 1,
            unit: 'ea',
            unit_price: 100,
            total: 100,
            sort_order: 0,
            price_source: null,
            taxable: true,
          },
          {
            id: 'item-c2',
            section_id: 'section-c',
            company_id: 'company-1',
            description: 'Item C2',
            quantity: 1,
            unit: 'ea',
            unit_price: 100,
            total: 100,
            sort_order: 1,
            price_source: null,
            taxable: true,
          },
        ],
      },
    ],
  }
  return base as unknown as EstimateWithSections
}

/** Mirrors components/workspace/estimate/estimate-editor.tsx's
 *  stateToDocumentData() field-for-field (that function is not exported —
 *  this is a deliberate, minimal local mirror for this test only). */
function toDocData(state: EstimateEditorState): EstimateDocumentData {
  return {
    summary: state.summary,
    notes: state.notes,
    timeline: state.timeline,
    payment_terms: state.payment_terms,
    warranty_terms: state.warranty_terms,
    discount_type: state.discount_type,
    discount_value: state.discount_value,
    discount_amount: state.discount_amount,
    tax_rate: state.tax_rate,
    tax_amount: state.tax_amount,
    subtotal: state.subtotal,
    total: state.total,
    deposit_type: state.deposit_type,
    deposit_value: state.deposit_value,
    deposit: state.deposit,
    balance_due: state.balance_due,
    estimate_date: state.estimate_date,
    estimate_number: state.estimate_number,
    currency_code: state.currency_code,
    presentation_settings: state.presentation_settings,
    signature: state.signature,
    attachedPhotos: state.attachedPhotos.map((p) => ({
      id: p.id,
      storage_path: p.storage_path,
      caption: p.caption,
    })),
    sections: state.sections.map((s) => ({
      id: s.id,
      title: s.title,
      subtotal: s.subtotal,
      items: s.items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        total: i.total,
        sort_order: i.sort_order,
        price_source: i.price_source,
        discount: i.discount ?? 0,
        taxable: i.taxable ?? true,
      })),
    })),
  }
}

const company: DocumentCompany = {
  name: 'Acme Co',
  owner_name: null,
  phone: null,
  email: null,
  website: null,
  address: null,
  city: null,
  state: null,
  zip: null,
  logo_url: null,
  brand_primary_color: '#2563eb',
}

/** A non-null `pages` fixture (deliberately NOT derived from the real
 *  engine — this test proves EstimateDocument's DOM order is unaffected by
 *  whatever the overlay's page assignment says, so the fixture's own
 *  content doesn't need to correspond to real measured blocks). */
function block(id: string): PageBlock {
  return { kind: 'item-row', id, baseHeightPt: 10, atomic: true }
}
const STUB_PAGES: PageAssignment[] = [
  { pageIndex: 0, blocks: [block('section-a-header')], continuesTable: false },
  { pageIndex: 1, blocks: [block('section-c-rows-item-c2')], continuesTable: false },
]

// ---------------------------------------------------------------------------
// Test host — owns the REAL reducer so a dispatched ADD_ITEM genuinely
// updates state and re-renders, mirroring estimate-editor.tsx's real wiring.
// ---------------------------------------------------------------------------

function TestHost({
  initialEstimate,
  onDispatchReady,
}: {
  initialEstimate: EstimateWithSections
  onDispatchReady: (dispatch: ReturnType<typeof useEstimateReducer>[1]) => void
}) {
  const [state, dispatch] = useEstimateReducer(initialEstimate)
  onDispatchReady(dispatch)
  const data = toDocData(state)

  return (
    <PaginatedDocumentOverlay pages={STUB_PAGES} company={company} templateId="classic" language="en">
      <EstimateDocument
        mode="edit"
        data={data}
        company={company}
        client={null}
        projectName="Test Project"
        projectType={null}
        language="en"
        estimateVersion={1}
        estimateCreatedAt="2026-01-01T00:00:00Z"
        dispatch={dispatch}
      />
    </PaginatedDocumentOverlay>
  )
}

describe('Paginated editing preserves focus + dnd-kit document order (PGMODE-03)', () => {
  it('a structural edit on an EARLIER section never remounts (or loses focus on) a LATER section\'s item-row input', () => {
    const estimate = buildEstimate()
    let dispatch: ReturnType<typeof useEstimateReducer>[1] = () => {}
    const { container } = render(
      <TestHost initialEstimate={estimate} onDispatchReady={(d) => { dispatch = d }} />
    )

    // The target: section-c's SECOND item's description input — unrelated to
    // the structural edit we're about to dispatch on section-a.
    const targetRow = container.querySelector('[data-item-id="item-c2"]')
    expect(targetRow).toBeTruthy()
    const targetInput = targetRow!.querySelector('input, textarea, [contenteditable]') as HTMLElement | null
    expect(targetInput).toBeTruthy()

    targetInput!.focus()
    expect(document.activeElement).toBe(targetInput)

    act(() => {
      dispatch({ type: 'ADD_ITEM', sectionId: 'section-a' })
    })

    // Same identity — not remounted.
    const targetRowAfter = container.querySelector('[data-item-id="item-c2"]')
    expect(targetRowAfter).toBe(targetRow)
    const targetInputAfter = targetRowAfter!.querySelector('input, textarea, [contenteditable]')
    expect(targetInputAfter).toBe(targetInput)

    // Focus survived the structural edit.
    expect(document.activeElement).toBe(targetInput)
  })

  it('rendered section/item DOM order always matches data.sections order, independent of the (stub) page-assignment fixture', () => {
    const estimate = buildEstimate()
    const { container } = render(
      <TestHost initialEstimate={estimate} onDispatchReady={() => {}} />
    )

    const sectionHeaderIds = Array.from(container.querySelectorAll('[data-page-block-id$="-header"]')).map((el) =>
      (el.getAttribute('data-page-block-id') ?? '').replace(/-header$/, '')
    )
    expect(sectionHeaderIds).toEqual(['section-a', 'section-b', 'section-c'])

    const itemIds = Array.from(container.querySelectorAll('[data-item-id]')).map((el) =>
      el.getAttribute('data-item-id')
    )
    expect(itemIds).toEqual(['item-a1', 'item-b1', 'item-c1', 'item-c2'])
  })
})
