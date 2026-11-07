import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const route = vi.hoisted(() => ({ pathname: '/price-book', pendingHref: null as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))
vi.mock('next/link', async () => {
  const { createContext, useContext } = await import('react')
  const status = createContext({ pending: false })
  return {
    default: ({ href, children, prefetch, ...props }: React.ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
      <status.Provider value={{ pending: route.pendingHref === href }}>
        <a href={href} data-prefetch={prefetch} {...props}>{children}</a>
      </status.Provider>
    ),
    useLinkStatus: () => useContext(status),
  }
})

import { BottomNav } from '@/components/app-shell/bottom-nav'

afterEach(() => { cleanup(); route.pathname = '/price-book'; route.pendingHref = null })

describe('navigation feedback', () => {
  it('renders mobile navigation in the initial server HTML', () => {
    const html = renderToString(<BottomNav />)
    expect(html).toContain('href="/clients"')
    expect(html).toContain('href="/projects"')
  })

  it('shows loading only on the destination and clears it when navigation finishes', () => {
    route.pendingHref = '/clients'
    const { rerender } = render(<BottomNav />)
    const clients = screen.getByRole('link', { name: 'Clients' })
    expect(within(clients).getByRole('status', { name: 'Loading...' })).toBeTruthy()
    expect(within(screen.getByRole('link', { name: 'Projects' })).queryByRole('status')).toBeNull()
    expect(screen.getByRole('link', { name: 'Price Book' }).getAttribute('aria-current')).toBe('page')

    route.pendingHref = null
    route.pathname = '/clients'
    rerender(<BottomNav />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(clients.getAttribute('aria-current')).toBe('page')
  })

  it('clears loading after a cancelled navigation without changing the current page', () => {
    route.pendingHref = '/clients'
    const { rerender } = render(<BottomNav />)
    expect(screen.getByRole('status')).toBeTruthy()

    route.pendingHref = null
    rerender(<BottomNav />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('link', { name: 'Price Book' }).getAttribute('aria-current')).toBe('page')
  })
})
