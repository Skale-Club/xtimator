import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  dragEnd: [] as Array<(event: unknown) => void>,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => h.params,
}))

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

import { DataTable, type Column } from '@/components/ui/data-table'

interface Item {
  id: string
  name: string
  n: number
  group: string
}

const ITEMS: Item[] = [
  { id: 'a', name: 'Alpha', n: 1, group: 'x' },
  { id: 'b', name: 'Bravo', n: 2, group: 'y' },
  { id: 'c', name: 'Charlie', n: 3, group: 'x' },
  { id: 'd', name: 'Delta', n: 4, group: 'y' },
  { id: 'e', name: 'Echo', n: 5, group: 'x' },
]

const columns: Column<Item>[] = [
  { key: 'name', header: 'Name', cell: (item) => item.name, sortDesc: 'newest', sortAsc: 'oldest' },
]

const sortOptions = [
  { value: 'newest', label: 'Newest', sort: (a: Item, b: Item) => b.n - a.n },
  { value: 'oldest', label: 'Oldest', sort: (a: Item, b: Item) => a.n - b.n },
  { value: 'custom', label: 'Custom order', sort: (a: Item, b: Item) => a.n - b.n },
]

const onMove = vi.fn()

function renderTable(extra: Partial<React.ComponentProps<typeof DataTable<Item>>> = {}) {
  return render(
    <DataTable<Item>
      data={ITEMS}
      columns={columns}
      getRowKey={(item) => item.id}
      searchFn={(item, term) => item.name.toLowerCase().includes(term)}
      sortOptions={sortOptions}
      defaultSort="newest"
      renderMobileCard={(item) => <div data-testid={`card-${item.id}`}>{item.name}</div>}
      reorder={{ sortValue: 'custom', onMove, disabledHint: 'Clear the search and filters to reorder.' }}
      {...extra}
    />,
  )
}

beforeEach(() => {
  h.params = new URLSearchParams()
  h.dragEnd = []
  onMove.mockReset()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

const grips = () => document.querySelectorAll('[data-testid^="row-grip-"]')

describe('DataTable reorder', () => {
  it('has no grips and no hint when the custom sort is not selected', () => {
    renderTable()
    expect(grips()).toHaveLength(0)
    expect(screen.queryByTestId('reorder-disabled-hint')).toBeNull()
    expect(document.querySelector('[data-sortable-card]')).toBeNull()
  })

  it('has no grips when the prop is absent, even on the same sort', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable({ reorder: undefined })
    expect(grips()).toHaveLength(0)
    expect(screen.queryByTestId('reorder-disabled-hint')).toBeNull()
  })

  it('is active on the custom sort: a grip per row, sortable phone cards, no pagination', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable({ pageSize: 2 })
    expect(grips()).toHaveLength(5)
    expect(document.querySelectorAll('[data-sortable-card]')).toHaveLength(5)
    // Pagination is off: every row is shown and there is no pager.
    expect(screen.queryByLabelText('Next page')).toBeNull()
    expect(screen.queryByTestId('reorder-disabled-hint')).toBeNull()
  })

  it('keeps paginating on other sorts', () => {
    renderTable({ pageSize: 2 })
    expect(screen.getByLabelText('Next page')).toBeTruthy()
  })

  it('turns off and shows the hint while a search is set', () => {
    h.params = new URLSearchParams('sort=custom&q=al')
    renderTable()
    expect(grips()).toHaveLength(0)
    expect(document.querySelector('[data-sortable-card]')).toBeNull()
    expect(screen.getByTestId('reorder-disabled-hint').textContent).toBe('Clear the search and filters to reorder.')
  })

  it('turns off when the tab is not the base one', () => {
    h.params = new URLSearchParams('sort=custom&tab=y')
    renderTable({
      filterTabs: [
        { key: 'all', label: 'All' },
        { key: 'y', label: 'Y', match: (item) => item.group === 'y' },
      ],
    })
    expect(grips()).toHaveLength(0)
    expect(screen.getByTestId('reorder-disabled-hint')).toBeTruthy()
  })

  it('stays active on the base tab', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable({
      filterTabs: [
        { key: 'all', label: 'All' },
        { key: 'y', label: 'Y', match: (item) => item.group === 'y' },
      ],
    })
    expect(grips()).toHaveLength(5)
  })

  it('turns off while the caller has active filters', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable({ activeFilters: [{ key: 'client', label: 'Client: Acme', onRemove: () => {} }] })
    expect(grips()).toHaveLength(0)
    expect(screen.getByTestId('reorder-disabled-hint')).toBeTruthy()
  })

  it('reports the moved row with the rows now above and below it', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable()
    const onDragEnd = h.dragEnd[0]
    // Drag "a" onto "c": order becomes b, c, a, d, e.
    act(() => onDragEnd({ active: { id: 'a' }, over: { id: 'c' } }))
    expect(onMove).toHaveBeenLastCalledWith('a', 'c', 'd')
    // To the top: e dropped on a.
    act(() => onDragEnd({ active: { id: 'e' }, over: { id: 'a' } }))
    expect(onMove).toHaveBeenLastCalledWith('e', null, 'a')
    // To the bottom: a dropped on e.
    act(() => onDragEnd({ active: { id: 'a' }, over: { id: 'e' } }))
    expect(onMove).toHaveBeenLastCalledWith('a', 'e', null)
  })

  it('ignores a drop on itself or outside the list', () => {
    h.params = new URLSearchParams('sort=custom')
    renderTable()
    const onDragEnd = h.dragEnd[0]
    act(() => onDragEnd({ active: { id: 'a' }, over: { id: 'a' } }))
    act(() => onDragEnd({ active: { id: 'a' }, over: null }))
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('DataTable rememberSortKey', () => {
  const names = () =>
    Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.textContent)

  it('uses the remembered sort when the URL has none', () => {
    window.localStorage.setItem('test:sort', 'oldest')
    renderTable({ rememberSortKey: 'test:sort', reorder: undefined })
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
  })

  it('lets the URL win over the remembered sort', () => {
    window.localStorage.setItem('test:sort', 'oldest')
    h.params = new URLSearchParams('sort=newest')
    renderTable({ rememberSortKey: 'test:sort', reorder: undefined })
    expect(names()).toEqual(['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'])
  })

  it('ignores a remembered sort that no longer exists', () => {
    window.localStorage.setItem('test:sort', 'gone')
    renderTable({ rememberSortKey: 'test:sort', reorder: undefined })
    expect(names()).toEqual(['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'])
  })

  it('saves the chosen sort', () => {
    renderTable({ rememberSortKey: 'test:sort', reorder: undefined })
    fireEvent.click(screen.getByText('Name'))
    expect(window.localStorage.getItem('test:sort')).toBe('oldest')
    fireEvent.click(screen.getByText('Name'))
    expect(window.localStorage.getItem('test:sort')).toBe('newest')
  })

  it('does nothing without a key', () => {
    renderTable({ reorder: undefined })
    fireEvent.click(screen.getByText('Name'))
    expect(window.localStorage.length).toBe(0)
  })

  it('survives blocked storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderTable({ rememberSortKey: 'test:sort', reorder: undefined })
    fireEvent.click(screen.getByText('Name'))
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    spy.mockRestore()
    setSpy.mockRestore()
  })
})
