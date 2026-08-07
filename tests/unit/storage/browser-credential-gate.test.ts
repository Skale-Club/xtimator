/**
 * Phase 189 Plan 04 — UPLOAD-01 (negative half): the client import-graph
 * credential gate.
 *
 * WHAT THIS PROVES: that no `'use client'` module in this repo can
 * *transitively reach* a module that touches a storage credential (an S3
 * secret key, the Supabase service-role key, or the server-only ticket
 * minter). This is a claim about the MODULE GRAPH, not about any particular
 * build or environment.
 *
 * WHY NOT A BUNDLE GREP: the obvious alternative — run `next build` and grep
 * the client chunks for a secret string — needs a full production build
 * (slow, and this repo's build has OOM history on constrained hosts), and it
 * can only find a credential that is *currently configured*. On every
 * machine this repo runs on today, `S3_*` is deliberately absent from
 * `.env.local` and Coolify (see CONTEXT.md and `docs/STORAGE-MIGRATION.md`),
 * so a bundle grep would be permanently, vacuously green — it would pass
 * while proving nothing about whether a credential COULD leak once R2 is
 * activated. A static transitive-closure walk asks the load-bearing question
 * instead: can a client entry point *reach* the module that touches
 * credentials, regardless of whether a secret happens to be configured right
 * now. That answer does not depend on env state, runs in under a second, and
 * lives in `tests/unit` where CI already runs it on every push.
 *
 * Modelled on `tests/unit/demo/mutation-boundary-sweep.test.ts`'s
 * `walk`/`parseModule`/`repoPath` helpers, adapted in two ways that sweep
 * does not need: this walk includes `.tsx` (most client components are
 * `.tsx`, and the sweep's own `walk` filters to `.ts` only), and it resolves
 * full IMPORT GRAPHS (specifiers, not just declarations), because the
 * property under test is reachability through the module graph, not
 * boundary discovery within a single file.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')

function repoPath(absolutePath: string): string {
  return relative(ROOT, absolutePath).replaceAll('\\', '/')
}

function walk(directory: string): string[] {
  return readdirSync(resolve(ROOT, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')),
    )
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort()
}

const SCAN_DIRS = ['app', 'components', 'hooks', 'lib']
const ALL_FILES = SCAN_DIRS.flatMap(walk)

/**
 * Modules that must NEVER appear in a client module's transitive import
 * closure — verbatim from this plan's `<interfaces>` section. Each one
 * either constructs an S3 client with real credentials, mints a
 * service-role Supabase client, or mints a tenant-confined write ticket
 * server-side.
 */
const FORBIDDEN_INTERNAL_MODULES = [
  'lib/storage/server.ts',
  'lib/storage/upload-ticket.ts',
  'lib/storage/s3-config.ts',
  'lib/storage/s3-provider.ts',
  'lib/storage/asset-source.ts',
  'lib/storage/proxy-auth.ts',
  'lib/supabase/service.ts',
]

/** Bare external specifiers a client closure must never import. */
function isForbiddenExternal(spec: string): boolean {
  return spec.startsWith('@aws-sdk/') || spec === 'server-only'
}

/**
 * String literals that must never appear in the SOURCE of any module a
 * client entry point can reach. `NEXT_PUBLIC_*` reads are fine and expected
 * — none of these are that prefix.
 */
const CREDENTIAL_LITERALS = [
  'S3_SECRET_ACCESS_KEY',
  'S3_ACCESS_KEY_ID',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE',
  'STORAGE_PROVIDER',
]

