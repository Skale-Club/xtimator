import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import {
  EstimateDocument,
  type EstimateDocumentData,
  type DocumentClient,
} from '@/components/workspace/estimate/estimate-document'

// Wave 3 (162-03) — DOCUX-02 Bill To pencil affordance. Real RTL assertions
// replacing the 162-01 scaffold placeholders. Every test targets the Bill To
// block rendered by EstimateDocument (edit vs view mode, projectId gate).

// ---------------------------------------------------------------------------
// Mocks (mirrors client-picker.test.tsx setup so the popover flow works)
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockLink = vi.fn()
const mockUnlink = vi.fn()

vi.mock('@/lib/actions/project', () => ({
  linkProjectToClient: (...args: unknown[]) => mockLink(...args),
  unlinkProjectFromClient: (...args: unknown[]) => mockUnlink(...args),
  renameProjectAction: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

interface MockClient {
  id: string
  name: string
  email: string | null
  phone: string | null
}

const DEFAULT_CLIENTS: MockClient[] = [
  { id: 'c1', name: 'Acme', email: null, phone: null },
  { id: 'c2', name: 'Bravo', email: 'bravo@example.com', phone: null },
]

function mockClientsFetch(clients: MockClient[] = DEFAULT_CLIENTS): void {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => clients,
  }) as unknown as typeof fetch
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyData: EstimateDocumentData = {
  summary: null,
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
  discount_type: null,
  discount_value: 0,
  discount_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  subtotal: 0,
  total: 0,
  deposit_type: 'none',
  deposit_value: null,
  deposit: 0,
  balance_due: 0,
  currency_code: 'USD',
  sections: [],
  estimate_date: '2026-07-08',
  estimate_number: null,
}

// NOTE: linkedClient's name is deliberately DISTINCT from the DEFAULT_CLIENTS
// list ('Acme', 'Bravo') so `findByText('Acme')` in the popover-open flow
// resolves to the cmdk item, not the Bill To label above it.
const linkedClient: DocumentClient = {
  id: 'existing-linked-id',
  name: 'Existing Ltd',
  email: null,
  phone: null,
  address: null,
  city: null,
  state: null,
  zip: null,
}

// Use the `in` check to distinguish "not provided" from "explicit undefined"
// so a test can pass `projectId: undefined` to exercise the defensive guard.
function baseProps(overrides?: {
  mode?: 'edit' | 'view'
  client?: DocumentClient | null
  projectId?: string
}) {
  const clientOverridden = overrides && 'client' in overrides
  const projectIdOverridden = overrides && 'projectId' in overrides
  return {
    mode: overrides?.mode ?? 'edit',
    data: emptyData,
    client: clientOverridden ? overrides!.client! : linkedClient,
    projectName: 'Deck Rebuild',
    projectType: null,
    estimateVersion: 1,
    estimateCreatedAt: '2026-07-08T00:00:00Z',
    projectId: projectIdOverridden ? overrides!.projectId : 'project-1',
    dispatch: overrides?.mode === 'view' ? undefined : vi.fn(),
  } as const
}

beforeEach(() => {
  mockLink.mockReset()
  mockLink.mockResolvedValue({ data: {} })
  mockUnlink.mockReset()
  mockUnlink.mockResolvedValue({ data: {} })
  mockClientsFetch()
})

// Locate the Bill To block's pencil trigger (aria-label="Change client").
// Returns null if not present in the DOM.
function queryPencilButton(): HTMLElement | null {
  return screen.queryByRole('button', { name: /change client/i })
}

describe('Bill To pencil affordance (DOCUX-02)', () => {
  it('pencil is hidden by default (opacity-0) when the Bill To block is not hovered/focused', () => {
    render(<EstimateDocument {...baseProps()} />)
    const pencil = queryPencilButton()
    expect(pencil).toBeTruthy()
    expect(pencil!.className).toContain('opacity-0')
  })

  it('pencil reveals on hover of the Bill To block (group-hover:opacity-100)', () => {
    render(<EstimateDocument {...baseProps()} />)
    const pencil = queryPencilButton()
    expect(pencil).toBeTruthy()
    expect(pencil!.className).toContain('group-hover:opacity-100')
    // The wrapping Bill To block carries `group` — the CSS trigger for
    // opacity-100 on group-hover.
    const wrapper = pencil!.closest('.group')
    expect(wrapper).toBeTruthy()
    // Sanity: the wrapper contains the Bill To label (i.e. the group class
    // is on the correct block, not on a stray ancestor).
    expect(wrapper!.textContent).toContain('Bill To')
  })

  it('pencil reveals on focus (focus:opacity-100)', () => {
    render(<EstimateDocument {...baseProps()} />)
    const pencil = queryPencilButton()
    expect(pencil!.className).toContain('focus:opacity-100')
  })

  it('clicking the pencil opens the ClientPicker Popover (search input becomes visible)', async () => {
    render(<EstimateDocument {...baseProps()} />)
    const pencil = queryPencilButton()!
    fireEvent.click(pencil)
    // The popover portal renders the CommandInput
    const searchInput = await screen.findByPlaceholderText('Search clients...')
    expect(searchInput).toBeTruthy()
  })

  it('pencil is NOT rendered when mode="view" (customer-facing share page is untouched)', () => {
    render(<EstimateDocument {...baseProps({ mode: 'view' })} />)
    // Bill To block is still there (client is linked), but no pencil trigger.
    expect(screen.getByText('Bill To')).toBeTruthy()
    expect(queryPencilButton()).toBeNull()
  })

  it('pencil is NOT rendered when projectId is undefined (defensive guard)', () => {
    render(<EstimateDocument {...baseProps({ projectId: undefined })} />)
    // Bill To block still renders, but the pencil is gated behind projectId.
    expect(screen.getByText('Bill To')).toBeTruthy()
    expect(queryPencilButton()).toBeNull()
  })

  it('selecting a client in the popover dispatches linkProjectToClient with (projectId, clientId)', async () => {
    render(<EstimateDocument {...baseProps()} />)
    const pencil = queryPencilButton()!
    fireEvent.click(pencil)
    // Wait for the popover to render its content and for the fetched clients
    // to appear.
    const acme = await screen.findByText('Acme')
    const item = acme.closest('[cmdk-item]') ?? acme
    fireEvent.click(item)
    await waitFor(() => {
      expect(mockLink).toHaveBeenCalledWith('project-1', 'c1')
    })
    cleanup()
  })
})
