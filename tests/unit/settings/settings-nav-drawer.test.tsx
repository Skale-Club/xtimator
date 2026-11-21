import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Redesign 2026-11-20: on phones the settings sections open from a button that
 * names the current section, as a bottom sheet with the desktop's grouped list
 * (no sideways-scrolling pills).
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (k: string) => k, language: 'en' }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/settings/billing' }))

import { SettingsNavStrip } from '@/components/settings/settings-nav'

describe('SettingsNavStrip (phone bottom sheet)', () => {
  it('names the current section on the trigger and shows no links until opened', () => {
    render(<SettingsNavStrip />)
    expect(screen.getByTestId('settings-nav-trigger').textContent).toContain('Plan and billing')
    expect(screen.queryByRole('link', { name: 'Company' })).toBeNull()
  })

  it('opens the grouped nav and closes it when a section is picked', () => {
    render(<SettingsNavStrip />)
    fireEvent.click(screen.getByTestId('settings-nav-trigger'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    for (const group of ['Business', 'Estimates', 'You', 'Connections']) {
      expect(screen.getByText(group)).toBeTruthy()
    }
    const current = screen.getByRole('link', { name: 'Plan and billing' })
    expect(current.getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('link', { name: 'Team' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hides demo-hidden sections in the demo', () => {
    render(<SettingsNavStrip isDemo />)
    fireEvent.click(screen.getByTestId('settings-nav-trigger'))
    expect(screen.queryByRole('link', { name: 'Plan and billing' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Company' })).toBeTruthy()
  })
})
