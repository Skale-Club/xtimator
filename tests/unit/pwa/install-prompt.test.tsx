import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallPrompt } from '@/components/pwa/install-prompt'

// Mock window.matchMedia
function mockMatchMedia(standalone: boolean) {
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

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(false)
  // Default userAgent: non-iOS
  Object.defineProperty(navigator, 'userAgent', {
    writable: true,
    value: 'Mozilla/5.0 (Linux; Android 10) Chrome/120',
  })
})

describe('InstallPrompt', () => {
  it('renders null when hasProjects is false', () => {
    const { container } = render(<InstallPrompt hasProjects={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when standalone mode active', () => {
    mockMatchMedia(true)
    const { container } = render(<InstallPrompt hasProjects={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when previously dismissed', () => {
    localStorage.setItem('pwa_install_dismissed', '1')
    const { container } = render(<InstallPrompt hasProjects={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows iOS Add to Home Screen instructions on iOS userAgent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    })
    render(<InstallPrompt hasProjects={true} />)
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeNull()
  })

  it('renders null for Android when hasProjects is false', () => {
    // Fire a fake beforeinstallprompt — should not matter if gate is false
    const { container } = render(<InstallPrompt hasProjects={false} />)
    expect(container.firstChild).toBeNull()
  })
})
