import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Phase 185 Plan 04 (PGMODE-05) — a durable, automated guard (not a one-time
// manual check) proving the public share webview never imports any
// pagination module — neither the shared engine (lib/estimate/pagination/*)
// nor the paginated-editor-only web components (PaginatedDocumentOverlay,
// usePaginatedPreview). Mirrors tests/unit/pagination/pagination-engine-
// boundary.test.ts's approach (readFileSync + regex) widened to a recursive
// directory walk (mirroring tests/unit/platform-branding-sweep.test.ts's
// walk() helper) so ANY file added later under these two roots is covered
// automatically, and to ALSO catch the dynamic-import form
// (`import('...')`), not just static `from '...'` imports (plan-checker
// warning 11).

const ROOTS = ['app/estimate/[token]', 'components/share']

const STATIC_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*lib\/estimate\/pagination[^'"]*['"]/,
  /from\s+['"][^'"]*paginated-document-overlay[^'"]*['"]/,
  /from\s+['"][^'"]*use-paginated-preview[^'"]*['"]/,
]

const DYNAMIC_IMPORT_PATTERNS = [
  /import\(\s*['"][^'"]*lib\/estimate\/pagination[^'"]*['"]/,
  /import\(\s*['"][^'"]*paginated-document-overlay[^'"]*['"]/,
  /import\(\s*['"][^'"]*use-paginated-preview[^'"]*['"]/,
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const p = join(dir, entry)
    let s: ReturnType<typeof statSync>
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

function collectFiles(): string[] {
  const files: string[] = []
  for (const root of ROOTS) {
    const abs = resolve(process.cwd(), root)
    walk(abs, files)
  }
  return files
}

describe('Public share webview stays import-free of every pagination module (PGMODE-05)', () => {
  const files = collectFiles()

  it('sanity: this sweep actually found source files under both roots (a silent zero-file walk would be a false pass)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no file under app/estimate/[token]/ or components/share/ STATICALLY imports a pagination module', () => {
    const offenders: string[] = []
    for (const file of files) {
      const body = readFileSync(file, 'utf8')
      if (STATIC_IMPORT_PATTERNS.some((re) => re.test(body))) offenders.push(file)
    }
    expect(offenders, `Files statically importing a pagination module:\n${offenders.join('\n')}`).toEqual([])
  })

  it('no file under app/estimate/[token]/ or components/share/ DYNAMICALLY imports a pagination module (import(...) form)', () => {
    const offenders: string[] = []
    for (const file of files) {
      const body = readFileSync(file, 'utf8')
      if (DYNAMIC_IMPORT_PATTERNS.some((re) => re.test(body))) offenders.push(file)
    }
    expect(offenders, `Files dynamically importing a pagination module:\n${offenders.join('\n')}`).toEqual([])
  })
})
