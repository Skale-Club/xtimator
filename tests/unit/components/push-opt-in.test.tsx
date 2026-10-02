import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * 260928: "notify me on this device" in the generation checklist. The button
 * must call enable() straight from the click (Safari only shows the
 * permission prompt inside the user's gesture), and iPhone users in a Safari
 * tab get the Home Screen hint instead of a button that cannot work.
 */

vi.mock('@/lib/i18n/use-translation', () => ({
  useAppTranslation: () => ({ t: (k: string) => k, language: 'pt' }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const enable = vi.fn()
let status = 'available'
const usePushOptIn = vi.fn()
vi.mock('@/hooks/use-push-opt-in', () => ({
  usePushOptIn: (lang: string) => {
    usePushOptIn(lang)
    return { status, busy: false, enable }
  },
}))

import { PushOptIn } from '@/components/capture/push-opt-in'

beforeEach(() => {
  vi.clearAllMocks()
  enable.mockResolvedValue({ ok: true })
})

describe('PushOptIn', () => {
  it('offers the opt-in and subscribes in the app language on tap', () => {
    status = 'available'
    render(<PushOptIn />)
    fireEvent.click(screen.getByTestId('push-opt-in-button'))
    expect(enable).toHaveBeenCalledTimes(1)
    expect(usePushOptIn).toHaveBeenCalledWith('pt')
  })

  it('confirms when this device is already enabled', () => {
    status = 'enabled'
    render(<PushOptIn />)
    expect(screen.getByTestId('push-opt-in-enabled')).toBeTruthy()
    expect(screen.queryByTestId('push-opt-in-button')).toBeNull()
  })

  it('tells iPhone users in Safari to add the app to the Home Screen', () => {
    status = 'ios_install'
    render(<PushOptIn />)
    expect(screen.getByTestId('push-opt-in-ios').textContent).toContain('Home Screen')
  })

  it('renders nothing when push cannot be offered', () => {
    for (const s of ['loading', 'hidden']) {
      status = s
      const { container, unmount } = render(<PushOptIn />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
})
