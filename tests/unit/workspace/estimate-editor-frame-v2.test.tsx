import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EstimateEditor } from '@/components/workspace/estimate/estimate-editor'
import {
  EstimateVersionProvider,
  useEstimateVersionSlot,
} from '@/components/workspace/estimate-version-context'
import { EditorFrameProvider } from '@/components/workspace/editor-frame/context'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentCompany, CompanyDefaults } from '@/components/workspace/estimate/estimate-document'

// Editor frame v2: the editor portals its actions into the workspace's dock
// mount and publishes what the top bar shows through the version slot.
//
// The REAL EstimateVersionProvider is used on purpose. Publishing the slot
// re-renders the editor (it consumes the same context), so one unstable value
// in the slot effect's deps turns into an endless render loop ("Maximum update
// depth exceeded"). That happened with runSave, whose identity follows `t`; the
// `t` below is a new function on every render to keep that covered.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
vi.mock('@/lib/actions/estimate', () => ({
  saveEstimate: vi.fn(),
  savePresentationSettings: vi.fn(),
  createBlankEstimate: vi.fn(),
  getEstimateByIdAction: vi.fn(),
}))
vi.mock('@/lib/actions/estimate-photo', () => ({ removePhotoFromEstimate: vi.fn() }))
vi.mock('@/lib/actions/project', () => ({ renameProjectAction: vi.fn() }))
vi.mock('@/lib/actions/estimate-response', () => ({ recordClientResponse: vi.fn() }))
// The contract card of an accepted estimate loads its summary on mount.
vi.mock('@/lib/actions/change-order', () => ({
  createChangeOrder: vi.fn(),
  getChangeOrderAction: vi.fn(),
  saveChangeOrder: vi.fn(),
  deleteChangeOrder: vi.fn(),
  markChangeOrderShared: vi.fn(),
  recordChangeOrderResponse: vi.fn(),
  getContractSummaryAction: vi.fn(),
}))
vi.mock('@/components/projects/new-project-dialog', () => ({
  editEstimateHref: () => '/edit',
}))
vi.mock('@/components/workspace/estimate/estimate-document', () => ({
  EstimateDocument: () => <div data-testid="edit-document" />,
}))
vi.mock('@/components/workspace/estimate/paginated-preview', () => ({
  PaginatedPreview: () => <div data-testid="paginated-preview" />,
}))
vi.mock('@/components/workspace/estimate/use-paginated-preview', () => ({
  usePaginatedPreview: () => ({ pages: null }),
}))
vi.mock('@/components/workspace/estimate/estimate-floating-actions', () => ({
  EstimateFloatingActions: () => <div data-testid="legacy-pill" />,
}))
vi.mock('@/components/workspace/estimate/presentation-settings-panel', () => ({
  PresentationSettingsPanel: () => null,
}))
vi.mock('@/components/workspace/estimate/issued-invoices-panel', () => ({
  IssuedInvoicesPanel: () => null,
}))
vi.mock('@/components/workspace/estimate/generate-invoice-dialog', () => ({
  GenerateInvoiceDialog: () => null,
}))
vi.mock('@/components/workspace/estimate/analytics/estimate-analytics-drawer', () => ({
  // The panel's contract slot renders only while the panel is open.
  EstimateAnalyticsDrawer: ({ open, contract }: { open: boolean; contract?: import('react').ReactNode }) =>
    open ? <div data-testid="analytics-drawer">{contract}</div> : null,
}))

function buildEstimate(overrides: Record<string, unknown> = {}): EstimateWithSections {
  return {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'company-1',
    currency_code: 'USD',
    version: 1,
    estimate_seq: 7,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    public_slug_token: null,
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 0,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 1250,
    deposit_type: 'none',
    deposit_value: null,
    balance_due: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    view_count: 0,
    last_viewed_at: null,
    share_password_hash: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    presentation_settings: null,
    attachedPhotos: [],
    hasSignature: false,
    sections: [],
    ...overrides,
  } as unknown as EstimateWithSections
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
  brand_primary_color: null,
}
const companyDefaults: CompanyDefaults = { payment_terms: null, warranty_terms: null, tax_rate: 0 }

/** Shows what the editor published, the way the top bar would read it. */
function SlotProbe() {
  const { slot } = useEstimateVersionSlot()
  if (!slot) return <div data-testid="slot">none</div>
  return (
    <div
      data-testid="slot"
      data-total={slot.total}
      data-number={slot.estimateNumber}
      data-locked={String(slot.isLocked)}
      data-retry={slot.onRetrySave ? 'yes' : 'no'}
      data-status={slot.onOpenStatus ? 'yes' : 'no'}
      data-reopen={slot.onReopen ? 'yes' : 'no'}
      data-co-count={slot.changeOrderCount ?? 0}
    >
      {slot.onOpenStatus && (
        <button type="button" data-testid="open-status" onClick={slot.onOpenStatus}>
          status
        </button>
      )}
    </div>
  )
}

