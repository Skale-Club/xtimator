import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  params: new URLSearchParams('sort=custom'),
  dragEnd: [] as Array<(event: unknown) => void>,
  moveProject: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => h.params,
}))
vi.mock('@/lib/actions/project', () => ({ linkProjectToClient: vi.fn() }))
vi.mock('@/lib/actions/project-order', () => ({ moveProject: (...args: unknown[]) => h.moveProject(...args) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => h.toastError(...args) } }))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      if (props.onDragEnd) h.dragEnd.push(props.onDragEnd as (event: unknown) => void)
      return <actual.DndContext {...props} />
    },
  }
})

import { ProjectTable, type ProjectTableRow } from '@/components/projects/project-table'

function row(id: string, name: string, sort_order: number | null, created = '2026-04-01T00:00:00Z'): ProjectTableRow {
  return { id, name, status: 'draft', total: 100, created_at: created, sort_order }
}

const PROJECTS: ProjectTableRow[] = [
  row('p1', 'Alpha', 3),
  row('p2', 'Bravo', 1),
  row('p3', 'Charlie', 2),
  row('p4', 'Delta', null, '2026-05-01T00:00:00Z'),
  row('p5', 'Echo', null, '2026-06-01T00:00:00Z'),
]

const names = () =>
  Array.from(document.querySelectorAll('tbody tr[data-sortable-row], tbody tr')).map(
    (tr) => tr.querySelector('span.font-medium')?.textContent,
  )

function renderTable(props: Partial<React.ComponentProps<typeof ProjectTable<ProjectTableRow>>> = {}) {
  return render(
    <ProjectTable<ProjectTableRow> projects={PROJECTS} renderActions={() => null} customOrder {...props} />,
  )
}

beforeEach(() => {
  h.params = new URLSearchParams('sort=custom')
  h.dragEnd = []
  h.moveProject.mockReset()
  h.toastError.mockReset()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

describe('ProjectTable custom order', () => {
  it('orders by sort_order ascending, unpositioned last, then newest first', () => {
    renderTable()
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Echo', 'Delta'])
  })

  it('does not offer the option or grips without customOrder', () => {
    h.params = new URLSearchParams()
    renderTable({ customOrder: false })
    expect(document.querySelectorAll('[data-testid^="row-grip-"]')).toHaveLength(0)
    // Newest first (default sort), not the custom order.
    expect(names()[0]).toBe('Echo')
  })

  it('defaults to Newest when nothing is chosen or remembered', () => {
    h.params = new URLSearchParams()
    renderTable()
    expect(names()).toEqual(['Echo', 'Delta', 'Alpha', 'Bravo', 'Charlie'])
  })

  it('remembers the sort under projects:list:sort', () => {
    window.localStorage.setItem('projects:list:sort', 'custom')
    h.params = new URLSearchParams()
    renderTable()
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Echo', 'Delta'])
  })

  it('moves the row at once, calls moveProject with the neighbours and keeps the server value', async () => {
    let resolve!: (value: unknown) => void
    h.moveProject.mockReturnValue(new Promise((r) => { resolve = r }))
    renderTable()
    // Drag Alpha (3) onto Bravo (1): Alpha goes to the top.
    act(() => h.dragEnd[0]({ active: { id: 'p1' }, over: { id: 'p2' } }))
    expect(h.moveProject).toHaveBeenCalledWith('p1', { aboveId: null, belowId: 'p2' })
    // Optimistic: 1 - 1 = 0, ahead of Bravo, before the server answered.
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Echo', 'Delta'])
    await act(async () => resolve({ data: { sort_order: 0 } }))
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Echo', 'Delta'])
    expect(h.toastError).not.toHaveBeenCalled()
  })

  it('moves between two rows using their midpoint', () => {
    h.moveProject.mockReturnValue(new Promise(() => {}))
    renderTable()
    // Drag Alpha (3) onto Charlie (2): new order Bravo, Alpha, Charlie.
    act(() => h.dragEnd[0]({ active: { id: 'p1' }, over: { id: 'p3' } }))
    expect(h.moveProject).toHaveBeenCalledWith('p1', { aboveId: 'p2', belowId: 'p3' })
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Echo', 'Delta'])
  })

  it('reverts and shows a toast when the server refuses', async () => {
    h.moveProject.mockResolvedValue({ error: 'Failed to move the project.' })
    renderTable()
    await act(async () => h.dragEnd[0]({ active: { id: 'p1' }, over: { id: 'p2' } }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Could not move the project.'))
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Echo', 'Delta'])
  })

  it('reverts when the call throws', async () => {
    h.moveProject.mockRejectedValue(new Error('network'))
    renderTable()
    await act(async () => h.dragEnd[0]({ active: { id: 'p1' }, over: { id: 'p2' } }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Could not move the project.'))
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Echo', 'Delta'])
  })

  it('moves a row that has no position yet without an optimistic guess, and shows the server answer', async () => {
    let resolve!: (value: unknown) => void
    h.moveProject.mockReturnValue(new Promise((r) => { resolve = r }))
    renderTable()
    // Order is Bravo, Charlie, Alpha, Echo, Delta. Drag Bravo onto Echo:
    // Charlie, Alpha, Echo, Bravo, Delta; Echo has no position so no guess is possible.
    act(() => h.dragEnd[0]({ active: { id: 'p2' }, over: { id: 'p5' } }))
    expect(h.moveProject).toHaveBeenCalledWith('p2', { aboveId: 'p5', belowId: 'p4' })
    expect(names()).toEqual(['Bravo', 'Charlie', 'Alpha', 'Echo', 'Delta'])
    await act(async () => resolve({ data: { sort_order: 3.5 } }))
    // The server renumbered; the moved row now sits at 3.5, after Alpha (3).
    expect(names()).toEqual(['Charlie', 'Alpha', 'Bravo', 'Echo', 'Delta'])
  })

  it('drops the optimistic value once the revalidated list carries a new sort_order', async () => {
    h.moveProject.mockResolvedValue({ data: { sort_order: 0 } })
    const { rerender } = renderTable()
    await act(async () => h.dragEnd[0]({ active: { id: 'p1' }, over: { id: 'p2' } }))
    expect(names()[0]).toBe('Alpha')
    // The server list arrives: Alpha is now 0 and everything else got renumbered.
    rerender(
      <ProjectTable<ProjectTableRow>
        projects={[row('p1', 'Alpha', 1), row('p2', 'Bravo', 2), row('p3', 'Charlie', 3), row('p4', 'Delta', 5), row('p5', 'Echo', 4)]}
        renderActions={() => null}
        customOrder
      />,
    )
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Echo', 'Delta'])
  })
})