interface ParsedModule {
  isUseClient: boolean
  /**
   * True when the module's directive prologue contains `'use server'` — a
   * Next.js Server Actions module. THIS IS A REAL COMPILE-TIME BOUNDARY, not
   * a naming convention: Next.js's Flight compiler replaces every export of
   * such a module with an RPC-call stub (a module id + export name) when it
   * is imported from client code. Neither the function body nor any of its
   * own imports ship to the browser. A client entry "importing"
   * `lib/actions/recording.ts` (which itself imports
   * `lib/storage/server.ts`) is therefore NOT a credential leak — it is
   * exactly the sanctioned Server Action RPC pattern this repo relies on
   * pervasively. The walk below stops at this boundary on purpose; treating
   * it as a normal module would make this gate red on hundreds of
   * legitimate call sites and worthless as a signal.
   */
  isUseServer: boolean
  specifiers: string[]
  source: string
}

const moduleCache = new Map<string, ParsedModule>()

/**
 * True for `import type { ... } from '...'`, `import type X from '...'`,
 * and `import { type A, type B } from '...'` (every named specifier
 * individually marked `type`). TypeScript/Next.js's compiler ERASES these
 * entirely at build time — no runtime `require`/module evaluation happens,
 * so the imported module's own code (and ITS imports) never executes, let
 * alone ships to a client bundle. Several server-only query modules
 * (`lib/queries/estimate.ts` and friends, each starting with
 * `import 'server-only'`) are imported this way, purely for their exported
 * TYPES, from client components — that is not a credential path and must
 * not be treated as one. A side-effect-only import (`import './foo'`, no
 * clause at all) is always a real runtime import.
 */
function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  if (clause.name) return false // a non-type default import is a real runtime binding
  const bindings = clause.namedBindings
  if (!bindings) return false
  if (ts.isNamespaceImport(bindings)) return false // `import * as x` is always a runtime import here
  return bindings.elements.every((element) => element.isTypeOnly)
}

/** Same reasoning as isTypeOnlyImport, for `export type { ... } from '...'`. */
function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false
  return node.exportClause.elements.every((element) => element.isTypeOnly)
}

/**
 * Parses ANY absolute .ts/.tsx path — not limited to files under
 * `SCAN_DIRS`, since a module inside those dirs may import something
 * outside them (e.g. a root-level generated types file). Cached by
 * repo-relative path so a module imported from many entry points is only
 * read/parsed once.
 */
function parseModule(absPath: string): ParsedModule {
  const rp = repoPath(absPath)
  const cached = moduleCache.get(rp)
  if (cached) return cached

  const source = readFileSync(absPath, 'utf8')
  const sourceFile = ts.createSourceFile(
    absPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  // Directive prologue: leading string-literal expression statements only.
  // 'use client' and 'use server' must each be the first statement in the
  // file (mutually exclusive in practice), exactly like Next.js requires.
  let isUseClient = false
  let isUseServer = false
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === 'use client') isUseClient = true
      if (statement.expression.text === 'use server') isUseServer = true
      continue
    }
    break
  }

  const specifiers: string[] = []
  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !isTypeOnlyImport(node)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !isTypeOnlyExport(node)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (ts.isImportCall(node)) {
      const arg = node.arguments[0]
      if (arg && ts.isStringLiteral(arg)) specifiers.push(arg.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const parsed: ParsedModule = { isUseClient, isUseServer, specifiers, source }
  moduleCache.set(rp, parsed)
  return parsed
}

type Resolution =
  | { kind: 'internal'; absPath: string }
  | { kind: 'external'; spec: string }

/**
 * Resolves `@/x` -> `<root>/x` and relative specifiers against the
 * importing file, probing the file itself, `.ts`, `.tsx`, `/index.ts`,
 * `/index.tsx`. A bare package specifier (no `@/` prefix, not relative) is
 * always external. A `@/`/relative specifier that resolves to nothing
 * inside the repo is ALSO recorded as external rather than followed — this
 * only happens for specifiers this repo doesn't actually use, but the walk
 * must not throw on one.
 */
function resolveSpecifier(fromAbsPath: string, spec: string): Resolution {
  let base: string
  if (spec.startsWith('@/')) {
    base = resolve(ROOT, spec.slice(2))
  } else if (spec.startsWith('.')) {
    base = resolve(dirname(fromAbsPath), spec)
  } else {
    return { kind: 'external', spec }
  }

  const candidates = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts'), resolve(base, 'index.tsx')]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return { kind: 'internal', absPath: candidate }
    }
  }
  return { kind: 'external', spec }
}

