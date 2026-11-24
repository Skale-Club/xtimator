import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const setLanguageMock = vi.fn()
const useLanguageMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => useLanguageMock(),
}))

import { LanguageToggle } from '@/components/app-shell/language-toggle'

function setupLanguage(lang: 'en' | 'pt' | 'es') {
  useLanguageMock.mockReturnValue({
    language: lang,
    setLanguage: setLanguageMock,
    pendingCount: 0,
    setPendingCount: vi.fn(),
  })
}

async function openLanguageMenu() {
  render(<LanguageToggle />)
  const trigger = await screen.findByRole('button', { name: 'Language: English' })
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  return within(await screen.findByRole('menu'))
}

beforeEach(() => {
  setLanguageMock.mockReset()
  useLanguageMock.mockReset()
  setupLanguage('en')
})

describe('LanguageToggle — I18N-01', () => {
  it('renders a trigger button with aria-label for current language', async () => {
    setupLanguage('en')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: english/i })
    expect(btn).toBeTruthy()
  })

  it('renders trigger button for pt', async () => {
    setupLanguage('pt')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: português/i })
    expect(btn).toBeTruthy()
  })

  it('renders trigger button for es', async () => {
    setupLanguage('es')
    render(<LanguageToggle />)
    const btn = await screen.findByRole('button', { name: /language: español/i })
    expect(btn).toBeTruthy()
  })

  it('keyboard opening exposes all three language options without changing language', async () => {
    const menu = await openLanguageMenu()
    expect(menu.getAllByRole('menuitem')).toHaveLength(3)
    for (const name of ['English', 'Português', 'Español']) {
      expect(menu.getByRole('menuitem', { name })).toBeTruthy()
    }
    expect(setLanguageMock).not.toHaveBeenCalled()
  })

  it.each([
    ['Português', 'pt'],
    ['Español', 'es'],
  ])('selecting %s changes the language to %s', async (label, language) => {
    const menu = await openLanguageMenu()
    fireEvent.click(menu.getByRole('menuitem', { name: label }))
    expect(setLanguageMock).toHaveBeenCalledExactlyOnceWith(language)
  })
})
