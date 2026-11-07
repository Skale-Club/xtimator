import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClientList } from '@/components/clients/client-list'
import type { ClientDetail } from '@/lib/queries/clients'

const { refreshMock, createBrowserClientMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  createBrowserClientMock: vi.fn(() => { throw new Error('Editing must not fetch from the browser') }),
}))

beforeEach(() => {
  refreshMock.mockClear()
  createBrowserClientMock.mockClear()
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
  }),
  usePathname: () => '/clients',
  // The shared list keeps search/sort/page in the URL.
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock server actions
vi.mock('@/lib/actions/client', () => ({
  deleteClientAction: vi.fn().mockResolvedValue({ data: { deleted: true, orphanedProjects: 0 } }),
  createClientAction: vi.fn(),
  updateClientAction: vi.fn(),
}))

// Mock Supabase browser client
vi.mock('@/lib/supabase/client', () => ({
  createClient: createBrowserClientMock,
}))

// Mock ClientSheet to avoid form complexity in list tests
vi.mock('@/components/clients/client-sheet', () => ({
  ClientSheet: ({ open, client, onOpenChange }: { open: boolean; client: ClientDetail | null; onOpenChange: (open: boolean) => void }) =>
    open ? <div data-testid="client-sheet">
      <span>{client?.address}</span><span>{client?.notes}</span>
      <button onClick={() => onOpenChange(false)}>Close editor</button>
    </div> : null,
}))

const emptyDetails = { address: null, city: null, state: null, zip: null, notes: null, preferred_language: null }
const mockClients: ClientDetail[] = [
  {
    ...emptyDetails,
    id: '1',
    name: 'Acme Corp',
    email: 'info@acme.com',
    phone: '555-1234',
    logo_url: null,
    created_at: '2026-01-01',
    project_count: 3,
    address: '123 Main Street',
    notes: 'Existing client notes',
  },
  {
    ...emptyDetails,
    id: '2',
    name: 'Beta LLC',
    email: 'hello@beta.com',
    phone: '555-5678',
    logo_url: null,
    created_at: '2026-01-02',
    project_count: 0,
  },
  {
    ...emptyDetails,
    id: '3',
    name: 'Gamma Inc',
    email: null,
    phone: null,
    logo_url: null,
    created_at: '2026-01-03',
    project_count: 1,
  },
]

describe('ClientList', () => {
  it('opens editing immediately with all saved fields and no browser request', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Actions: Acme Corp' })[0], { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(screen.getByTestId('client-sheet')).toBeTruthy()
    expect(screen.getByText('123 Main Street')).toBeTruthy()
    expect(screen.getByText('Existing client notes')).toBeTruthy()
    expect(createBrowserClientMock).not.toHaveBeenCalled()
  })

  it('does not refresh the page when cancelling the editor', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))

    expect(screen.queryByTestId('client-sheet')).toBeNull()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('renders empty state when clients array is empty', () => {
    render(<ClientList clients={[]} companyId="c1" />)
    expect(screen.getByText('No clients yet')).toBeDefined()
    expect(screen.getByText('Add your first client to get started')).toBeDefined()
  })

  it('renders client names when clients provided', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    // Both desktop table and mobile cards render, so use getAllByText
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beta LLC').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gamma Inc').length).toBeGreaterThan(0)
  })

  it('search filters clients by name', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search clients...')
    fireEvent.change(searchInput, { target: { value: 'acme' } })

    // Acme should remain visible, others should not
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.queryByText('Beta LLC')).toBeNull()
    expect(screen.queryByText('Gamma Inc')).toBeNull()
  })

  it('search filters clients by email', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search clients...')
    fireEvent.change(searchInput, { target: { value: 'hello@beta' } })

    expect(screen.getAllByText('Beta LLC').length).toBeGreaterThan(0)
    expect(screen.queryByText('Acme Corp')).toBeNull()
  })

  it('"no results" empty state appears when search matches nothing', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    const searchInput = screen.getByPlaceholderText('Search clients...')
    fireEvent.change(searchInput, { target: { value: 'zzzznotfound' } })

    expect(screen.getByText('No clients match your search')).toBeDefined()
  })

  it('delete dialog shows project count warning when client has projects', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)

    // Find and click the delete option for Acme Corp (which has 3 projects)
    // The desktop table has dropdown menus - we need to open one
    const menuButtons = screen.getAllByRole('button')
    // Find a menu trigger button (the MoreHorizontal icon buttons)
    const dropdownTriggers = menuButtons.filter(
      (btn) => btn.getAttribute('data-state') !== undefined || btn.className.includes('h-8 w-8')
    )

    // Click the first dropdown trigger (Acme Corp row)
    if (dropdownTriggers.length > 0) {
      fireEvent.click(dropdownTriggers[0])
    }

    // Look for Delete option in the dropdown
    const deleteOption = screen.queryAllByText('Delete')
    if (deleteOption.length > 0) {
      fireEvent.click(deleteOption[0])
    }

    // Now the AlertDialog should be open with the project count warning
    const warningText = screen.queryByText(/has 3 project\(s\)/i)
    expect(warningText).toBeDefined()
  })
})
