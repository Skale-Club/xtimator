import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * On mobile the credits and the theme toggle live inside the account menu
 * (the header has no room). The Credits row always shows a number: the usage
 * percentage with a bar, or the balance when nothing was granted this cycle.
 */

const theme = vi.hoisted(() => ({ value: 'dark', setTheme: vi.fn() }))

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
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: theme.value, setTheme: theme.setTheme }),
}))
vi.mock('@/lib/actions/theme', () => ({
  saveThemePreference: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/lib/auth/sign-out', () => ({ signOut: vi.fn() }))
vi.mock('@/components/tour/tour-provider', () => ({
  useTourContext: () => ({ setShowWelcome: vi.fn(), setIsReviewMode: vi.fn() }),
}))
vi.mock('@/components/tour/use-tour', () => ({
  useTour: () => ({ resetAllTourState: vi.fn(), startTour: vi.fn() }),
}))
vi.mock('@/components/pwa/install-app-menu-item', () => ({
  InstallAppMenuItem: () => null,
  InstallAppDialog: () => null,
}))
// Render the account slot inside an already-open menu so the rows are visible.
vi.mock('@/components/app-shell/company-selector', async () => {
  const { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } = await import(
    '@/components/ui/dropdown-menu'
  )
  return {
    CompanySelector: ({ accountMenuSlot }: { accountMenuSlot?: ReactNode }) => (
      <DropdownMenu open>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent>{accountMenuSlot}</DropdownMenuContent>
      </DropdownMenu>
    ),
  }
})

const { MobileAccountMenu } = await import('@/components/app-shell/mobile-account-menu')

function mount(credits?: { percentUsed: number | null; balance: number }) {
  return render(
    <MobileAccountMenu
      navUser={{ email: 'a@b.co', avatarUrl: null }}
      memberships={[]}
      activeCompanyId=""
      userName="Owner"
      credits={credits}
    />,
  )
}

beforeEach(() => {
  theme.value = 'dark'
  theme.setTheme.mockClear()
})

describe('MobileAccountMenu credits row', () => {
  it('shows the usage percentage and a bar, linking to billing', () => {
    mount({ percentUsed: 42, balance: 5800 })
    const row = screen.getByTestId('credit-menu-row')
    expect(row.getAttribute('href')).toBe('/settings/billing')
    expect(row.textContent).toContain('Credits')
    expect(row.textContent).toContain('5,800 · 42% used')
    expect(row.querySelector('[data-slot="progress"]')).toBeTruthy()
  })

  it('falls back to the balance with no bar when percentUsed is null', () => {
    mount({ percentUsed: null, balance: 7500 })
    const row = screen.getByTestId('credit-menu-row')
    expect(row.textContent).toContain('7,500 credits')
    expect(row.querySelector('[data-slot="progress"]')).toBeNull()
  })

  it('renders no credits row without credit data', () => {
    mount()
    expect(screen.queryByTestId('credit-menu-row')).toBeNull()
  })
})

describe('MobileAccountMenu theme picker', () => {
  it('offers light, dark and system, with the current theme checked', () => {
    mount()
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'System'])
    expect(within(group).getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
    expect(within(group).getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('false')
  })

  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['System', 'system'],
  ])('tapping %s sets the %s theme and keeps the menu open', (name, value) => {
    mount()
    fireEvent.click(screen.getByRole('radio', { name }))
    expect(theme.setTheme).toHaveBeenCalledWith(value)
    expect(screen.getByTestId('theme-menu-row')).toBeTruthy()
  })
})
