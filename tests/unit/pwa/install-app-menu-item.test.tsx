import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InstallAppMenuItem, InstallAppDialog } from '@/components/pwa/install-app-menu-item'
import { detectInstallPlatform } from '@/components/pwa/use-install-app'
import { googlePlayUrl } from '@/lib/store-links'

vi.mock('@/lib/i18n/use-translation', () => ({
  useTranslation: () => ({ t: (s: string) => s, language: 'en' }),
}))

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'

function setEnv(ua: string, standalone = false) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)' ? standalone : false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  })
}

function renderMenu(onShowInstructions = vi.fn()) {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <InstallAppMenuItem onShowInstructions={onShowInstructions} />
      </DropdownMenuContent>
    </DropdownMenu>,
  )
  return onShowInstructions
}

beforeEach(() => setEnv(DESKTOP_UA))

describe('detectInstallPlatform', () => {
  it('detects iPhone, iPadOS (Mac UA + touch), Android and desktop', () => {
    expect(detectInstallPlatform(IPHONE_UA)).toBe('ios')
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
    expect(detectInstallPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop')
    expect(detectInstallPlatform(ANDROID_UA)).toBe('android')
    expect(detectInstallPlatform(DESKTOP_UA)).toBe('desktop')
  })
})

describe('InstallAppMenuItem', () => {
  it('opens the Add to Home Screen steps on iOS (no app store app, no install API)', () => {
    setEnv(IPHONE_UA)
    const onShow = renderMenu()
    fireEvent.click(screen.getByText('Install app'))
    expect(onShow).toHaveBeenCalledOnce()
  })

  it('links to the Google Play app on Android instead of a browser install', () => {
    setEnv(ANDROID_UA)
    const onShow = renderMenu()
    const link = screen.getByText('Install app').closest('a')!
    expect(link.getAttribute('href')).toBe(googlePlayUrl('account_menu'))
    expect(link.getAttribute('href')).toContain('id=com.xtimator.app')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(onShow).not.toHaveBeenCalled()
  })

  it('is hidden when already running as an installed app', () => {
    setEnv(IPHONE_UA, true)
    renderMenu()
    expect(screen.queryByText('Install app')).toBeNull()
  })

  it('is hidden inside the Google Play app (TWA cookie), even when display-mode is not standalone', () => {
    setEnv(ANDROID_UA)
    document.cookie = 'xt_twa=1; path=/'
    try {
      renderMenu()
      expect(screen.queryByText('Install app')).toBeNull()
    } finally {
      document.cookie = 'xt_twa=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    }
  })

  it('is hidden on desktop', () => {
    renderMenu()
    expect(screen.queryByText('Install app')).toBeNull()
  })

  it('stays hidden on desktop even after Chrome offers its native install prompt', () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    act(() => {
      window.dispatchEvent(event)
    })
    renderMenu()
    expect(screen.queryByText('Install app')).toBeNull()
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe('InstallAppDialog', () => {
  it('shows Add to Home Screen steps on iOS', () => {
    setEnv(IPHONE_UA)
    render(<InstallAppDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/Add to Home Screen/)).not.toBeNull()
  })

  it('shows browser-menu steps on Android', () => {
    setEnv(ANDROID_UA)
    render(<InstallAppDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/Open the browser menu/)).not.toBeNull()
  })
})
