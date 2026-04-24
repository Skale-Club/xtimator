import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks ---------------------------------------------------------------

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

// Mock fetch for API calls
const fetchMock = vi.fn()
global.fetch = fetchMock

// Control language for useLanguage
let currentLanguage: 'en' | 'pt' | 'es' = 'en'
const setPendingCountMock = vi.fn()

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    language: currentLanguage,
    setLanguage: vi.fn(),
    pendingCount: 0,
    setPendingCount: setPendingCountMock,
  }),
}))

// Import after mocks
import { useTranslation } from '@/lib/i18n/use-translation'

beforeEach(() => {
  currentLanguage = 'en'
  fetchMock.mockReset()
  setPendingCountMock.mockReset()
  localStorageMock.clear()
})

describe('useTranslation — EN fast-path', () => {
  it('returns source text unchanged when language is "en"', () => {
    currentLanguage = 'en'
    const { t } = useTranslation()
    expect(t('Save')).toBe('Save')
    expect(t('Dashboard')).toBe('Dashboard')
  })

  it('does NOT call fetch when language is "en"', () => {
    currentLanguage = 'en'
    const { t } = useTranslation()
    t('Save')
    t('Cancel')
    t('Delete')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useTranslation — static dict lookup (PT)', () => {
  it('returns "Salvar" for t("Save") when language is "pt"', () => {
    currentLanguage = 'pt'
    const { t } = useTranslation()
    expect(t('Save')).toBe('Salvar')
    // Static dict hit: no fetch
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns "Cancelar" for t("Cancel") when language is "pt"', () => {
    currentLanguage = 'pt'
    const { t } = useTranslation()
    expect(t('Cancel')).toBe('Cancelar')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns "Excluir" for t("Delete") when language is "pt"', () => {
    currentLanguage = 'pt'
    const { t } = useTranslation()
    expect(t('Delete')).toBe('Excluir')
  })
})

describe('useTranslation — static dict lookup (ES)', () => {
  it('returns "Guardar" for t("Save") when language is "es"', () => {
    currentLanguage = 'es'
    const { t } = useTranslation()
    expect(t('Save')).toBe('Guardar')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns "Cancelar" for t("Cancel") when language is "es"', () => {
    currentLanguage = 'es'
    const { t } = useTranslation()
    expect(t('Cancel')).toBe('Cancelar')
  })

  it('returns "Eliminar" for t("Delete") when language is "es"', () => {
    currentLanguage = 'es'
    const { t } = useTranslation()
    expect(t('Delete')).toBe('Eliminar')
  })
})

describe('useTranslation — memCache', () => {
  it('second call to t("Save") for "pt" returns correct value (hit from cache or dict)', () => {
    currentLanguage = 'pt'
    const { t } = useTranslation()

    // First call — goes to static dict or cache
    const first = t('Save')
    expect(first).toBe('Salvar')

    // Second call — should return same value (from cache or dict)
    const second = t('Save')
    expect(second).toBe('Salvar')

    // No fetch should be called for static dict entries
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useTranslation — async fallback for unknown strings', () => {
  it('t("UnknownString__xyz") for "pt" returns source text immediately (async in flight)', async () => {
    currentLanguage = 'pt'
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ translations: { 'UnknownString__xyz': 'Desconhecido' } }),
    })
    const { t } = useTranslation()
    // Should return source text synchronously
    const result = t('UnknownString__xyz99')
    expect(result).toBe('UnknownString__xyz99')
  })

  it('flushBatch calls setPendingCount(c => c + 1) before fetch and setPendingCount(c => c - 1) in finally', async () => {
    currentLanguage = 'pt'

    let resolveResponse!: (value: unknown) => void
    const responsePromise = new Promise(resolve => { resolveResponse = resolve })
    fetchMock.mockReturnValue(responsePromise)

    const { t } = useTranslation()

    // Trigger async: call t with unknown string
    t('BatchTest__pendingCount_test_string')

    // Wait for the debounce timer (50ms + buffer)
    await new Promise(r => setTimeout(r, 80))

    // setPendingCount should have been called with increment function (c => c + 1)
    expect(setPendingCountMock).toHaveBeenCalled()
    const firstCall = setPendingCountMock.mock.calls[0][0]
    expect(typeof firstCall).toBe('function')
    expect(firstCall(0)).toBe(1) // c => c + 1

    // Resolve the fetch
    resolveResponse({
      ok: true,
      text: async () => JSON.stringify({ translations: { 'BatchTest__pendingCount_test_string': 'Teste' } }),
    })
    await new Promise(r => setTimeout(r, 20))

    // The decrement should have been called in finally
    const calls = setPendingCountMock.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(typeof lastCall).toBe('function')
    expect(lastCall(1)).toBe(0) // c => c - 1
  })
})

describe('useTranslation — language property', () => {
  it('returns the current language from the hook', () => {
    currentLanguage = 'pt'
    const { language } = useTranslation()
    expect(language).toBe('pt')
  })

  it('returns "en" when language is "en"', () => {
    currentLanguage = 'en'
    const { language } = useTranslation()
    expect(language).toBe('en')
  })
})
