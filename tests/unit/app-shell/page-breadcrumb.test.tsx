import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * The mobile header always shows the app name; page context (Projects / name,
 * Clients / name) renders in-page above the title, mobile only.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/app-shell/language-toggle', () => ({ LanguageToggle: () => null }))
vi.mock('@/components/app-shell/mobile-account-menu', () => ({ MobileAccountMenu: () => null }))
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: () => null }))

const { PageBreadcrumb } = await import('@/components/app-shell/page-breadcrumb')
const { MobileHeader } = await import('@/components/app-shell/mobile-header')

describe('PageBreadcrumb', () => {
  it('links the parent and marks the last item as the current page', () => {
    render(
      <PageBreadcrumb
        items={[
          { label: 'Projects', href: '/projects' },
          { label: 'Biweekly Home Cleaning' },
        ]}
      />,
    )
    const nav = screen.getByTestId('page-breadcrumb')
    expect(nav.className).toContain('md:hidden')
    expect(screen.getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe('/projects')
    const current = screen.getByText('Biweekly Home Cleaning')
    expect(current.getAttribute('aria-current')).toBe('page')
    expect(current.closest('a')).toBeNull()
  })

  it('renders nothing without items', () => {
    const { container } = render(<PageBreadcrumb items={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('MobileHeader', () => {
  it('always shows the app name and no page breadcrumb', () => {
    render(<MobileHeader branding={{ appName: 'Xtimator', logoUrl: null }} />)
    expect(screen.getByTestId('mobile-header-app-name').textContent).toBe('Xtimator')
    expect(screen.getByTestId('mobile-header').querySelector('nav')).toBeNull()
    expect(screen.getByTestId('mobile-header').querySelector('h1')).toBeNull()
  })
})
