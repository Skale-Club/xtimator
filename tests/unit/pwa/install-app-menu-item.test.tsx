import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InstallAppMenuItem, InstallAppDialog } from '@/components/pwa/install-app-menu-item'
import { detectInstallPlatform } from '@/components/pwa/use-install-app'

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
  it('opens the instructions on iOS (no install API)', () => {
    setEnv(IPHONE_UA)
    const onShow = renderMenu()
    fireEvent.click(screen.getByText('Install app'))
    expect(onShow).toHaveBeenCalledOnce()
  })

  it('falls back to instructions on Android when no native prompt was captured', () => {
    setEnv(ANDROID_UA)
    const onShow = renderMenu()
    fireEvent.click(screen.getByText('Install app'))
    expect(onShow).toHaveBeenCalledOnce()
  })

  it('is hidden when already running as an installed app', () => {
    setEnv(IPHONE_UA, true)
    renderMenu()
    expect(screen.queryByText('Install app')).toBeNull()
  })

  it('is hidden on desktop without a native prompt', () => {
    renderMenu()
    expect(screen.queryByText('Install app')).toBeNull()
  })

  it('uses the native prompt once beforeinstallprompt has fired', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    })
    act(() => {
      window.dispatchEvent(event)
    })
    const onShow = renderMenu()
    await act(async () => {
      fireEvent.click(screen.getByText('Install app'))
    })
    expect(prompt).toHaveBeenCalledOnce()
    expect(onShow).not.toHaveBeenCalled()
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
