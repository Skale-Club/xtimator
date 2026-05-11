import { describe, expect, it } from 'vitest'
import {
  resolveEstimateLanguage,
  resolveEstimateLanguageWithSource,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from '@/lib/i18n/resolve-estimate-language'

describe('resolveEstimateLanguage — cascade', () => {
  it('returns "en" when all inputs are null/undefined', () => {
    expect(resolveEstimateLanguage({})).toBe('en')
  })

  it('respects explicit override above all other layers', () => {
    expect(
      resolveEstimateLanguage({
        override: 'pt',
        clientPreferred: 'es',
        companyDefault: 'es',
        userAppLanguage: 'es',
      })
    ).toBe('pt')
  })

  it('uses clientPreferred when no override', () => {
    expect(
      resolveEstimateLanguage({
        clientPreferred: 'pt',
        companyDefault: 'es',
        userAppLanguage: 'es',
      })
    ).toBe('pt')
  })

  it('uses companyDefault when no override or client preference', () => {
    expect(
      resolveEstimateLanguage({
        companyDefault: 'es',
        userAppLanguage: 'pt',
      })
    ).toBe('es')
  })

  it('uses userAppLanguage when explicit non-English app choice', () => {
    expect(resolveEstimateLanguage({ userAppLanguage: 'pt' })).toBe('pt')
    expect(resolveEstimateLanguage({ userAppLanguage: 'es' })).toBe('es')
  })

  it('SKIPS userAppLanguage when it is "en" (treats EN as "no preference")', () => {
    expect(
      resolveEstimateLanguage({
        userAppLanguage: 'en',
      })
    ).toBe('en')
  })

  it('falls through invalid layer values to next layer', () => {
    expect(
      resolveEstimateLanguage({
        // @ts-expect-error testing runtime guard
        override: 'fr',
        clientPreferred: 'pt',
      })
    ).toBe('pt')
  })

  it('falls back to "en" when only invalid values present', () => {
    expect(
      resolveEstimateLanguage({
        // @ts-expect-error testing runtime guard
        override: 'fr',
        // @ts-expect-error testing runtime guard
        clientPreferred: 'de',
      })
    ).toBe('en')
  })
})

describe('resolveEstimateLanguageWithSource', () => {
  it('reports override source', () => {
    expect(resolveEstimateLanguageWithSource({ override: 'pt' })).toEqual({
      language: 'pt',
      source: 'override',
    })
  })

  it('reports client source', () => {
    expect(resolveEstimateLanguageWithSource({ clientPreferred: 'es' })).toEqual({
      language: 'es',
      source: 'client',
    })
  })

  it('reports company source', () => {
    expect(resolveEstimateLanguageWithSource({ companyDefault: 'pt' })).toEqual({
      language: 'pt',
      source: 'company',
    })
  })

  it('reports user source for non-EN app language', () => {
    expect(resolveEstimateLanguageWithSource({ userAppLanguage: 'pt' })).toEqual({
      language: 'pt',
      source: 'user',
    })
  })

  it('reports fallback for empty / EN-only inputs', () => {
    expect(resolveEstimateLanguageWithSource({})).toEqual({
      language: 'en',
      source: 'fallback',
    })
    expect(resolveEstimateLanguageWithSource({ userAppLanguage: 'en' })).toEqual({
      language: 'en',
      source: 'fallback',
    })
  })
})

describe('isSupportedLanguage', () => {
  it('returns true for en/pt/es', () => {
    expect(isSupportedLanguage('en')).toBe(true)
    expect(isSupportedLanguage('pt')).toBe(true)
    expect(isSupportedLanguage('es')).toBe(true)
  })

  it('returns false for unsupported languages', () => {
    expect(isSupportedLanguage('fr')).toBe(false)
    expect(isSupportedLanguage('de')).toBe(false)
    expect(isSupportedLanguage('zh')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
    expect(isSupportedLanguage(123)).toBe(false)
    expect(isSupportedLanguage({})).toBe(false)
  })
})

describe('SUPPORTED_LANGUAGES', () => {
  it('contains exactly EN, PT, ES', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['en', 'pt', 'es'])
  })
})
