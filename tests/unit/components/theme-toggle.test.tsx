import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

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

// Imports after mocks
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
//
// Radix dropdown items are rendered in a portal only when the trigger is
// opened via real pointer events, which jsdom does not implement. We
// therefore verify the visible trigger (label + correct icon) here, and
// cover the click→persist→toast flow via the RadioGroup variant below,
// which shares the same `persist()` helper and renders items inline.

describe('ThemeToggle (dropdown variant)', () => {
  it('renders a button with aria-label="Toggle theme"', () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button', { name: /toggle theme/i })
    expect(btn).toBeTruthy()
  })

  it('renders Moon icon when theme === "dark"', () => {
    setTheme('dark')
    const { container } = render(<ThemeToggle />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')?.toLowerCase()).toContain('moon')
  })

  it('renders Sun icon when theme === "light"', () => {
    setTheme('light')
    const { container } = render(<ThemeToggle />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')?.toLowerCase()).toContain('sun')
  })

  it('renders Monitor icon when theme === "system"', () => {
    setTheme('system')
    const { container } = render(<ThemeToggle />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')?.toLowerCase()).toContain('monitor')
  })
})

// --- ThemeToggleRadioGroup (settings variant) ---------------------------

describe('ThemeToggleRadioGroup (settings variant)', () => {
  it('renders three radio items with accessible labels Light, Dark, System', async () => {
    setTheme('dark')
    render(<ThemeToggleRadioGroup />)
    const radios = await screen.findAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByText(/^light$/i)).toBeTruthy()
    expect(screen.getByText(/^dark$/i)).toBeTruthy()
    expect(screen.getByText(/^system$/i)).toBeTruthy()
  })

  it('selecting a theme calls setTheme and saveThemePreference exactly once each', async () => {
    setTheme('dark')
    render(<ThemeToggleRadioGroup />)

    const lightRadio = screen.getByRole('radio', { name: /^light$/i })
    await act(async () => {
      fireEvent.click(lightRadio)
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
    render(<ThemeToggleRadioGroup />)

    const lightRadio = screen.getByRole('radio', { name: /^light$/i })
    await act(async () => {
      fireEvent.click(lightRadio)
    })

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('boom'))
  })
})
