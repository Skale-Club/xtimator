import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * The credit chip must render on both the desktop topbar and the mobile
 * header whenever credit data is present: a bar when percentUsed is a number,
 * the balance otherwise. Credits are the only unit shown ("estimates" never).
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/app-shell/breadcrumb-context', () => ({
  useCurrentBreadcrumbs: () => [],
}))
vi.mock('@/components/app-shell/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/app-shell/language-toggle', () => ({ LanguageToggle: () => null }))
vi.mock('@/components/app-shell/mobile-account-menu', () => ({ MobileAccountMenu: () => null }))
vi.mock('@/components/notifications/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/ui/app-icon', () => ({ AppIcon: () => null }))
vi.mock('@/components/tour/contextual-tooltip', () => ({
  ContextualTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TOOLTIP_KEYS: { languageToggle: 'languageToggle' },
}))

const { Topbar } = await import('@/components/app-shell/topbar')
const { MobileHeader } = await import('@/components/app-shell/mobile-header')

const surfaces = [
  ['Topbar', (c: { percentUsed: number | null; balance: number }) => (
    <Topbar company={{ id: 'c1' }} userId="u1" credits={c} />
  )],
  ['MobileHeader', (c: { percentUsed: number | null; balance: number }) => (
    <MobileHeader credits={c} />
  )],
] as const

describe.each(surfaces)('%s credit chip', (_name, mount) => {
  it('renders the chip with a bar when percentUsed is a number', () => {
    const { container } = render(mount({ percentUsed: 42, balance: 5800 }))
    expect(container.querySelector('a[href="/settings/billing"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="progress"]')).toBeTruthy()
    expect(container.textContent).toContain('42%')
  })

  it('renders the balance fallback when percentUsed is null', () => {
    const { container } = render(mount({ percentUsed: null, balance: 7500 }))
    const chip = container.querySelector('a[href="/settings/billing"]')
    expect(chip).toBeTruthy()
    expect(chip?.textContent).toContain('7,500')
    expect(container.querySelector('[data-slot="progress"]')).toBeNull()
  })

  it('never mentions estimates inside the chip', () => {
    for (const c of [
      { percentUsed: 42, balance: 5800 },
      { percentUsed: null, balance: 7500 },
    ]) {
      const { container, unmount } = render(mount(c))
      const chip = container.querySelector('a[href="/settings/billing"]')
      expect(chip?.textContent ?? '').not.toMatch(/estimate/i)
      expect(chip?.getAttribute('aria-label') ?? '').not.toMatch(/estimate/i)
      unmount()
    }
  })
})

describe('no credit data', () => {
  it('renders no chip on either surface', () => {
    const a = render(<Topbar company={{ id: 'c1' }} userId="u1" />)
    expect(a.container.querySelector('a[href="/settings/billing"]')).toBeNull()
    a.unmount()
    const b = render(<MobileHeader />)
    expect(b.container.querySelector('a[href="/settings/billing"]')).toBeNull()
  })
})
