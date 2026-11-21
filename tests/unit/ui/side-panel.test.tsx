import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Folder } from 'lucide-react'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import {
  SidePanelColumn,
  SidePanelList,
  SidePanelMobilePicker,
  sidePanelMonogram,
  type SidePanelGroup,
} from '@/components/ui/side-panel'

const groups: SidePanelGroup[] = [
  {
    key: 'g',
    items: [
      { key: 'all', label: 'All categories', icon: Folder, count: 9 },
      { key: 'rc', label: 'Remodeling & Construction', count: 4 },
      { key: 'hc', label: 'House Cleaning', count: 3 },
      { key: 'plumbing', label: 'Plumbing', count: 2 },
    ],
  },
]

function many(n: number): SidePanelGroup[] {
  return [{ key: 'g', items: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `Trade ${i}`, count: i })) }]
}

beforeEach(() => {
  localStorage.clear()
})

describe('sidePanelMonogram', () => {
  it('takes the first letters of the first two words, skipping connectors', () => {
    expect(sidePanelMonogram('Remodeling & Construction')).toBe('RC')
    expect(sidePanelMonogram('House Cleaning')).toBe('HC')
    expect(sidePanelMonogram('Salt and Pepper')).toBe('SP')
    expect(sidePanelMonogram('Plumbing')).toBe('PL')
  })
})

describe('SidePanelList', () => {
  it('renders rows with counts, a title holding the full label, and the active state', () => {
    render(<SidePanelList groups={groups} activeKey="rc" onSelect={() => {}} getItemTestId={(k) => `row-${k}`} />)
    const active = screen.getByTestId('row-rc')
    expect(active.getAttribute('aria-current')).toBe('true')
    expect(active.className).toContain('--glass-bg-light')
    expect(active.textContent).toContain('4')
    expect(screen.getByTestId('row-hc').getAttribute('aria-current')).toBeNull()
    expect(screen.getByTitle('Remodeling & Construction')).toBeDefined()
  })

  it('calls onSelect with the item key', () => {
    const onSelect = vi.fn()
    render(<SidePanelList groups={groups} activeKey="all" onSelect={onSelect} getItemTestId={(k) => `row-${k}`} />)
    fireEvent.click(screen.getByTestId('row-plumbing'))
    expect(onSelect).toHaveBeenCalledWith('plumbing')
  })

  it('renders group headings', () => {
    render(<SidePanelList groups={[{ key: 'a', label: 'Business', items: [{ key: 'x', label: 'Company' }] }]} />)
    expect(screen.getByText('Business')).toBeDefined()
  })

  it('link mode renders anchors with aria-current="page" on the active one', () => {
    render(
      <SidePanelList
        activeKey="team"
        groups={[
          {
            key: 'g',
            items: [
              { key: 'company', label: 'Company', href: '/settings/company' },
              { key: 'team', label: 'Team', href: '/settings/team' },
            ],
          },
        ]}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/settings/company', '/settings/team'])
    expect(links[1].getAttribute('aria-current')).toBe('page')
    expect(links[0].getAttribute('aria-current')).toBeNull()
  })

  it('shows the filter only from the threshold up, hides pinned rows while filtering, and clears after a pick', () => {
    const { rerender } = render(<SidePanelList groups={many(6)} />)
    expect(screen.queryByLabelText('Filter')).toBeNull()

    const onSelect = vi.fn()
    const all: SidePanelGroup[] = [
      { key: 'g', items: [{ key: 'all', label: 'All', count: 1 }, ...many(7)[0].items] },
    ]
    rerender(<SidePanelList groups={all} pinnedKeys={['all']} onSelect={onSelect} getItemTestId={(k) => `row-${k}`} />)
    const input = screen.getByLabelText('Filter') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'trade 3' } })
    expect(screen.queryByTestId('row-all')).toBeNull()
    expect(screen.getByTestId('row-k3')).toBeDefined()
    expect(screen.queryByTestId('row-k4')).toBeNull()

    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeDefined()

    fireEvent.change(input, { target: { value: 'trade 3' } })
    fireEvent.click(screen.getByTestId('row-k3'))
    expect(onSelect).toHaveBeenCalledWith('k3')
    expect(input.value).toBe('')
    expect(screen.getByTestId('row-all')).toBeDefined()
  })

  it('reorder: fixed keys get no drag handle, the others do, and filtering turns reordering off', () => {
    const list: SidePanelGroup[] = [
      { key: 'g', items: [{ key: 'all', label: 'All' }, ...many(7)[0].items, { key: 'uncategorized', label: 'Uncategorized' }] },
    ]
    render(<SidePanelList groups={list} reorder={{ onReorder: vi.fn(), fixedKeys: ['all', 'uncategorized'] }} />)
    expect(screen.queryByTestId('side-panel-grip-all')).toBeNull()
    expect(screen.queryByTestId('side-panel-grip-uncategorized')).toBeNull()
    expect(screen.getByTestId('side-panel-grip-k0')).toBeDefined()
    expect(screen.getAllByTestId(/^side-panel-grip-/)).toHaveLength(7)

    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: 'trade' } })
    expect(screen.queryAllByTestId(/^side-panel-grip-/)).toHaveLength(0)
  })

  it('renders the footer under the list', () => {
    render(<SidePanelList groups={groups} footer={<button>New thing</button>} />)
    expect(screen.getByText('New thing')).toBeDefined()
  })
})

