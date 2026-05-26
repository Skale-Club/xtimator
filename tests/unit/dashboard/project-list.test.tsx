import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectList } from '@/components/dashboard/project-list'
import type { ProjectWithClient } from '@/lib/queries/dashboard'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock server actions
vi.mock('@/lib/actions/project', () => ({
  deleteProjectAction: vi.fn(),
  duplicateProjectAction: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function makeProject(overrides: Partial<ProjectWithClient> = {}): ProjectWithClient {
  return {
    id: 'proj-1',
    name: 'Kitchen Remodel',
    project_type: 'construction',
    status: 'draft',
    total: 2500,
    created_at: '2026-04-01T00:00:00Z',
    client: { id: 'client-1', name: 'John Smith' },
    payment_status: null,
    paid_at: null,
    ...overrides,
  }
}

const sampleProjects: ProjectWithClient[] = [
  makeProject({ id: '1', name: 'Kitchen Remodel', status: 'draft', client: { id: 'c1', name: 'John Smith' } }),
  makeProject({ id: '2', name: 'Bathroom Tile', status: 'sent', client: { id: 'c2', name: 'Jane Doe' } }),
  makeProject({ id: '3', name: 'Deck Build', status: 'estimate_ready', client: { id: 'c3', name: 'Bob Jones' } }),
]

describe('ProjectList', () => {
  it('renders empty state when projects array is empty', () => {
    render(<ProjectList projects={[]} />)
    expect(screen.getByText('No projects yet')).toBeDefined()
    expect(screen.getByText('New Project')).toBeDefined()
  })

  it('renders project names when projects provided', () => {
    render(<ProjectList projects={sampleProjects} />)
    // Each name appears twice (desktop table + mobile card)
    expect(screen.getAllByText('Kitchen Remodel').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Bathroom Tile').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Deck Build').length).toBeGreaterThanOrEqual(1)
  })

  it('search filters projects by name', () => {
    render(<ProjectList projects={sampleProjects} />)
    const searchInput = screen.getByPlaceholderText('Search projects...')
    fireEvent.change(searchInput, { target: { value: 'kitchen' } })

    expect(screen.getAllByText('Kitchen Remodel').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText('Bathroom Tile').length).toBe(0)
    expect(screen.queryAllByText('Deck Build').length).toBe(0)
  })

  it('search filters projects by client name', () => {
    render(<ProjectList projects={sampleProjects} />)
    const searchInput = screen.getByPlaceholderText('Search projects...')
    fireEvent.change(searchInput, { target: { value: 'jane' } })

    expect(screen.getAllByText('Bathroom Tile').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryAllByText('Kitchen Remodel').length).toBe(0)
  })

  it('status filter shows only matching projects', () => {
    render(<ProjectList projects={sampleProjects} />)
    // Use getAllByRole to get all buttons, then find the filter button for "estimate_ready"
    // "estimate_ready" status only has 1 project (Deck Build) and the filter button
    const buttons = screen.getAllByRole('button')
    const estimateReadyFilterBtn = buttons.find(
      (btn) => btn.textContent === 'estimate_ready' && btn.getAttribute('data-slot') === 'button'
    )
    expect(estimateReadyFilterBtn).toBeDefined()
    fireEvent.click(estimateReadyFilterBtn!)

    // Deck Build is estimate_ready
    expect(screen.getAllByText('Deck Build').length).toBeGreaterThanOrEqual(1)
    // Others should be filtered out
    expect(screen.queryAllByText('Kitchen Remodel').length).toBe(0)
    expect(screen.queryAllByText('Bathroom Tile').length).toBe(0)
  })

  it('shows no-results empty state when search matches nothing', () => {
    render(<ProjectList projects={sampleProjects} />)
    const searchInput = screen.getByPlaceholderText('Search projects...')
    fireEvent.change(searchInput, { target: { value: 'nonexistent project xyz' } })

    expect(screen.getByText('No projects match your search')).toBeDefined()
    expect(screen.getByText('Clear filters')).toBeDefined()
  })
})
