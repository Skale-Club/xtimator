import { readFileSync, readdirSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../..')
const HTTP_HANDLERS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
const CANONICAL_GUARDS = new Set([
  'assertWritable',
  'assertCompanyWritable',
  'demoGuardResponse',
])

type GuardName = 'assertWritable' | 'assertCompanyWritable' | 'demoGuardResponse'
type ExceptionDisposition =
  | 'read-only'
  | 'auth-entry'
  | 'machine-signed'
  | 'admin-only'
  | 'demo-exit'

type Boundary = {
  id: string
  path: string
  symbol: string
}

type GuardedCoverage = {
  id: string
  disposition: 'guarded'
  guard: GuardName
  /**
   * Optional cross-module guard owner. The discovered boundary must call the
   * named symbol, and that target must reach the canonical guard.
   */
  via?: {
    path: string
    symbol: string
  }
}

type ExceptionCoverage = {
  id: string
  disposition: ExceptionDisposition
  authority: string
  reason: string
}

type Coverage = GuardedCoverage | ExceptionCoverage

type ParsedModule = {
  sourceFile: ts.SourceFile
  declarations: Map<string, ts.Node>
}

const parsedModules = new Map<string, ParsedModule>()

function repoPath(absolutePath: string): string {
  return relative(ROOT, absolutePath).replaceAll('\\', '/')
}

function walk(directory: string): string[] {
  return readdirSync(resolve(ROOT, directory), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort()
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? (ts.getModifiers(node) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    : false
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text]
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name),
  )
}

function parseModule(path: string): ParsedModule {
  const cached = parsedModules.get(path)
  if (cached) return cached

  const source = readFileSync(resolve(ROOT, path), 'utf8')
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const declarations = new Map<string, ts.Node>()

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement)
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) {
          declarations.set(name, declaration)
        }
      }
    }
  }

  const parsed = { sourceFile, declarations }
  parsedModules.set(path, parsed)
  return parsed
}

function exportedFunctions(path: string): string[] {
  const { sourceFile } = parseModule(path)
  const names: string[] = []

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasExportModifier(statement)
    ) {
      names.push(statement.name.text)
    }
  }

  return names.sort()
}

function exportedHttpHandlers(path: string): string[] {
  const { sourceFile } = parseModule(path)
  const names: string[] = []

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      hasExportModifier(statement) &&
      HTTP_HANDLERS.has(statement.name.text)
    ) {
      names.push(statement.name.text)
      continue
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        names.push(
          ...bindingNames(declaration.name).filter((name) => HTTP_HANDLERS.has(name)),
        )
      }
    }
  }

  return names.sort()
}

function exportedInngestJobs(path: string): string[] {
  const { sourceFile } = parseModule(path)
  const names: string[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer?.getText(sourceFile).includes('inngest.createFunction')
      ) {
        names.push(declaration.name.text)
      }
    }
  }

  return names.sort()
}

function boundaries(path: string, symbols: string[]): Boundary[] {
  return symbols.map((symbol) => ({
    id: `${path}#${symbol}`,
    path,
    symbol,
  }))
}

const ACTION_FILES = [
  ...walk('lib/actions'),
  resolve(ROOT, 'lib/demo/actions.ts'),
  ...walk('app')
    .map(repoPath)
    .filter((path) => path.endsWith('/actions.ts'))
    .map((path) => resolve(ROOT, path)),
].map(repoPath)

const ROUTE_FILES = walk('app')
  .map(repoPath)
  .filter((path) => path.endsWith('/route.ts'))

const SERVICE_FILES = [
  'lib/mcp/tools/write.ts',
  ...walk('lib/agent-tools')
    .map(repoPath)
    .filter((path) => !path.endsWith('/index.ts')),
  'lib/queries/chat.ts',
  'lib/chat/tools.ts',
  'lib/notifications/customer-send.ts',
  'lib/notifications/dispatch.ts',
  'lib/integrations/xphere/dispatch.ts',
  'lib/oauth/codes.ts',
  'lib/oauth/tokens.ts',
  'lib/oauth/clients.ts',
]