function Harness({ frame, estimate }: { frame: 'v1' | 'v2'; estimate: EstimateWithSections }) {
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null)
  return (
    <EstimateVersionProvider>
      <EditorFrameProvider frame={frame} dockEl={dockEl}>
        <SlotProbe />
        <EstimateEditor
          estimate={estimate}
          versions={[]}
          issuedInvoices={[]}
          paymentsEnabled={false}
          projectId="proj-1"
          companyId="company-1"
          companyBrandColor={null}
          company={company}
          companyDefaults={companyDefaults}
          estimateTemplateId="classic"
          preparedBy={null}
          recordings={[]}
          photos={[]}
          projectName="Test Project"
          projectType={null}
          client={null}
          priceBookItems={[]}
          onSend={() => {}}
        />
        <div ref={setDockEl} data-testid="dock-mount" />
      </EditorFrameProvider>
    </EstimateVersionProvider>
  )
}

const ACCEPTED = { client_response: 'accepted', responded_at: '2026-01-02T00:00:00.000Z' }

beforeEach(async () => {
  const actions = await import('@/lib/actions/change-order')
  vi.mocked(actions.getContractSummaryAction).mockResolvedValue({
    data: {
      estimateId: 'est-1',
      currencyCode: 'USD',
      estimateNumber: '0007',
      acceptedAt: '2026-01-02T00:00:00.000Z',
      signedOnline: false,
      baseTotal: 1250,
      changeOrders: [],
      approvedTotal: 0,
      pendingTotal: 0,
      contractTotal: 1250,
    },
  } as never)
  vi.mocked(actions.createChangeOrder).mockResolvedValue({ data: { id: 'co-1', number: 1 } } as never)
})

