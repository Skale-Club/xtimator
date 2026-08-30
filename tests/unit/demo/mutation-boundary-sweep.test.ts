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
  }[]
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
      continue
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          names.push(declaration.name.text)
        }
      }
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
    .filter((path) => path.endsWith('actions.ts'))
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

function callExpressions(path: string, symbol: string, target: string): ts.CallExpression[] {
  const declaration = parseModule(path).declarations.get(symbol)
  if (!declaration) return []

  const calls: ts.CallExpression[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : null
      if (name === target) calls.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(declaration)
  return calls.sort((left, right) => left.getStart() - right.getStart())
}

function expectCallBefore(
  path: string,
  symbol: string,
  before: string,
  after: string,
) {
  const beforeCall = callExpressions(path, symbol, before)[0]
  const afterCall = callExpressions(path, symbol, after)[0]
  expect(beforeCall, `${path}#${symbol} missing ${before}`).toBeTruthy()
  expect(afterCall, `${path}#${symbol} missing ${after}`).toBeTruthy()
  expect(
    beforeCall!.getStart(),
    `${path}#${symbol} must call ${before} before ${after}`,
  ).toBeLessThan(afterCall!.getStart())
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

function guarded(
  path: string,
  guard: GuardName,
  symbols: string[],
  via?: GuardedCoverage['via'],
): Coverage[] {
  return symbols.map((symbol) => ({
    id: `${path}#${symbol}`,
    disposition: 'guarded',
    guard,
    ...(via ? { via } : {}),
  }))
}

function excepted(
  path: string,
  disposition: ExceptionDisposition,
  authority: string,
  reason: string,
  symbols: string[],
): Coverage[] {
  return symbols.map((symbol) => ({
    id: `${path}#${symbol}`,
    disposition,
    authority,
    reason,
  }))
}

const READ_AUTHORITY = 'Authenticated or public query boundary with no tenant product write'
const READ_REASON =
  'The executable declaration only resolves or returns data and does not mutate tenant product state.'
const ADMIN_AUTHORITY = 'Platform administrator authorization enforced before operator mutation'
const ADMIN_REASON =
  'This operator-only boundary is unavailable to tenant users and public demo principals.'
const AUTH_AUTHORITY = 'Anonymous or callback-driven Supabase authentication lifecycle'
const AUTH_REASON =
  'This boundary establishes or recovers caller authentication without mutating tenant product data.'
const MACHINE_AUTHORITY = 'Machine credential or provider signature verified before execution'
const MACHINE_REASON =
  'This maintenance or transport boundary is not controlled by a tenant demo browser principal.'

/**
 * Every symbol is an explicit literal. Discovery is mechanically derived from
 * executable exports, so adding a boundary cannot silently inherit a file-level
 * classification.
 */
const MUTATION_BOUNDARY_MANIFEST: Coverage[] = [
  ...excepted('app/(auth)/callback/route.ts', 'auth-entry', AUTH_AUTHORITY, AUTH_REASON, ['GET']),
  ...excepted(
    'app/.well-known/oauth-authorization-server/route.ts',
    'read-only',
    READ_AUTHORITY,
    READ_REASON,
    ['GET'],
  ),
  ...excepted(
    'app/.well-known/oauth-protected-resource/route.ts',
    'read-only',
    READ_AUTHORITY,
    READ_REASON,
    ['GET'],
  ),

  ...excepted('app/admin/admins/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'addPlatformAdmin',
    'removePlatformAdmin',
  ]),
  ...excepted('app/admin/billing/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'adjustCredits',
    'forceTier',
    'grantBonusCredits',
    'reconcileCreditBalance',
  ]),
  ...excepted('app/admin/blog/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'createPost',
    'deletePost',
    'togglePostStatus',
    'updatePost',
  ]),
  ...excepted('app/admin/branding/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'saveBranding',
  ]),
  ...excepted('app/admin/companies/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'setByokConfig',
    'setCompanyModelOverride',
    'setDemoEstimateQuota',
  ]),
  ...excepted(
    'app/admin/companies/support-mode-actions.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    ['startSupportSessionAction'],
  ),
  ...excepted('app/admin/integrations/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'deleteIntegrationKey',
    'saveBillingConfig',
    'saveIntegrationKey',
    'saveTelegramChatId',
    'saveTwilioCustomerMessagingServiceSid',
    'saveTwilioFromPhone',
    'saveWhatsAppConfig',
    'saveWhatsAppSystemPrompt',
    'saveXphereBaseUrl',
    'sendTelegramTestAlert',
    'setGlobalOpenRouterModel',
    'setGlobalTranscriptionModel',
    'setPriceResearchSource',
    'testIntegrationKey',
  ]),
  ...excepted(
    'app/admin/integrations/platform-event-actions.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    ['savePlatformEventToggle'],
  ),
  ...excepted('app/admin/knowledge/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'bulkImportEntries',
    'createEntry',
    'deleteEntry',
    'updateEntry',
  ]),
  ...excepted('app/admin/landing/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'saveLandingContent',
  ]),
  ...excepted('app/admin/pages/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'saveLegalPage',
  ]),
  ...excepted('app/admin/seo/actions.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'saveSeo',
  ]),

  ...excepted(
    'app/api/admin/openrouter-models/route.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    ['GET'],
  ),
  ...excepted(
    'app/api/admin/xphere-backfill/route.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    ['POST'],
  ),
  ...guarded('app/api/analyze-photos/route.ts', 'demoGuardResponse', ['POST']),
  ...excepted('app/api/auth/keepalive/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...guarded('app/api/billing/create-autotopup-setup-session/route.ts', 'demoGuardResponse', [
    'POST',
  ]),
  ...guarded('app/api/billing/create-checkout-session/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/billing/create-portal-session/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/billing/create-topup-session/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/chat/route.ts', 'demoGuardResponse', ['POST']),
  ...excepted('app/api/clients/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted(
    'app/api/cron/cleanup-orphan-projects/route.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['GET'],
  ),
  ...guarded('app/api/cron/cleanup-whatsapp-sessions/route.ts', 'assertCompanyWritable', ['GET']),
  ...excepted(
    'app/api/csp-report/route.ts',
    'read-only',
    'Public browser security-report telemetry collector',
    'The declaration records operational CSP telemetry and has no tenant product mutation.',
    ['POST'],
  ),
  ...excepted(
    'app/api/estimates/[id]/pdf/route.ts',
    'read-only',
    READ_AUTHORITY,
    READ_REASON,
    ['GET'],
  ),
  ...guarded('app/api/estimates/[id]/refine/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/estimates/[id]/send-sms/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/estimates/[id]/send-whatsapp/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/estimates/[id]/send/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/estimates/[id]/sign/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/generate-estimate/route.ts', 'demoGuardResponse', ['POST']),
  ...excepted('app/api/health/crons/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted('app/api/health/live/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted('app/api/health/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted('app/api/inngest/route.ts', 'machine-signed', MACHINE_AUTHORITY, MACHINE_REASON, [
    'GET',
    'POST',
    'PUT',
  ]),
  ...excepted('app/api/jobs/[jobId]/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted(
    'app/api/logout/route.ts',
    'demo-exit',
    'Current browser-local Supabase session',
    'Local-scope sign-out clears only the caller browser and cannot revoke another demo visitor session.',
    ['GET'],
  ),
  ...excepted('app/api/mcp/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET', 'OPTIONS']),
  ...excepted(
    'app/api/mcp/route.ts',
    'machine-signed',
    'OAuth bearer authentication at the MCP transport boundary',
    'The transport dispatches authenticated tools; every tenant write tool guards trusted company context.',
    ['POST'],
  ),
  ...guarded('app/api/notifications/[id]/read/route.ts', 'demoGuardResponse', ['PATCH']),
  ...excepted('app/api/notifications/list/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...guarded('app/api/notifications/mark-all-read/route.ts', 'demoGuardResponse', ['POST']),
  ...excepted(
    'app/api/notifications/preferences/route.ts',
    'read-only',
    READ_AUTHORITY,
    READ_REASON,
    ['GET'],
  ),
  ...guarded('app/api/notifications/preferences/route.ts', 'demoGuardResponse', ['PATCH']),
  ...guarded('app/api/notifications/push/subscribe/route.ts', 'demoGuardResponse', [
    'DELETE',
    'POST',
  ]),
  // Structured price-book export for first-party programmatic consumers
  // (Thumb Scrap). Bearer-token authenticated via the same verifyMcpRequest +
  // requireScope('mcp:read') path as /api/mcp; scoped exclusively to
  // auth.company_id from the resolved token, never from request input. A pure
  // read — no tenant product state is mutated.
  ...excepted('app/api/price-book/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  // Phase 189 (v4.24): browser upload tickets. A WRITE boundary — it issues the
  // authority to PUT an object into a tenant's storage prefix, so it is guarded,
  // not read-only, even though it mutates no DB row itself. companyId comes from
  // getActiveCompanyId() and never from the request body; the key is derived
  // (or re-validated) against that company, so a demo or cross-tenant caller
  // cannot obtain a ticket for someone else's prefix.
  ...guarded('app/api/storage/upload-ticket/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/stripe/connect/callback/route.ts', 'demoGuardResponse', ['GET']),
  ...guarded('app/api/stripe/connect/disconnect/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/stripe/connect/initiate/route.ts', 'demoGuardResponse', ['GET']),
  // Phase 193-01 — public engagement beacon collector, no Supabase session
  // (anonymous share-page visitor). Demo posture mirrors
  // app/estimate/[token]/actions.ts: assertCompanyWritable(companyId) after
  // token resolution, before any insert/update. Always 204 regardless.
  ...guarded('app/api/track/estimate/route.ts', 'assertCompanyWritable', ['POST']),
  ...guarded('app/api/transcribe/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/translate/route.ts', 'demoGuardResponse', ['POST']),
  ...guarded('app/api/webhooks/stripe/route.ts', 'assertCompanyWritable', ['POST']),
  ...guarded('app/api/webhooks/twilio/route.ts', 'assertCompanyWritable', ['POST']),
  ...excepted(
    'app/api/webhooks/whatsapp/route.ts',
    'machine-signed',
    'Meta verification token challenge authentication',
    'The GET declaration only completes provider endpoint ownership verification and has no tenant effect.',
    ['GET'],
  ),
  ...guarded('app/api/webhooks/whatsapp/route.ts', 'assertCompanyWritable', ['POST']),
  ...excepted('app/api/whoami/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, ['GET']),
  ...excepted('app/demo/entry/route.ts', 'auth-entry', AUTH_AUTHORITY, AUTH_REASON, ['GET']),

  ...guarded('app/estimate/[token]/actions.ts', 'assertWritable', [
    'logEstimateView',
    'respondToEstimate',
    // Phase 193-02 — unlockEstimate calls assertWritable() directly (same
    // no-arg idiom as logEstimateView/respondToEstimate above: the caller is
    // an anonymous share-page visitor, so this resolves off THAT request's
    // own session, not the locked estimate's owner) before ever writing an
    // unlock_ok/unlock_fail engagement event.
    'unlockEstimate',
  ]),
  ...guarded('app/oauth/authorize/actions.ts', 'assertWritable', ['handleAuthorize']),
  ...guarded('app/oauth/register/route.ts', 'assertWritable', ['POST'], [
    { path: 'lib/oauth/clients.ts', symbol: 'registerClient' },
  ]),
  ...guarded('app/oauth/token/route.ts', 'assertCompanyWritable', ['POST'], [
    { path: 'lib/oauth/codes.ts', symbol: 'consumeAuthorizationCode' },
    { path: 'lib/oauth/tokens.ts', symbol: 'rotateRefreshToken' },
  ]),
  // Phase 187 (v4.24): same-origin asset proxy. GET-only — it streams bytes
  // out of R2 or Supabase Storage and writes nothing. Its own tenant gate
  // (lib/storage/proxy-auth.ts) restricts private buckets to company members,
  // so a demo principal reading through it cannot reach another tenant's
  // objects and cannot mutate anything.
  ...excepted('app/storage/[bucket]/[...key]/route.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'GET',
  ]),

  ...guarded('lib/actions/active-company.ts', 'assertWritable', ['switchActiveCompany']),
  ...excepted('lib/actions/admin-company.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'createAdminCompany',
  ]),
  ...excepted('lib/actions/admin-handoff.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'handoffDemoCompany',
  ]),
  ...excepted(
    'lib/actions/admin-notification-templates.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    ['listNotificationTemplates', 'saveNotificationTemplate', 'sendTestNotification'],
  ),
  ...excepted('lib/actions/admin-whatsapp.ts', 'admin-only', ADMIN_AUTHORITY, ADMIN_REASON, [
    'loadAdminConversationThread',
  ]),
  ...excepted(
    'lib/actions/admin-whatsapp-accounts.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    [
      'removeWhatsAppSender',
      'saveWhatsAppAccount',
      'saveWhatsAppSender',
      'setWhatsAppSenderStatus',
    ],
  ),
  ...excepted(
    'lib/actions/admin-whatsapp-templates.ts',
    'admin-only',
    ADMIN_AUTHORITY,
    ADMIN_REASON,
    [
      'applyTemplateStatusUpdate',
      'checkTemplateStatus',
      'createTemplate',
      'listTemplates',
      'submitTemplateToMeta',
      'updateTemplateAndResubmit',
    ],
  ),
  ...excepted('lib/actions/attempt-outcome.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getAttemptOutcome',
    'getStepMedians',
  ]),
  ...excepted('lib/actions/auth.ts', 'auth-entry', AUTH_AUTHORITY, AUTH_REASON, [
    'resetPassword',
    'signIn',
    'signUp',
  ]),
  ...excepted(
    'lib/actions/auth.ts',
    'demo-exit',
    'Current authenticated Supabase session',
    'Sign-out ends the caller authentication lifecycle without mutating tenant product state.',
    ['signOut'],
  ),
  ...guarded('lib/actions/auth.ts', 'assertWritable', ['updatePassword']),
  ...guarded('lib/actions/auto-topup.ts', 'assertWritable', [
    'disableAutoTopup',
    'saveAutoTopupSettings',
  ]),
  ...guarded('lib/actions/chat.ts', 'assertWritable', [
    'createChatConversation',
    'deleteChatConversation',
    'editChatMessage',
    'truncateChatFrom',
    'voteChatMessage',
  ]),
  ...excepted('lib/actions/chat.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getChatThread',
    'listChatConversations',
    'normalizeChatInput',
    'resolveCurrentEstimateId',
  ]),
  ...guarded('lib/actions/client.ts', 'assertWritable', [
    'createClientAction',
    'deleteClientAction',
    'patchClientContactAction',
    'removeClientLogo',
    'updateClientAction',
    'uploadClientLogoAction',
  ]),
  ...guarded('lib/actions/company-knowledge.ts', 'assertWritable', [
    'createCompanyEntry',
    'deleteCompanyEntry',
    'updateCompanyEntry',
  ]),
  ...guarded('lib/actions/company.ts', 'assertWritable', [
    'createOrUpdateCompany',
    'uploadOnboardingLogoAction',
  ]),
  ...guarded('lib/actions/custom-domain.ts', 'assertWritable', ['saveCustomDomain']),
  ...guarded('lib/actions/estimate-photo.ts', 'assertWritable', [
    'addPhotoToEstimate',
    'removePhotoFromEstimate',
  ]),
  ...excepted('lib/actions/estimate-photo.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getAttachedPhotoIdsAction',
  ]),
  ...guarded('lib/actions/estimate-template.ts', 'assertWritable', ['saveEstimateTemplate']),
  ...guarded('lib/actions/estimate.ts', 'assertWritable', [
    'createBlankEstimate',
    'deleteEstimateItem',
    'deleteEstimateSection',
    'logDeliveryAction',
    'markAsSentAction',
    'saveEstimate',
    'savePresentationSettings',
  ]),
  ...excepted('lib/actions/estimate.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getEstimateByIdAction',
  ]),
  // Phase 193-02 — owner-side share-password set/remove. Guarded by
  // assertCompanyWritable(companyId) (not the bare assertWritable() the rest
  // of this file uses) so a demo tenant can never lock or unlock a share
  // link, matching the plan's explicit demo-guard requirement.
  ...guarded('lib/actions/estimate.ts', 'assertCompanyWritable', [
    'setEstimateSharePassword',
  ]),
  ...guarded('lib/actions/invite-accept.ts', 'assertWritable', ['acceptInvite']),
  ...guarded('lib/actions/invoice.ts', 'assertWritable', ['generateInvoice']),
  ...excepted('lib/actions/invoice.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getInvoicesForEstimate',
  ]),
  ...guarded('lib/actions/photo.ts', 'assertWritable', [
    'createPhoto',
    'deletePhoto',
    'reorderPhotos',
    'updatePhotoCaption',
    'uploadProjectPhoto',
  ]),
  ...guarded('lib/actions/price-book.ts', 'assertWritable', [
    'bulkAdjustPriceBookFolder',
    'commitImportChunk',
    'createFolder',
    'createPriceBookItem',
    'deleteFolder',
    'deleteFolderWithItems',
    'deletePriceBookItem',
    'destroyPriceBookItems',
    'emptyPriceBookTrash',
    'importPriceBookItems',
    'resolveOrCreateFolders',
    'restorePriceBookItems',
    'setItemOptions',
    'trashPriceBookItems',
    'undoLastImport',
    'updateFolder',
    'updatePriceBookItem',
  ]),
  ...excepted('lib/actions/price-book.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'fetchItemOptions',
    'getRecentUndoableImport',
  ]),
  ...guarded('lib/actions/project.ts', 'assertWritable', [
    'archiveProjectAction',
    'createProjectAction',
    'createProjectWithClientAction',
    'deleteProjectAction',
    'duplicateProjectAction',
    'hardDeleteProjectAction',
    'linkProjectToClient',
    'renameProjectAction',
    'restoreProjectAction',
    'resumeOrCreateDraftProjectAction',
    'softDeleteProjectAction',
    'unarchiveProjectAction',
    'unlinkProjectFromClient',
  ]),
  ...excepted('lib/actions/project.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'getMoreProjects',
    'getProjectMinimalAction',
  ]),
  ...guarded('lib/actions/recording.ts', 'assertWritable', [
    'createRecording',
    'createTextRecording',
    'deleteRecording',
    'reportClientPipelineFailure',
    'startRecordingPipeline',
    'transcribeRecording',
    'updateTranscript',
  ]),
  ...guarded('lib/actions/settings.ts', 'assertWritable', [
    'applyTradeSuggestion',
    'changeEmail',
    'changePassword',
    'deleteAccount',
    'dismissTradeSuggestion',
    'updateCompanySettings',
    'updateDefaults',
    'updateDeliverySettings',
    'updateEstimateTerms',
    'updateNotifications',
    'updateProfile',
  ]),
  ...guarded('lib/actions/team.ts', 'assertWritable', [
    'changeMemberRole',
    'inviteMember',
    'removeMember',
    'revokeInvite',
  ]),
  ...guarded('lib/actions/theme.ts', 'assertWritable', ['saveThemePreference']),
  ...guarded('lib/actions/tour.ts', 'assertWritable', ['logTourEvent']),
  ...excepted(
    'lib/demo/actions.ts',
    'demo-exit',
    'Current browser-local Supabase session',
    'This action clears only the caller session and redirects to a validated signup origin.',
    ['exitDemoToSignup'],
  ),

  ...guarded('lib/agent-tools/add-knowledge.ts', 'assertCompanyWritable', [
    'addCompanyKnowledge',
  ]),
  ...excepted('lib/agent-tools/ask-knowledge.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'askKnowledge',
  ]),
  ...guarded('lib/agent-tools/create-estimate.ts', 'assertCompanyWritable', ['createEstimate']),
  ...guarded('lib/agent-tools/create-project.ts', 'assertCompanyWritable', ['createProject']),
  ...guarded('lib/agent-tools/create-service.ts', 'assertCompanyWritable', [
    'createPriceBookService',
  ]),
  ...excepted('lib/agent-tools/normalize-input.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'normalizeInput',
  ]),
  ...excepted(
    'lib/agent-tools/query-company-data.ts',
    'read-only',
    READ_AUTHORITY,
    READ_REASON,
    [
      'findClientByName',
      'findServiceByName',
      'getLatestEstimateForClient',
      'getProjectStatus',
      'listRecentEstimates',
      'listServices',
    ],
  ),
  ...guarded('lib/agent-tools/send-customer-message.ts', 'assertCompanyWritable', [
    'cancelSendByChannelRef',
    'confirmSendByChannelRef',
    'confirmSendByToken',
    'draftCustomerMessage',
  ]),
  ...guarded('lib/chat/tools.ts', 'assertCompanyWritable', ['buildChatTools']),

  ...guarded('lib/inngest/functions/analyze-photos.ts', 'assertCompanyWritable', [
    'analyzePhotosJob',
  ]),
  ...excepted(
    'lib/inngest/functions/cleanup-audio.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['cleanupAudioJob'],
  ),
  // Phase 193-01 — the actual Resend send is best-effort (never throws) and
  // gated on the company's own notify_on_view/email prefs, but it is still a
  // real external side effect for a tenant, so this is guarded like the
  // other notification workers rather than machine-signed/excepted.
  ...guarded(
    'lib/inngest/functions/estimate-viewed-notification.ts',
    'assertCompanyWritable',
    ['estimateViewedNotificationJob'],
  ),
  ...guarded('lib/inngest/functions/generate-estimate.ts', 'assertCompanyWritable', [
    'generateEstimateJob',
  ]),
  ...excepted(
    'lib/inngest/functions/monthly-credit-grant.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['monthlyCreditGrantJob'],
  ),
  // Read-only reconciliation cron: reports drift via notifyOps, never writes a
  // tenant row, so there is no demo-write surface to guard.
  ...excepted(
    'lib/inngest/functions/billing-reconciliation.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['billingReconciliationJob'],
  ),
  ...guarded(
    'lib/inngest/functions/notification-channel-send.ts',
    'assertCompanyWritable',
    ['notificationChannelSend'],
  ),
  ...excepted(
    'lib/inngest/functions/notification-cleanup.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['notificationCleanup'],
  ),
  ...guarded(
    'lib/inngest/functions/notification-email-digest.ts',
    'assertCompanyWritable',
    ['notificationEmailDigest'],
  ),
  ...excepted(
    'lib/inngest/functions/pipeline-watchdog.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['pipelineWatchdogJob'],
  ),
  ...excepted(
    'lib/inngest/functions/retention-cleanup.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['retentionCleanupJob'],
  ),
  ...excepted(
    'lib/inngest/functions/storage-orphan-cleanup.ts',
    'machine-signed',
    MACHINE_AUTHORITY,
    MACHINE_REASON,
    ['storageOrphanCleanupJob'],
  ),
  ...guarded('lib/inngest/functions/transcribe-audio.ts', 'assertCompanyWritable', [
    'transcribeAudioJob',
  ]),
  ...guarded('lib/inngest/functions/whatsapp-process.ts', 'assertCompanyWritable', [
    'whatsAppIntentRouterJob',
    'whatsAppProcessJob',
  ]),
  ...guarded('lib/inngest/functions/xphere-sync.ts', 'assertCompanyWritable', ['xphereSyncJob']),

  ...guarded('lib/integrations/xphere/dispatch.ts', 'assertCompanyWritable', [
    'dispatchXphereSync',
  ]),
  ...guarded('lib/mcp/tools/write.ts', 'assertCompanyWritable', ['buildWriteTools']),
  ...guarded('lib/notifications/customer-send.ts', 'assertCompanyWritable', [
    'sendCustomerMessage',
  ]),
  ...guarded('lib/notifications/dispatch.ts', 'assertCompanyWritable', ['notify']),

  ...excepted('lib/oauth/clients.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'findClientByClientId',
    'isRegisteredRedirectUri',
    'validateRegistrationPayload',
  ]),
  ...guarded('lib/oauth/clients.ts', 'assertWritable', ['registerClient']),
  ...guarded('lib/oauth/codes.ts', 'assertCompanyWritable', ['consumeAuthorizationCode']),
  ...guarded('lib/oauth/codes.ts', 'assertWritable', ['issueAuthorizationCode']),
  ...excepted('lib/oauth/tokens.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'generateOpaqueToken',
    'hashToken',
    'resolveAccessToken',
    'resolveRefreshToken',
  ]),
  ...guarded('lib/oauth/tokens.ts', 'assertWritable', ['issueTokenPair']),
  ...guarded('lib/oauth/tokens.ts', 'assertCompanyWritable', [
    'revokeRefreshToken',
    'rotateRefreshToken',
  ]),

  ...guarded('lib/queries/chat.ts', 'assertCompanyWritable', [
    'appendMessage',
    'createConversation',
    'deleteConversation',
    'deleteMessagesFrom',
    'updateMessageParts',
    'upsertMessageVote',
  ]),
  ...excepted('lib/queries/chat.ts', 'read-only', READ_AUTHORITY, READ_REASON, [
    'findMessageRow',
    'getConversationWithMessages',
    'listConversations',
    'listMessageVotes',
    'ownsConversation',
  ]),
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
        for (const evidence of entry.via) {
          expect(
            callsSymbol(path!, symbol!, evidence.symbol),
            `${entry.id} does not call ${evidence.symbol}`,
          ).toBe(true)
          expect(
            reachesGuard(evidence.path, evidence.symbol, entry.guard),
            `${evidence.path}#${evidence.symbol} does not reach ${entry.guard}`,
          ).toBe(true)
        }
      } else {
        expect(
          reachesGuard(path!, symbol!, entry.guard),
          `${entry.id} does not reach ${entry.guard}`,
        ).toBe(true)
      }
    }
  })

  it('keeps newly discovered guards before product effects in executable order', () => {
    expectCallBefore(
      'app/api/stripe/connect/callback/route.ts',
      'GET',
      'demoGuardResponse',
      'exchangeCode',
    )
    expectCallBefore(
      'app/api/webhooks/twilio/route.ts',
      'POST',
      'verifyTwilioSignature',
      'assertCompanyWritable',
    )
    expectCallBefore(
      'app/api/webhooks/twilio/route.ts',
      'POST',
      'assertCompanyWritable',
      'update',
    )
    expectCallBefore(
      'app/api/webhooks/twilio/route.ts',
      'POST',
      'assertCompanyWritable',
      'insert',
    )
    expectCallBefore(
      'app/api/webhooks/whatsapp/route.ts',
      'handleInboundMessage',
      'assertCompanyWritable',
      'rateLimit',
    )
    expectCallBefore(
      'app/api/webhooks/whatsapp/route.ts',
      'handleInboundMessage',
      'assertCompanyWritable',
      'insert',
    )
    expectCallBefore(
      'app/api/cron/cleanup-whatsapp-sessions/route.ts',
      'GET',
      'assertCompanyWritable',
      'sendWhatsAppMessage',
    )
  })

  it('keeps shared-demo logout scoped to the current browser session', () => {
    const signOut = callExpressions('app/api/logout/route.ts', 'GET', 'signOut')[0]
    expect(signOut, 'logout GET missing Supabase signOut call').toBeTruthy()
    const options = signOut!.arguments[0]
    expect(ts.isObjectLiteralExpression(options), 'signOut options must be an object').toBe(true)
    const scope = ts.isObjectLiteralExpression(options)
      ? options.properties.find(
          (property): property is ts.PropertyAssignment =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === 'scope',
        )
      : undefined
    expect(scope, 'signOut must declare a scope').toBeTruthy()
    expect(
      scope && ts.isStringLiteral(scope.initializer) ? scope.initializer.text : null,
    ).toBe('local')
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
