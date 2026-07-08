import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ClientPicker } from '@/components/clients/client-picker'

// Wave 1 (162-02) — DOCUX-02 (billTo variant) + DOCUX-03 (single consolidated
// component). Real RTL assertions replacing the 162-01 it.todo scaffold. Every
// test targets `components/clients/client-picker.tsx` — the ONE shared picker.

// -------------------------------------------------------------------------
// Mocks
// -------------------------------------------------------------------------

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
  { id: 'c3', name: 'Charlie', email: null, phone: null },
]

function mockClientsFetch(clients: MockClient[] = DEFAULT_CLIENTS): void {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => clients,
  }) as unknown as typeof fetch
}

beforeEach(() => {
  mockLink.mockReset()
  mockLink.mockResolvedValue({ data: {} })
  mockUnlink.mockReset()
  mockUnlink.mockResolvedValue({ data: {} })
  mockClientsFetch()
})

describe('ClientPicker (DOCUX-02, DOCUX-03)', () => {
  it('renders card variant — Card variant="glass" shell + Link Client button (mirrors LinkClientCard)', () => {
    render(<ClientPicker projectId="p1" currentClientId={null} variant="card" />)
    // CardTitle "Link a Client"
    expect(screen.getByText('Link a Client')).toBeTruthy()
    // Trigger button "Link Client" (the Link Client Button inside CardContent)
    const buttons = screen.getAllByText('Link Client')
    expect(buttons.length).toBeGreaterThanOrEqual(1)
    // UserPlus icon(s) present (SVG rendered by lucide-react)
    const svgs = document.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThanOrEqual(1)
  })

  it('renders button variant — Button rounded-full ghost UserPlus trigger (mirrors LinkClientButton)', () => {
    render(<ClientPicker projectId="p1" currentClientId={null} variant="button" />)
    const button = screen.getByRole('button', { name: /link client/i })
    expect(button.className).toContain('rounded-full')
    expect(button.className).toContain('gap-1.5')
    expect(button.className).toContain('text-foreground')
    // UserPlus icon
    expect(button.querySelector('svg')).toBeTruthy()
  })

  it('renders inline variant — bare button "No client linked" + UserPlus (mirrors LinkClientInline)', () => {
    render(<ClientPicker projectId="p1" currentClientId={null} variant="inline" />)
    const label = screen.getByText('No client linked')
    // The italic class lives on the wrapping button, not the span
    const button = label.closest('button')
    expect(button).toBeTruthy()
    expect(button!.className).toContain('italic')
    expect(button!.className).toContain('text-muted-foreground')
    expect(button!.className).toContain('text-lg')
    expect(button!.querySelector('svg')).toBeTruthy()
  })

  it('renders billTo variant — Pencil icon with opacity-0 group-hover:opacity-100 focus:opacity-100 (NEW — for DOCUX-02)', () => {
    render(<ClientPicker projectId="p1" currentClientId={null} variant="billTo" />)
    const button = screen.getByRole('button', { name: /change client/i })
    expect(button.className).toContain('opacity-0')
    expect(button.className).toContain('group-hover:opacity-100')
    expect(button.className).toContain('focus:opacity-100')
    // Pencil icon SVG
    expect(button.querySelector('svg')).toBeTruthy()
    // NO UserPlus in billTo variant — verify no "Link Client" or "No client linked" text on this trigger
    expect(screen.queryByText('Link Client')).toBeNull()
    expect(screen.queryByText('No client linked')).toBeNull()
  })

  it('dispatches linkProjectToClient(projectId, clientId) on client selection (mocked)', async () => {
    render(<ClientPicker projectId="project-1" currentClientId={null} variant="button" />)
    fireEvent.click(screen.getByRole('button', { name: /link client/i }))
    // Wait for popover portal + fetch resolution
    const acme = await screen.findByText('Acme')
    // cmdk items respond to click; the closest cmdk item wrapper carries onSelect
    const item = acme.closest('[cmdk-item]') ?? acme
    fireEvent.click(item)
    await waitFor(() => {
      expect(mockLink).toHaveBeenCalledWith('project-1', 'c1')
    })
  })

  it('shows Unlink footer button only when currentClientId is non-null', async () => {
    // Case 1: currentClientId=null → NO unlink button
    render(<ClientPicker projectId="p1" currentClientId={null} variant="billTo" />)
    fireEvent.click(screen.getByRole('button', { name: /change client/i }))
    await screen.findByText('Acme')
    expect(screen.queryByText('Unlink client')).toBeNull()
    cleanup()

    // Case 2: currentClientId='c1' → Unlink button present
    render(<ClientPicker projectId="p1" currentClientId="c1" variant="billTo" />)
    fireEvent.click(screen.getByRole('button', { name: /change client/i }))
    await screen.findByText('Acme')
    expect(screen.getByText('Unlink client')).toBeTruthy()
  })

  it('unlink calls unlinkProjectFromClient(projectId) (mocked)', async () => {
    render(<ClientPicker projectId="project-1" currentClientId="c1" variant="billTo" />)
    fireEvent.click(screen.getByRole('button', { name: /change client/i }))
    const unlink = await screen.findByText('Unlink client')
    fireEvent.click(unlink)
    await waitFor(() => {
      expect(mockUnlink).toHaveBeenCalledWith('project-1')
    })
  })

  it('search filters clients by name OR email (case-insensitive)', async () => {
    render(<ClientPicker projectId="p1" currentClientId={null} variant="button" />)
    fireEvent.click(screen.getByRole('button', { name: /link client/i }))
    // All three clients present initially
    await screen.findByText('Bravo')
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Charlie')).toBeTruthy()

    const input = screen.getByPlaceholderText('Search clients...')
    fireEvent.change(input, { target: { value: 'brav' } })

    await waitFor(() => {
      expect(screen.queryByText('Acme')).toBeNull()
      expect(screen.queryByText('Charlie')).toBeNull()
      expect(screen.getByText('Bravo')).toBeTruthy()
    })
  })

  it('CommandEmpty renders "No clients found." when filtered list is empty', async () => {
    mockClientsFetch([])
    render(<ClientPicker projectId="p1" currentClientId={null} variant="button" />)
    fireEvent.click(screen.getByRole('button', { name: /link client/i }))
    await screen.findByText('No clients found.')
  })
})