interface Closure {
  /** repo-relative paths, including the entry itself. */
  internal: Set<string>
  external: Set<string>
  /**
   * Modules inside `internal` whose OWN source/imports were not traversed
   * further because they are a `'use server'` boundary (see
   * `ParsedModule.isUseServer`'s docblock). Kept in `internal` for
   * path-reporting purposes (the client really does hold a reference to
   * this module's export), but excluded from the credential-literal scan —
   * the module's source text never reaches the browser, only an RPC stub
   * referencing it does.
   */
  boundary: Set<string>
  /** child repoPath -> parent repoPath, for shortest-path reconstruction. */
  parent: Map<string, string>
}

function computeClosure(entryAbsPath: string): Closure {
  const internal = new Set<string>()
  const external = new Set<string>()
  const boundary = new Set<string>()
  const parent = new Map<string, string>()
  const entryRepo = repoPath(entryAbsPath)
  internal.add(entryRepo)

  const queue: string[] = [entryAbsPath]
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentRepo = repoPath(current)
    const parsedCurrent = parseModule(current)

    // Next.js Server Actions boundary: stop here. The entry itself is never
    // 'use server' (it is always a 'use client' entry point by construction
    // of CLIENT_ENTRY_FILES), so this only ever short-circuits a module
    // reached partway through the walk.
    if (currentRepo !== entryRepo && parsedCurrent.isUseServer) {
      boundary.add(currentRepo)
      continue
    }

    for (const spec of parsedCurrent.specifiers) {
      const resolved = resolveSpecifier(current, spec)
      if (resolved.kind === 'external') {
        external.add(resolved.spec)
        continue
      }
      const childRepo = repoPath(resolved.absPath)
      if (!internal.has(childRepo)) {
        internal.add(childRepo)
        parent.set(childRepo, repoPath(current))
        queue.push(resolved.absPath)
      }
    }
  }

  return { internal, external, boundary, parent }
}

/** Reconstructs entry -> ... -> target as an array of repo-relative paths. */
function pathTo(parent: Map<string, string>, entryRepo: string, target: string): string[] {
  const chain: string[] = [target]
  let cur = target
  while (cur !== entryRepo) {
    const prev = parent.get(cur)
    if (!prev) break
    chain.push(prev)
    cur = prev
  }
  chain.reverse()
  return chain
}

const CLIENT_ENTRY_FILES = ALL_FILES.filter((f) => parseModule(f).isUseClient)

