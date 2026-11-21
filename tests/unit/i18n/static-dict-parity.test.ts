import { describe, it, expect } from 'vitest'
import { staticDict } from '@/lib/i18n/translations'

describe('static translations', () => {
  it('pt and es define the same keys', () => {
    const pt = new Set(Object.keys(staticDict.pt))
    const es = new Set(Object.keys(staticDict.es))
    expect([...pt].filter((k) => !es.has(k))).toEqual([])
    expect([...es].filter((k) => !pt.has(k))).toEqual([])
  })

  it('keeps {placeholders} identical between the English key and each translation', () => {
    const bad: string[] = []
    for (const lang of ['pt', 'es'] as const) {
      for (const [src, out] of Object.entries(staticDict[lang])) {
        const want = (src.match(/\{\w+\}/g) ?? []).sort().join(',')
        const got = (out.match(/\{\w+\}/g) ?? []).sort().join(',')
        if (want !== got) bad.push(`${lang}: ${src}`)
      }
    }
    expect(bad).toEqual([])
  })
})