function discoverBoundaries(): Boundary[] {
  const actions = ACTION_FILES.flatMap((path) =>
    boundaries(path, exportedFunctions(path)),
  )
  const routes = ROUTE_FILES.flatMap((path) =>
    boundaries(path, exportedHttpHandlers(path)),
  )
  const services = SERVICE_FILES.flatMap((path) =>
    boundaries(path, exportedFunctions(path)),
  )
  const jobs = walk('lib/inngest/functions')
    .map(repoPath)
    .flatMap((path) => boundaries(path, exportedInngestJobs(path)))

  return [...actions, ...routes, ...services, ...jobs].sort((a, b) =>
    a.id.localeCompare(b.id),
  )
}

function calledIdentifiers(node: ts.Node): Set<string> {
  const calls = new Set<string>()

  function visit(current: ts.Node) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      calls.add(current.expression.text)
    }
    ts.forEachChild(current, visit)
  }

  visit(node)
  return calls
}

function reachesGuard(
  path: string,
  symbol: string,
  expectedGuard: GuardName,
  seen = new Set<string>(),
): boolean {
  const key = `${path}#${symbol}`
  if (seen.has(key)) return false
  seen.add(key)

  const parsed = parseModule(path)
  const declaration = parsed.declarations.get(symbol)
  if (!declaration) return false

  const calls = calledIdentifiers(declaration)
  if (calls.has(expectedGuard)) return true

  return [...calls].some(
    (called) =>
      !CANONICAL_GUARDS.has(called) &&
      parsed.declarations.has(called) &&
      reachesGuard(path, called, expectedGuard, seen),
  )
}

function callsSymbol(path: string, symbol: string, target: string): boolean {
  const parsed = parseModule(path)
  const declaration = parsed.declarations.get(symbol)
  if (!declaration) return false

  const seen = new Set<string>()
  function search(currentSymbol: string): boolean {
    if (seen.has(currentSymbol)) return false
    seen.add(currentSymbol)
    const current = parsed.declarations.get(currentSymbol)
    if (!current) return false
    const calls = calledIdentifiers(current)
    return calls.has(target) || [...calls].some(search)
  }

  return search(symbol)
}

function manifestDiff(discovered: Boundary[], manifest: Coverage[]) {
  const discoveredIds = new Set(discovered.map((boundary) => boundary.id))
  const manifestIds = new Set(manifest.map((entry) => entry.id))
  return {
    duplicateManifestIds: manifest
      .map((entry) => entry.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index),
    missing: [...discoveredIds].filter((id) => !manifestIds.has(id)).sort(),
    stale: [...manifestIds].filter((id) => !discoveredIds.has(id)).sort(),
  }
}

/**
 * RED scaffold: representative rows exercise every allowed disposition and
 * the shared-helper/cross-module guard model. Task 2 completes this explicit
 * table so discovered-set equality becomes the CI drift gate.
 */
const MUTATION_BOUNDARY_MANIFEST: Coverage[] = [
  {
    id: 'lib/actions/company-knowledge.ts#createCompanyEntry',
    disposition: 'guarded',
    guard: 'assertWritable',
  },
  {
    id: 'lib/actions/auth.ts#signIn',
    disposition: 'auth-entry',
    authority: 'Anonymous Supabase authentication entry',
    reason: 'Creates a caller session but has no authenticated tenant product mutation.',
  },
  {
    id: 'app/api/health/route.ts#GET',
    disposition: 'read-only',
    authority: 'Public operational health probe',
    reason: 'Reads deployment and dependency health without mutating tenant product state.',
  },
  {
    id: 'app/api/admin/xphere-backfill/route.ts#POST',
    disposition: 'admin-only',
    authority: 'requireAdmin platform-admin authorization',
    reason: 'Operator backfill is unavailable to tenant and public demo principals.',
  },
  {
    id: 'app/api/inngest/route.ts#POST',
    disposition: 'machine-signed',
    authority: 'Inngest serve adapter signature verification',
    reason: 'Dispatch transport has no direct tenant effect; product workers guard trusted company context.',
  },
  {
    id: 'lib/demo/actions.ts#exitDemoToSignup',
    disposition: 'demo-exit',
    authority: 'Current host-local Supabase session',
    reason: 'Only clears the caller local session and redirects to a validated apex signup origin.',
  },
]

