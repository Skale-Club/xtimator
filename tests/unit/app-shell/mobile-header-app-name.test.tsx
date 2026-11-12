import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * The mobile header always shows the app name and never a page breadcrumb or
 * title. Mobile shows no page trail at all (the bottom bar leads back).
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

const { MobileHeader } = await import('@/components/app-shell/mobile-header')

describe('MobileHeader', () => {
  it('always shows the app name and no page breadcrumb', () => {
    render(<MobileHeader branding={{ appName: 'Xtimator', logoUrl: null }} />)
    expect(screen.getByTestId('mobile-header-app-name').textContent).toBe('Xtimator')
    expect(screen.getByTestId('mobile-header').querySelector('nav')).toBeNull()
    expect(screen.getByTestId('mobile-header').querySelector('h1')).toBeNull()
  })
})