describe('SidePanelColumn', () => {
  it('collapses to a rail with icons or monograms, persists, and keeps selecting', () => {
    const onSelect = vi.fn()
    const { unmount } = render(
      <SidePanelColumn id="t1" title="Categories" groups={groups} activeKey="rc" onSelect={onSelect} getItemTestId={(k) => `row-${k}`} />,
    )
    expect(screen.getByText('Remodeling & Construction')).toBeDefined()

    fireEvent.click(screen.getByTestId('side-panel-toggle'))
    expect(localStorage.getItem('side-panel:t1:collapsed')).toBe('1')
    const rail = screen.getByTestId('side-panel-rail')
    expect(rail.textContent).toContain('RC')
    expect(rail.textContent).toContain('HC')
    expect(rail.textContent).toContain('PL')
    // The "All" item has an icon, so no monogram for it.
    expect(within(rail).getByTestId('row-all').textContent).toBe('')
    expect(within(rail).getByTestId('row-rc').getAttribute('aria-current')).toBe('true')

    fireEvent.click(within(rail).getByTestId('row-hc'))
    expect(onSelect).toHaveBeenCalledWith('hc')
    unmount()

    // A fresh mount reads the saved state.
    render(<SidePanelColumn id="t1" title="Categories" groups={groups} activeKey="rc" />)
    expect(screen.getByTestId('side-panel-rail')).toBeDefined()
    fireEvent.click(screen.getByTestId('side-panel-toggle'))
    expect(localStorage.getItem('side-panel:t1:collapsed')).toBe('0')
    expect(screen.queryByTestId('side-panel-rail')).toBeNull()
  })
})

describe('SidePanelMobilePicker', () => {
  it('shows the active label, opens the list in a sheet, closes on select, and footer actions close it', () => {
    const onSelect = vi.fn()
    const onNew = vi.fn()
    render(
      <SidePanelMobilePicker
        title="Categories"
        groups={groups}
        activeKey="hc"
        onSelect={onSelect}
        getItemTestId={(k) => `row-${k}`}
        testId="picker"
        footer={(close) => (
          <button onClick={() => { close(); onNew() }}>Add one</button>
        )}
      />,
    )
    const trigger = screen.getByTestId('picker')
    expect(trigger.getAttribute('aria-label')).toBe('Categories: House Cleaning')

    fireEvent.click(trigger)
    fireEvent.click(screen.getByTestId('row-plumbing'))
    expect(onSelect).toHaveBeenCalledWith('plumbing')
    expect(screen.queryByTestId('row-plumbing')).toBeNull()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('Add one'))
    expect(onNew).toHaveBeenCalled()
    expect(screen.queryByText('Add one')).toBeNull()
  })
})
