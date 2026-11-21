/**
 * Stage 3: on phones (< 640px) real panels open as the app's bottom sheet
 * (data-bottom-sheet); the chat assistant becomes a pinned bottom drawer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { phoneChatPanel } from '@/lib/chat/panel-geometry'

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/active-company', () => ({ switchActiveCompany: vi.fn() }))
vi.mock('@/components/app-shell/admin-create-company-modal', () => ({ AdminCreateCompanyModal: () => null }))
vi.mock('@/lib/actions/tour', () => ({ logTourEvent: vi.fn() }))
vi.mock('@/components/tour/tour-provider', () => ({
  useTourContext: () => ({
    showWelcome: true, setShowWelcome: vi.fn(), setShowSpotlight: vi.fn(),
    isReviewModeRef: { current: false }, setIsReviewMode: vi.fn(),
  }),
}))
vi.mock('@/components/tour/use-tour', () => ({ useTour: () => ({ completeTour: vi.fn(), startTour: vi.fn() }) }))
vi.mock('@/components/auth/phone-sign-in', () => ({ PhoneSignIn: () => <div data-testid="phone-sign-in" /> }))
vi.mock('@/lib/actions/chat', () => ({
  listChatConversations: vi.fn(async () => []), getChatThread: vi.fn(), deleteChatConversation: vi.fn(),
}))
vi.mock('@/components/chat/chat-thread', () => ({ ChatThread: () => <div data-testid="chat-thread" /> }))

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 639px)' ? phone : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  })
}

const originalMatchMedia = window.matchMedia
beforeEach(() => {
  setPhone(true)
  Element.prototype.scrollIntoView = vi.fn() // cmdk scrolls the active item into view
})
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: originalMatchMedia })
})

describe('phone bottom sheets', () => {
  it('welcome modal', async () => {
    const { WelcomeModal } = await import('@/components/tour/welcome-modal')
    render(<WelcomeModal />)
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('install instructions', async () => {
    const { InstallAppDialog } = await import('@/components/pwa/install-app-menu-item')
    render(<InstallAppDialog open onOpenChange={() => {}} />)
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
  })

  it('sign-in dialog', async () => {
    const { OwnedAuthDialog } = await import('@/components/auth/owned-auth-dialog')
    render(<OwnedAuthDialog branding={{ appName: 'Xtimator', logoUrl: null }} open onClose={() => {}} />)
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
    expect(screen.getByTestId('phone-sign-in')).toBeTruthy()
  })

  it('account menu opens as a sheet with the account rows', async () => {
    const { CompanySelector } = await import('@/components/app-shell/company-selector')
    render(
      <CompanySelector
        trigger={<button>avatar</button>}
        companies={[{ id: 'a', name: 'Acme', logo_url: null }]}
        activeCompanyId="a"
        phoneSlot={() => <a href="/settings">Settings row</a>}
      />,
    )
    fireEvent.click(screen.getByText('avatar'))
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Settings row')).toBeTruthy()
  })

  it('account menu keeps the dropdown on desktop', async () => {
    setPhone(false)
    const { CompanySelector } = await import('@/components/app-shell/company-selector')
    render(
      <CompanySelector
        trigger={<button>avatar</button>}
        companies={[{ id: 'a', name: 'Acme', logo_url: null }]}
        activeCompanyId="a"
        phoneSlot={() => <a href="/settings">Settings row</a>}
      />,
    )
    fireEvent.pointerDown(screen.getByText('avatar'), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByText('avatar'))
    expect(document.querySelector('[data-bottom-sheet]')).toBeNull()
  })

  it('services picker', async () => {
    const { IndustrySelector } = await import('@/components/onboarding/industry-selector')
    render(<IndustrySelector value={[]} customValues={[]} onChange={() => {}} onCustomChange={() => {}} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
  })

  it('login phone dialog', async () => {
    const { OwnedAccountSecurity } = await import('@/components/auth/owned-account-security')
    render(<OwnedAccountSecurity loginPhone={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add phone' }))
    expect(document.querySelector('[data-bottom-sheet]')).toBeTruthy()
  })
})

describe('chat panel on phones', () => {
  it('pins to the bottom, full width, about 85% tall', () => {
    const rect = phoneChatPanel({ x: 0, y: 0, width: 390, height: 800 })
    expect(rect).toEqual({ x: 0, y: 120, width: 390, height: 680 })
    const panned = phoneChatPanel({ x: 0, y: 100, width: 390, height: 400 })
    expect(panned.y + panned.height).toBe(500)
  })

  it('renders a grab bar and no resize handles', async () => {
    const { ChatBubble } = await import('@/components/chat/chat-bubble')
    render(<ChatBubble chatEnabled />)
    fireEvent.click(screen.getByLabelText('Open chat assistant'))
    const panel = document.querySelector('[data-chat-panel]') as HTMLElement
    expect(panel.style.width).toBe(`${window.innerWidth}px`)
    expect(screen.getByTestId('chat-grabber')).toBeTruthy()
    expect(screen.queryByLabelText('Resize chat height')).toBeNull()
    expect(screen.queryByLabelText('Resize chat window')).toBeNull()
    expect(screen.queryByLabelText('Move chat window')).toBeNull()
  })
})