describe('Phase 180 mutation-boundary census', () => {
  const discovered = discoverBoundaries()

  it('discovers every planned D-08 through D-10 boundary family from executable declarations', () => {
    expect(discovered.map((boundary) => boundary.id)).toEqual(
      expect.arrayContaining([
        'lib/actions/company-knowledge.ts#createCompanyEntry',
        'lib/actions/custom-domain.ts#saveCustomDomain',
        'lib/actions/estimate-photo.ts#addPhotoToEstimate',
        'lib/actions/estimate-template.ts#saveEstimateTemplate',
        'lib/actions/photo.ts#uploadProjectPhoto',
        'lib/actions/recording.ts#startRecordingPipeline',
        'lib/actions/tour.ts#logTourEvent',
        'lib/actions/auto-topup.ts#saveAutoTopupSettings',
        'app/api/webhooks/stripe/route.ts#POST',
        'app/api/mcp/route.ts#POST',
        'app/oauth/authorize/actions.ts#handleAuthorize',
        'lib/mcp/tools/write.ts#buildWriteTools',
        'lib/agent-tools/create-estimate.ts#createEstimate',
        'lib/queries/chat.ts#appendMessage',
        'lib/chat/tools.ts#buildChatTools',
        'lib/notifications/customer-send.ts#sendCustomerMessage',
        'lib/notifications/dispatch.ts#notify',
        'lib/integrations/xphere/dispatch.ts#dispatchXphereSync',
        'lib/inngest/functions/generate-estimate.ts#generateEstimateJob',
      ]),
    )
  })

  it('requires exact discovered-set equality with the explicit manifest', () => {
    expect(manifestDiff(discovered, MUTATION_BOUNDARY_MANIFEST)).toEqual({
      duplicateManifestIds: [],
      missing: [],
      stale: [],
    })
  })

  it('requires executable canonical guard evidence for every guarded row', () => {
    for (const entry of MUTATION_BOUNDARY_MANIFEST) {
      if (entry.disposition !== 'guarded') continue
      const [path, symbol] = entry.id.split('#')
      expect(path && symbol, entry.id).toBeTruthy()

      if (entry.via) {
        expect(
          callsSymbol(path!, symbol!, entry.via.symbol),
          `${entry.id} does not call ${entry.via.symbol}`,
        ).toBe(true)
        expect(
          reachesGuard(entry.via.path, entry.via.symbol, entry.guard),
          `${entry.via.path}#${entry.via.symbol} does not reach ${entry.guard}`,
        ).toBe(true)
      } else {
        expect(
          reachesGuard(path!, symbol!, entry.guard),
          `${entry.id} does not reach ${entry.guard}`,
        ).toBe(true)
      }
    }
  })

  it('requires reasoned authority and no-effect rationale for every exception', () => {
    for (const entry of MUTATION_BOUNDARY_MANIFEST) {
      if (entry.disposition === 'guarded') continue
      expect(entry.authority.trim().length, `${entry.id} authority`).toBeGreaterThan(12)
      expect(entry.reason.trim().length, `${entry.id} rationale`).toBeGreaterThan(24)
    }
  })

  it('rejects a synthetic unclassified boundary', () => {
    const synthetic = {
      id: 'app/api/synthetic/route.ts#POST',
      path: 'app/api/synthetic/route.ts',
      symbol: 'POST',
    }
    expect(manifestDiff([...discovered, synthetic], MUTATION_BOUNDARY_MANIFEST).missing).toContain(
      synthetic.id,
    )
  })
})
