import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: vi.fn(() => ({ language: 'en', setLanguage: vi.fn(), pendingCount: 0, setPendingCount: vi.fn() })),
}))

vi.mock('@/lib/i18n/translations', () => ({
  staticDict: {
    pt: { 'Save': 'Salvar', 'Cancel': 'Cancelar' },
    es: { 'Save': 'Guardar', 'Cancel': 'Cancelar' },
  },
}))

describe('useTranslation — I18N-03, I18N-04, I18N-06', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('I18N-03: t() returns text unchanged when language is "en"', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-04: t("Save") returns "Salvar" for PT without fetch call', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-04: t("Save") returns "Guardar" for ES without fetch call', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-06: second call to t("Save") for PT hits mem cache — no static dict lookup on second call', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })

  it('I18N-05: t() with string absent from static dict triggers fetch to /api/translate', () => {
    expect(true).toBe(false) // stub — implement in Plan 02
  })
})
