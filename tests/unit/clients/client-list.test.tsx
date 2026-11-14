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

  it('renders each client once and links the whole row to the client page', () => {
    render(<ClientList clients={mockClients} companyId="c1" />)
    const links = screen.getAllByRole('link', { name: 'Acme Corp' })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/clients/1')
  })

  it('shows a summary with the client count and the estimate total', () => {
    const withStats = mockClients.map((c, i) => ({ ...c, total_value: [1200, 0, 300][i], last_activity_at: null }))
    render(<ClientList clients={withStats} companyId="c1" />)
    const summary = screen.getByTestId('clients-summary').textContent ?? ''
    expect(summary).toContain('3 clients')
    expect(summary).toContain('in estimates')
  })

  it('offers call for clients with a phone and email for clients with only an email', () => {
    const clients = [
      { ...mockClients[0], phone: '+16175550105' },
      { ...mockClients[1], phone: null },
    ]
    render(<ClientList clients={clients} companyId="c1" />)
    expect(screen.getByRole('link', { name: 'Call Acme Corp' }).getAttribute('href')).toBe('tel:+16175550105')
    expect(screen.getByRole('link', { name: 'Email Beta LLC' }).getAttribute('href')).toBe('mailto:hello@beta.com')
    expect(screen.queryByRole('link', { name: 'Call Beta LLC' })).toBeNull()
    // US numbers read without the +1
    expect(screen.getByText('(617) 555-0105')).toBeDefined()
  })

  it('sorts by recent activity by default and by highest total on request', () => {
    const clients = [
      { ...mockClients[0], total_value: 100, last_activity_at: '2026-09-01T00:00:00Z' },
      { ...mockClients[1], total_value: 900, last_activity_at: '2026-11-01T00:00:00Z' },
      { ...mockClients[2], total_value: 500, last_activity_at: null },
    ]
    render(<ClientList clients={clients} companyId="c1" />)
    const names = () => screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/clients/')).map((l) => l.textContent)
    expect(names()).toEqual(['Beta LLC', 'Acme Corp', 'Gamma Inc'])
    const trigger = screen.getByRole('button', { name: /^Sort:/ })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Highest total' }))
    expect(names()).toEqual(['Beta LLC', 'Gamma Inc', 'Acme Corp'])
  })

  it('search also matches the city', () => {
    const clients = [{ ...mockClients[0], city: 'Winchester' }, mockClients[1]]
    render(<ClientList clients={clients} companyId="c1" />)
    fireEvent.change(screen.getByPlaceholderText('Search clients...'), { target: { value: 'winch' } })
    expect(screen.getByText('Acme Corp')).toBeDefined()
    expect(screen.queryByText('Beta LLC')).toBeNull()
  })
})
