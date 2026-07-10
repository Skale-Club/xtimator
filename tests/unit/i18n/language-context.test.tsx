import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'

// ---- Mocks ---------------------------------------------------------------
// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

// Import after mocks
import {
  LanguageProvider,
  useLanguage,
  useTranslationPendingCount,
  useSetTranslationPending,
} from '@/lib/i18n/language-context'

// Helper consumer component
function LanguageDisplay() {
  const { language, setLanguage } = useLanguage()
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <button onClick={() => setLanguage('pt')}>Set PT</button>
      <button onClick={() => setLanguage('es')}>Set ES</button>
      <button onClick={() => setLanguage('en')}>Set EN</button>
    </div>
  )
}

beforeEach(() => {
  localStorageMock.clear()
})

describe('LanguageProvider', () => {
  it('defaults to "en" when localStorage is empty', async () => {
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('lang').textContent).toBe('en')
    })
  })

  it('reads "pt" from localStorage on mount and sets language to "pt"', async () => {
    localStorageMock.setItem('language', 'pt')
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('lang').textContent).toBe('pt')
    })
  })

  it('reads "es" from localStorage on mount and sets language to "es"', async () => {
    localStorageMock.setItem('language', 'es')
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('lang').textContent).toBe('es')
    })
  })

  it('ignores invalid localStorage value and defaults to "en"', async () => {
    localStorageMock.setItem('language', 'fr') // unsupported language
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('lang').textContent).toBe('en')
    })
  })
})

describe('setLanguage', () => {
  it('updates language state and writes to localStorage', async () => {
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await act(async () => {
      screen.getByText('Set PT').click()
    })
    expect(screen.getByTestId('lang').textContent).toBe('pt')
    expect(localStorageMock.getItem('language')).toBe('pt')
  })

  it('switches language back to "en" and writes to localStorage', async () => {
    localStorageMock.setItem('language', 'pt')
    render(
      <LanguageProvider>
        <LanguageDisplay />
      </LanguageProvider>
    )
    await waitFor(() => expect(screen.getByTestId('lang').textContent).toBe('pt'))

    await act(async () => {
      screen.getByText('Set EN').click()
    })
    expect(screen.getByTestId('lang').textContent).toBe('en')
    expect(localStorageMock.getItem('language')).toBe('en')
  })
})

describe('pendingCount', () => {
  // pendingCount moved out of useLanguage() into dedicated contexts so count
  // bumps don't re-render every translated component — read via the new hooks.
  function PendingCountDisplay() {
    const pendingCount = useTranslationPendingCount()
    const setPendingCount = useSetTranslationPending()
    return (
      <div>
        <span data-testid="pending">{pendingCount}</span>
        <button onClick={() => setPendingCount(c => c + 1)}>Inc</button>
        <button onClick={() => setPendingCount(c => c - 1)}>Dec</button>
      </div>
    )
  }

  it('starts at 0', async () => {
    render(
      <LanguageProvider>
        <PendingCountDisplay />
      </LanguageProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('pending').textContent).toBe('0')
    })
  })

  it('increments and decrements correctly', async () => {
    render(
      <LanguageProvider>
        <PendingCountDisplay />
      </LanguageProvider>
    )
    await act(async () => { screen.getByText('Inc').click() })
    expect(screen.getByTestId('pending').textContent).toBe('1')
    await act(async () => { screen.getByText('Dec').click() })
    expect(screen.getByTestId('pending').textContent).toBe('0')
  })
})