describe('EstimateEditor in the v2 frame', () => {
  it('portals the docked actions into the mount and drops the floating pill', () => {
    render(<Harness frame="v2" estimate={buildEstimate()} />)
    const mount = screen.getByTestId('dock-mount')
    expect(mount.querySelector('[data-testid="editor-dock"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Share/ })).toBeTruthy()
    expect(screen.queryByTestId('legacy-pill')).toBeNull()
  })

  it('publishes the top bar fields and settles (no render loop)', () => {
    render(<Harness frame="v2" estimate={buildEstimate()} />)
    const slot = screen.getByTestId('slot')
    expect(slot.getAttribute('data-total')).toBe('1250')
    expect(slot.getAttribute('data-number')).toBe('0007')
    expect(slot.getAttribute('data-locked')).toBe('false')
    expect(slot.getAttribute('data-retry')).toBe('yes')
    expect(slot.getAttribute('data-status')).toBe('yes')
  })

  it('marks an answered estimate as locked, offers no retry and swaps Edit with AI for New change order', () => {
    render(
      <Harness
        frame="v2"
        estimate={buildEstimate({ client_response: 'accepted', responded_at: '2026-01-02T00:00:00.000Z' })}
      />,
    )
    const slot = screen.getByTestId('slot')
    expect(slot.getAttribute('data-locked')).toBe('true')
    expect(slot.getAttribute('data-retry')).toBe('no')
    // Accepted: the dock's primary is New change order and the disabled AI button is left out.
    expect(screen.queryByTestId('edit-with-ai-btn')).toBeNull()
    expect(screen.getByTestId('new-change-order-btn')).toBeTruthy()
  })

  // Notices review stage 1, part 2: the lock banner's "Revise and reopen" moved
  // to the dock's primary; "Edit with AI" (locked anyway) steps aside.
  it('leads the dock with "Revise and reopen" on a declined estimate', () => {
    render(
      <Harness
        frame="v2"
        estimate={buildEstimate({ client_response: 'declined', responded_at: '2026-01-02T00:00:00.000Z' })}
      />,
    )
    expect(screen.getByTestId('revise-and-reopen-btn').textContent).toContain('Revise and reopen')
    expect(screen.queryByTestId('edit-with-ai-btn')).toBeNull()
  })

  it('offers "Revise and reopen" only for a declined estimate without a signature', async () => {
    const { recordClientResponse } = await import('@/lib/actions/estimate-response')
    vi.mocked(recordClientResponse).mockResolvedValue({
      success: true,
      data: { client_response: null, responded_at: null, updated_at: '2026-01-03T00:00:00.000Z' },
    } as never)
    const { unmount } = render(
      <Harness
        frame="v2"
        estimate={buildEstimate({ client_response: 'declined', responded_at: '2026-01-02T00:00:00.000Z' })}
      />,
    )
    expect(screen.getByTestId('slot').getAttribute('data-reopen')).toBe('yes')
    unmount()
    render(
      <Harness
        frame="v2"
        estimate={buildEstimate({ client_response: 'accepted', responded_at: '2026-01-02T00:00:00.000Z' })}
      />,
    )
    expect(screen.getByTestId('slot').getAttribute('data-reopen')).toBe('no')
  })

  it('keeps the floating pill and no dock in the v1 frame', () => {
    render(<Harness frame="v1" estimate={buildEstimate()} />)
    expect(screen.getByTestId('legacy-pill')).toBeTruthy()
    expect(screen.queryByTestId('editor-dock')).toBeNull()
  })
  describe('change orders on an accepted estimate', () => {
    it('keeps the contract out of the page and shows it in the status panel', async () => {
      render(<Harness frame="v2" estimate={buildEstimate(ACCEPTED)} />)
      // Nothing above the estimate: the card is not on the page.
      expect(screen.queryByTestId('contract-card')).toBeNull()
      expect(screen.queryByTestId('contract-card-loading')).toBeNull()
      fireEvent.click(screen.getByTestId('open-status'))
      expect(await screen.findByTestId('contract-card')).toBeTruthy()
    })

    it('counts sent change orders (not drafts) for the status chip', async () => {
      const actions = await import('@/lib/actions/change-order')
      vi.mocked(actions.getContractSummaryAction).mockResolvedValue({
        data: {
          estimateId: 'est-1',
          currencyCode: 'USD',
          estimateNumber: '0007',
          acceptedAt: '2026-01-02T00:00:00.000Z',
          signedOnline: false,
          baseTotal: 1250,
          changeOrders: [
            { id: 'a', number: 1, status: 'draft', title: 'x', total: 0, responded_at: null, view_count: 0, invoice_status: null },
            { id: 'b', number: 2, status: 'sent', title: 'y', total: 100, responded_at: null, view_count: 0, invoice_status: null },
            { id: 'c', number: 3, status: 'accepted', title: 'z', total: 50, responded_at: null, view_count: 1, invoice_status: null },
          ],
          approvedTotal: 50,
          pendingTotal: 100,
          contractTotal: 1300,
        },
      } as never)
      render(<Harness frame="v2" estimate={buildEstimate(ACCEPTED)} />)
      await waitFor(() => expect(screen.getByTestId('slot').getAttribute('data-co-count')).toBe('2'))
    })

    it('has a "New change order" primary, with Share moved to Send', () => {
      render(<Harness frame="v2" estimate={buildEstimate(ACCEPTED)} />)
      const mount = screen.getByTestId('dock-mount')
      expect(mount.querySelector('[data-testid="new-change-order-btn"]')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    })

    it('the dock primary creates a change order for the current estimate', async () => {
      const { createChangeOrder } = await import('@/lib/actions/change-order')
      render(<Harness frame="v2" estimate={buildEstimate(ACCEPTED)} />)
      fireEvent.click(screen.getByTestId('new-change-order-btn'))
      await waitFor(() => expect(createChangeOrder).toHaveBeenCalledWith('est-1'))
    })

    it('shows neither the card nor the primary before the estimate is accepted', () => {
      render(<Harness frame="v2" estimate={buildEstimate()} />)
      expect(screen.queryByTestId('contract-card')).toBeNull()
      expect(screen.queryByTestId('contract-card-loading')).toBeNull()
      expect(screen.queryByTestId('new-change-order-btn')).toBeNull()
      expect(screen.getByRole('button', { name: /Share/ })).toBeTruthy()
    })

    it('shows neither for an accepted version that is no longer current', () => {
      render(<Harness frame="v2" estimate={buildEstimate({ ...ACCEPTED, is_current: false })} />)
      expect(screen.queryByTestId('contract-card')).toBeNull()
      expect(screen.queryByTestId('contract-card-loading')).toBeNull()
      expect(screen.queryByTestId('new-change-order-btn')).toBeNull()
    })

    it('does not show the card in the v1 frame', () => {
      render(<Harness frame="v1" estimate={buildEstimate(ACCEPTED)} />)
      expect(screen.queryByTestId('contract-card')).toBeNull()
      expect(screen.queryByTestId('contract-card-loading')).toBeNull()
    })
  })
})