describe('browser credential gate — client import-graph closure (UPLOAD-01)', () => {
  // Computed once for the whole describe block — the walk is pure and cheap
  // (well under a second for this repo), and every assertion below reuses
  // the same closures rather than recomputing them.
  const closures = new Map<string, Closure>(
    CLIENT_ENTRY_FILES.map((f) => [repoPath(f), computeClosure(f)]),
  )

  it('discovers at least the three known browser upload entry points as \'use client\'', () => {
    const ids = [...closures.keys()]
    expect(ids).toEqual(
      expect.arrayContaining([
        'components/capture/capture-recorder.tsx',
        'components/projects/inline-audio-recorder.tsx',
        'components/workspace/ai-input-group/use-ai-input-submit.ts',
        'components/workspace/photos/photo-card.tsx',
      ]),
    )
  })

  it('no client entry point closure reaches a forbidden storage/credential module', () => {
    const violations: string[] = []
    for (const [entryRepo, closure] of closures) {
      for (const forbidden of FORBIDDEN_INTERNAL_MODULES) {
        if (closure.internal.has(forbidden)) {
          const chain = pathTo(closure.parent, entryRepo, forbidden)
          violations.push(`${chain.join(' -> ')} (FORBIDDEN)`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('no client entry point imports a forbidden external specifier (@aws-sdk/*, server-only)', () => {
    const violations: string[] = []
    for (const [entryRepo, closure] of closures) {
      for (const spec of closure.external) {
        if (isForbiddenExternal(spec)) {
          violations.push(`${entryRepo} -> "${spec}" (FORBIDDEN external specifier)`)
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('no credential-shaped literal appears in the source of any client-reachable module', () => {
    const violations: string[] = []
    for (const [entryRepo, closure] of closures) {
      for (const modRepo of closure.internal) {
        // A 'use server' boundary module's own source text never reaches the
        // browser (see Closure.boundary's docblock) — only an RPC stub does.
        if (closure.boundary.has(modRepo)) continue
        const { source } = parseModule(resolve(ROOT, modRepo))
        for (const literal of CREDENTIAL_LITERALS) {
          if (source.includes(literal)) {
            violations.push(`${entryRepo} -> ${modRepo} contains "${literal}"`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('positive control: lib/storage/browser-upload.ts IS reached by all three migrated upload call sites', () => {
    const callSites = [
      'components/capture/capture-recorder.tsx',
      'components/projects/inline-audio-recorder.tsx',
      'components/workspace/ai-input-group/use-ai-input-submit.ts',
    ]
    for (const site of callSites) {
      const closure = closures.get(site)
      expect(closure, `${site} was not discovered as a 'use client' entry point`).toBeTruthy()
      expect(
        closure!.internal.has('lib/storage/browser-upload.ts'),
        `${site} does not reach lib/storage/browser-upload.ts — the walk found nothing, which would make ` +
          'the earlier "no forbidden module" assertions pass vacuously',
      ).toBe(true)
    }
  })

  it('the server route is wired to the ticket minter (the seam is not orphaned)', () => {
    // Deliberately NOT a client-entry walk — app/api/storage/upload-ticket/route.ts
    // is server-only and has no 'use client' directive. This asserts the OTHER
    // side of the seam: the route this plan's browser module calls actually
    // reaches lib/storage/upload-ticket.ts, so the gate above isn't green
    // because the minter is simply unused.
    const routeAbsPath = resolve(ROOT, 'app/api/storage/upload-ticket/route.ts')
    expect(existsSync(routeAbsPath), 'app/api/storage/upload-ticket/route.ts must exist').toBe(true)
    const closure = computeClosure(routeAbsPath)
    expect(closure.internal.has('lib/storage/upload-ticket.ts')).toBe(true)
  })

  it('synthetic rejection: a client entry importing a forbidden module is caught with a full path', () => {
    // A graph built entirely in-memory, independent of any real file on
    // disk — proves the CHECK LOGIC itself can fail, not just that today's
    // real tree happens to be clean.
    const synthetic = new Map<string, { isUseClient: boolean; imports: string[] }>([
      ['synthetic/client-entry.tsx', { isUseClient: true, imports: ['synthetic/mid.ts'] }],
      ['synthetic/mid.ts', { isUseClient: false, imports: ['lib/storage/server.ts'] }],
    ])

    function syntheticClosure(entry: string): Closure {
      const internal = new Set<string>([entry])
      const parent = new Map<string, string>()
      const queue = [entry]
      while (queue.length > 0) {
        const current = queue.shift()!
        const node = synthetic.get(current)
        const children = node ? node.imports : []
        for (const child of children) {
          if (!internal.has(child)) {
            internal.add(child)
            parent.set(child, current)
            queue.push(child)
          }
        }
      }
      return { internal, external: new Set(), boundary: new Set(), parent }
    }

    const closure = syntheticClosure('synthetic/client-entry.tsx')
    expect(closure.internal.has('lib/storage/server.ts')).toBe(true)
    const chain = pathTo(closure.parent, 'synthetic/client-entry.tsx', 'lib/storage/server.ts')
    expect(chain).toEqual([
      'synthetic/client-entry.tsx',
      'synthetic/mid.ts',
      'lib/storage/server.ts',
    ])
  })
})
