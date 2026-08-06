import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LABELS, LANG_INDICATOR } from '@/lib/estimate/document/labels'

const LANGS = ['en', 'pt', 'es'] as const
type Lang = (typeof LANGS)[number]

// Extracts the `lang: { key: 'value', ... },` block's inner body for a given
// language from a label-map declaration's raw source. DOC_LABELS/PDF_LABELS
// are flat object literals (no nested braces) today, so a non-greedy match
// up to the first `},` is safe.
function extractLangBlock(source: string, mapName: string, lang: Lang): string {
  const mapStart = source.indexOf(`const ${mapName}`)
  if (mapStart === -1) throw new Error(`${mapName} declaration not found`)
  const mapSource = source.slice(mapStart)
  const langRe = new RegExp(`${lang}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`)
  const match = langRe.exec(mapSource)
  if (!match) throw new Error(`${mapName}.${lang} block not found`)
  return match[1]
}

// Extracts every `key: 'value'` pair from a block's source text.
function extractPairs(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+):\s*'((?:[^'\\]|\\.)*)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2]
  }
  return out
}

interface RendererSource {
  file: string
  mapName: string
}

const RENDERERS: RendererSource[] = [
  { file: 'components/workspace/estimate/estimate-document.tsx', mapName: 'DOC_LABELS' },
  { file: 'components/share/estimate-document-modern.tsx', mapName: 'DOC_LABELS' },
  { file: 'components/pdf/estimate-pdf.tsx', mapName: 'PDF_LABELS' },
  { file: 'components/pdf/estimate-pdf-modern.tsx', mapName: 'PDF_LABELS' },
]

describe('lib/estimate/document/labels — state-tolerant golden parity (ENGINE-01)', () => {
  for (const { file, mapName } of RENDERERS) {
    for (const lang of LANGS) {
      it(`${file} (${mapName}.${lang}) matches LABELS.${lang} — pre- or post-adoption`, () => {
        const source = readFileSync(file, 'utf8')
        if (source.includes(`const ${mapName}`)) {
          // pre-adoption (still not touched by Plan 182-02): live-source parity
          const extracted = extractPairs(extractLangBlock(source, mapName, lang))
          expect(Object.keys(extracted).length).toBeGreaterThan(0)
          for (const [key, value] of Object.entries(extracted)) {
            expect(
              (LABELS[lang] as unknown as Record<string, string>)[key],
              `${file}: ${mapName}.${lang}.${key}`,
            ).toBe(value)
          }
        } else {
          // post-adoption (Plan 182-02 has touched this file): assert adoption
          expect(source).toMatch(/from ['"]@\/lib\/estimate\/document\/labels['"]/)
        }
      })
    }
  }

  it('union of every extracted key across renderers still declaring a local map, plus {page, of, preparedBy}, equals the 45-key set — checked only while ALL 4 are still pre-adoption; the 45-key shape itself is always checked', () => {
    const stillLocal = RENDERERS.filter(({ file, mapName }) => readFileSync(file, 'utf8').includes(`const ${mapName}`))
    if (stillLocal.length === RENDERERS.length) {
      // Full pre-adoption (all 4 renderers still local): the union is
      // meaningful. The moment ANY renderer adopts (a real Plan 182-02
      // partial state — e.g. after its Task 1 but before its Task 2), the
      // remaining local maps alone no longer cover all 45 keys (PDF_LABELS
      // is a narrower subset of the webview superset), so this comparison
      // is skipped in that window — only the unconditional 45-key check
      // below still runs.
      const allKeys = new Set<string>()
      for (const { file, mapName } of stillLocal) {
        const source = readFileSync(file, 'utf8')
        for (const lang of LANGS) {
          const block = extractLangBlock(source, mapName, lang)
          for (const key of Object.keys(extractPairs(block))) allKeys.add(key)
        }
      }
      for (const extra of ['page', 'of', 'preparedBy']) allKeys.add(extra)
      expect(Array.from(allKeys).sort()).toEqual(Object.keys(LABELS.en).sort())
    }
    // Unconditional: LABELS itself always carries exactly the 53-key shape
    // (row/section kebab-menu work added addDiscount, removeDiscount,
    // deleteLine, deleteSection, rowActions, sectionActions on top of the
    // prior 47-key shape from Phase 185 Plan 03), regardless of adoption
    // state.
    expect(Object.keys(LABELS.en).length).toBe(53)
  })

  it('LANG_INDICATOR matches the shared module — pre- or post-adoption', () => {
    const source = readFileSync('components/pdf/estimate-pdf.tsx', 'utf8')
    if (source.includes('const LANG_INDICATOR')) {
      const start = source.indexOf('const LANG_INDICATOR')
      const block = source.slice(start, source.indexOf('}', start) + 1)
      const extracted = extractPairs(block)
      expect(extracted).toEqual(LANG_INDICATOR)
    } else {
      // post-adoption: must import the shared constant, AND must not have
      // silently left a duplicate local declaration behind (a bare
      // toMatch(/LANG_INDICATOR/) alone would also pass on a leftover copy).
      expect(source).toMatch(/LANG_INDICATOR/)
      expect(source).not.toMatch(/const LANG_INDICATOR/)
    }
  })

  // NEW-2 (re-verification fix): locks every label VALUE permanently via a
  // committed snapshot. This is the ONE check that still guards actual
  // string values once all 4 renderers have moved to the (value-blind)
  // import-adoption branch above. Running this test for the first time
  // CREATES tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap
  // — that file MUST be committed alongside this test (mirrors the existing
  // tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap
  // precedent already in this repo). CI runs with CI=true (GitHub Actions
  // default), which makes vitest FAIL on a missing snapshot instead of
  // silently auto-writing one — the .snap file must already be on disk
  // before this task's commit.
  it('LABELS content is locked permanently via snapshot', () => {
    expect(LABELS).toMatchSnapshot()
  })
})
