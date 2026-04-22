import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'

// --- Mocks --------------------------------------------------------------

const setThemeMock = vi.fn()
const useThemeMock = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}))

const saveThemePreferenceMock = vi.fn()
vi.mock('@/lib/actions/theme', () => ({
  saveThemePreference: (...args: unknown[]) => saveThemePreferenceMock(...args),
}))

const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

// next-themes hook is mocked above, so these imports are safe
import { ThemeToggle, ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'

function setTheme(theme: 'dark' | 'light' | 'system') {
  useThemeMock.mockReturnValue({ theme, setTheme: setThemeMock })
}

beforeEach(() => {
  setThemeMock.mockReset()
  useThemeMock.mockReset()
  saveThemePreferenceMock.mockReset()
  toastErrorMock.mockReset()
  saveThemePreferenceMock.mockResolvedValue({ ok: true })
  setTheme('dark')
})

// --- ThemeToggle (dropdown variant) -------------------------------------

describe('ThemeToggle', () => {
  it('renders a button with aria-label="Toggle theme"', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button', { name: /toggle theme/i })
    expect(btn).toBeTruthy()
  })

  it('renders Moon icon when theme === "dark"', () => {
    setTheme('dark')
    const { container } = render(<ThemeToggle />)
    // Post-mount, should include the Moon icon. lucide-react emits <svg class="lucide-moon ...">
    // We allow both class-based and data-lucide attribute detection.
    // After effect runs:
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const cls = svg?.getAttribute('class') ?? ''
    expect(cls.toLowerCase()).toContain('moon')
  })

  it('renders Sun icon when theme === "light"', () => {
    setTheme('light')
    const { container } = render(<ThemeToggle />)
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') ?? ''
    expect(cls.toLowerCase()).toContain('sun')
  })

  it('renders Monitor icon when theme === "system"', () => {
    setTheme('system')
    const { container } = render(<ThemeToggle />)
    const svg = container.querySelector('svg')
    const cls = svg?.getAttribute('class') ?? ''
    expect(cls.toLowerCase()).toContain('monitor')
  })

  it('clicking a dropdown item calls setTheme + saveThemePreference once each', async () => {
    setTheme('dark')
    render(<ThemeToggle />)
    const trigger = screen.getByRole('button', { name: /toggle theme/i })
    fireEvent.click(trigger)

    // Radix dropdown renders items as role="menuitemradio"
    const lightItem = await screen.findByRole('menuitemradio', { name: /^light$/i })
    await act(async () => {
      fireEvent.click(lightItem)
    })

    expect(setThemeMock).toHaveBeenCalledTimes(1)
    expect(setThemeMock).toHaveBeenCalledWith('light')
    await waitFor(() =>
      expect(saveThemePreferenceMock).toHaveBeenCalledWith('light')
    )
    expect(saveThemePreferenceMock).toHaveBeenCalledTimes(1)
  })

  it('when saveThemePreference returns { ok: false, message }, toast.error is called with the message', async () => {
    saveThemePreferenceMock.mockResolvedValueOnce({ ok: false, message: 'boom' })
    setTheme('dark')
    render(<ThemeToggle />)

    const trigger = screen.getByRole('button', { name: /toggle theme/i })
    fireEvent.click(trigger)
    const lightItem = await screen.findByRole('menuitemradio', { name: /^light$/i })
    await act(async () => {
      fireEvent.click(lightItem)
    })

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('boom'))
  })
})

// --- ThemeToggleRadioGroup (settings variant) ---------------------------

describe('ThemeToggleRadioGroup', () => {
  it('renders three radio items with accessible labels Light, Dark, System', async () => {
    setTheme('dark')
    render(<ThemeToggleRadioGroup />)

    // Radix emits role="radio" for items
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(3)

    // Labels are rendered as htmlFor-linked <label> elements
    expect(screen.getByText(/^light$/i)).toBeTruthy()
    expect(screen.getByText(/^dark$/i)).toBeTruthy()
    expect(screen.getByText(/^system$/i)).toBeTruthy()
  })
})
