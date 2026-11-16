import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
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
vi.mock('@/components/workspace/estimate/engagement-panel', () => ({
  EngagementPanel: () => null,
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
    />
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

  it('marks an answered estimate as locked, offers no retry and disables Edit with AI', () => {
    render(
      <Harness
        frame="v2"
        estimate={buildEstimate({ client_response: 'accepted', responded_at: '2026-01-02T00:00:00.000Z' })}
      />,
    )
    const slot = screen.getByTestId('slot')
    expect(slot.getAttribute('data-locked')).toBe('true')
    expect(slot.getAttribute('data-retry')).toBe('no')
    expect((screen.getByTestId('edit-with-ai-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the floating pill and no dock in the v1 frame', () => {
    render(<Harness frame="v1" estimate={buildEstimate()} />)
    expect(screen.getByTestId('legacy-pill')).toBeTruthy()
    expect(screen.queryByTestId('editor-dock')).toBeNull()
  })
})
