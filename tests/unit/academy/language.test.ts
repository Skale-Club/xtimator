import { describe, it, expect } from 'vitest'
import {
  parseCourseLanguage,
  pickRequestedLanguage,
  resolveCatalogForLanguage,
} from '@/lib/academy/language'
import type { AcademyLanguage } from '@/lib/academy/language'
import type { AcademyCourse } from '@/lib/academy/types'

const course = (id: string, language: AcademyLanguage, group: string, order = 1): AcademyCourse => ({
  id,
  title: id,
  description: '',
  order,
  language,
  group,
  lessons: [],
})

const ids = (r: { courses: AcademyCourse[] }) => r.courses.map((c) => c.id)

describe('parseCourseLanguage', () => {
  it('maps Notion options and defaults to en', () => {
    expect(parseCourseLanguage('English')).toBe('en')
    expect(parseCourseLanguage('Português')).toBe('pt')
    expect(parseCourseLanguage('Español')).toBe('es')
    expect(parseCourseLanguage(null)).toBe('en')
    expect(parseCourseLanguage('Klingon')).toBe('en')
  })
})

describe('resolveCatalogForLanguage', () => {
  const all = [
    course('a-en', 'en', 'A', 1),
    course('a-pt', 'pt', 'A', 1),
    course('b-en', 'en', 'B', 2),
    course('c-es', 'es', 'C', 3),
  ]

  it('picks the requested language per group', () => {
    expect(ids(resolveCatalogForLanguage(all, 'pt'))).toEqual(['a-pt', 'b-en', 'c-es'])
  })

  it('falls back to English, then to any language by Order', () => {
    const r = resolveCatalogForLanguage(all, 'es')
    expect(ids(r)).toEqual(['a-en', 'b-en', 'c-es'])
    const onlyTranslated = [course('z-es', 'es', 'Z', 2), course('z-pt', 'pt', 'Z', 1)]
    expect(ids(resolveCatalogForLanguage(onlyTranslated, 'en'))).toEqual(['z-pt'])
  })

  it('treats an empty group as its own group', () => {
    const r = resolveCatalogForLanguage([course('p', 'pt', ''), course('q', 'en', '')], 'pt')
    expect(ids(r)).toEqual(['p', 'q'])
  })

  it('handles an empty catalog and sorts by Order', () => {
    expect(resolveCatalogForLanguage([], 'en')).toEqual({ courses: [] })
    const r = resolveCatalogForLanguage([course('late', 'en', 'L', 5), course('early', 'en', 'E', 1)], null)
    expect(ids(r)).toEqual(['early', 'late'])
  })
})

describe('pickRequestedLanguage', () => {
  it('uses the interface language, else en', () => {
    expect(pickRequestedLanguage('pt')).toBe('pt')
    expect(pickRequestedLanguage('bad')).toBe('en')
    expect(pickRequestedLanguage(null)).toBe('en')
  })
})
