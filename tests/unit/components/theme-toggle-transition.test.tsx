import { Suspense, startTransition, use, useEffect, useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { saveThemePreferenceMock } = vi.hoisted(() => ({
  saveThemePreferenceMock: vi.fn(),
}))

vi.mock('@/lib/actions/theme', () => ({
  saveThemePreference: saveThemePreferenceMock,
}))

import { ThemeToggle, ThemeToggleRadioGroup } from '@/components/app-shell/theme-toggle'

let dispatchServerAction: (response: Promise<void>) => void

// Mirror Next's callServer + useActionQueue: a server action schedules a
// transition that suspends the router above the root ThemeProvider until its
// response arrives. A plain resolved mock cannot reproduce this interaction.
function RouterHarness({ children }: { children: ReactNode }) {
  const [response, setResponse] = useState<Promise<void> | null>(null)
  useEffect(() => {
    dispatchServerAction = (next) => startTransition(() => setResponse(next))
  }, [])
  if (response) use(response)
  return children
}

beforeEach(() => {
  saveThemePreferenceMock.mockReset()
  localStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark', 'light')
})

describe.each(['button', 'radio'] as const)('Theme toggle via %s', (surface) => {
  it.each([
    ['dark', 'light'],
    ['light', 'dark'],
  ] as const)('changes %s to %s before the server action responds', async (from, to) => {
    let finishResponse!: () => void
    const response = new Promise<void>((resolve) => { finishResponse = resolve })
    saveThemePreferenceMock.mockImplementation(() => {
      dispatchServerAction(response)
      return response.then(() => ({ ok: true }))
    })
    localStorage.setItem('theme', from)

    render(
      <Suspense fallback={<p>Loading router</p>}>
        <RouterHarness>
          <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
            {surface === 'button' ? <ThemeToggle /> : <ThemeToggleRadioGroup />}
          </ThemeProvider>
        </RouterHarness>
      </Suspense>
    )
    expect(document.documentElement.classList.contains(from)).toBe(true)

    await act(async () => {
      fireEvent.click(surface === 'button'
        ? screen.getByRole('button', { name: /toggle theme/i })
        : screen.getByRole('radio', { name: new RegExp(`^${to}$`, 'i') }))
    })

    try {
      expect(saveThemePreferenceMock).toHaveBeenCalledExactlyOnceWith(to)
      // The response is deliberately still pending at this assertion.
      expect(document.documentElement.classList.contains(to)).toBe(true)
      expect(localStorage.getItem('theme')).toBe(to)
    } finally {
      await act(async () => { finishResponse() })
    }
    expect(document.documentElement.classList.contains(to)).toBe(true)
  })
})
