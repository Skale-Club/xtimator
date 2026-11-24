import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildCoverage, inventoryRoutes, readPlaywrightReport, routeFromPage, toMarkdown } from './coverage.mjs'

const projects = ['chromium', 'mobile-safari', 'mobile-chrome']
const route = routeFromPage('app/(app)/dashboard/page.tsx')
const inventory = [route, routeFromPage('app/dev/dashboard/page.tsx')]
const scenario = {
  id: 'SESSION-OWNED', titleToken: '[QA:SESSION-OWNED]', requiredForExecution: true, requiredForLaunch: true,
  routes: ['/dashboard'], hypothesis: 'The owner can reach the workspace.', expectedEvidence: 'The normal session reader authenticates the owner.',
}
const manifest = { version: 1, projects, scenarios: [scenario], capabilities: [] }

function passingProject(projectName) {
  return { projectName, status: 'expected', expectedStatus: 'passed', results: [{ status: 'passed', retry: 0, duration: 3, errors: [] }] }
}

function spec(tests = projects.map(passingProject), title = '[QA:SESSION-OWNED] owner reaches the workspace') {
  return { title, ok: true, tests }
}

function report(specs = [spec()], { errors = [], unexpected = 0, flaky = 0 } = {}) {
  return {
    state: 'loaded',
    report: {
      config: { projects: projects.map(name => ({ name })) },
      errors,
      stats: { duration: 200, expected: 3, unexpected, flaky, skipped: 0 },
      suites: [{ specs: [], suites: [{ specs }] }],
    },
  }
}

test('a clean first-attempt result in every browser can satisfy the launch condition', () => {
  const summary = buildCoverage(manifest, inventory, report())
  assert.equal(summary.scenarios[0].verdict, 'passed')
  assert.equal(summary.executionPassed, true)
  assert.equal(summary.publicReady, true)
  assert.equal(summary.gatePassed, true)
  assert.deepEqual(summary.browsers.observed, projects)
  assert.deepEqual(summary.inventory.unmappedRoutes.map(entry => entry.route), ['/dev/dashboard'])
  assert.match(toMarkdown(summary), /\| `\/dev\/dashboard` \| development \| \*\*Unmapped\*\*/)
})

test('a capability may block public launch after the implemented scenarios pass', () => {
  const restricted = {
    ...manifest,
    capabilities: [{ id: 'AI-LIVE', state: 'blocked', requiredForLaunch: true, routes: [], reason: 'Live-provider evidence missing.' }],
  }
  const launch = buildCoverage(restricted, inventory, report())
  assert.equal(launch.executionPassed, true)
  assert.equal(launch.gatePassed, false)
  assert.equal(launch.publicReady, false)

  const execution = buildCoverage(restricted, inventory, report(), { executionOnly: true })
  assert.equal(execution.gatePassed, true)
  assert.equal(execution.publicReady, false)
  assert.equal(buildCoverage(manifest, inventory, report(), { executionOnly: true }).publicReady, false)
})

test('skipped and empty test attempts block the required scenario', () => {
  const chromium = passingProject('chromium')
  const safari = { ...passingProject('mobile-safari'), status: 'skipped', results: [{ status: 'skipped', retry: 0, duration: 0, errors: [] }] }
  const mobile = { ...passingProject('mobile-chrome'), results: [] }
  const summary = buildCoverage(manifest, inventory, report([spec([chromium, safari, mobile])]))
  assert.equal(summary.gatePassed, false)
  assert.equal(summary.scenarios[0].verdict, 'blocked')
  assert.match(summary.scenarios[0].evidence[1].reason, /skipped/)
  assert.match(summary.scenarios[0].evidence[2].reason, /No test attempt/)
})

test('a configured browser cannot satisfy a missing project result', () => {
  const summary = buildCoverage(manifest, inventory, report([spec([passingProject('chromium')])]))
  assert.deepEqual(summary.browsers.configured, projects)
  assert.deepEqual(summary.browsers.observed, ['chromium'])
  assert.deepEqual(summary.scenarios[0].evidence.map(entry => entry.verdict), ['passed', 'blocked', 'blocked'])
  assert.equal(summary.gatePassed, false)
})

test('a declared scenario project override remains visible in the report', () => {
  const desktopOnly = { ...manifest, scenarios: [{ ...scenario, projects: ['chromium'] }] }
  const summary = buildCoverage(desktopOnly, inventory, report([spec([passingProject('chromium')])]))
  assert.deepEqual(summary.browsers.desired, projects)
  assert.deepEqual(summary.scenarios[0].projects, ['chromium'])
  assert.equal(summary.scenarios[0].verdict, 'passed')
})

test('expected failures, retries and flaky results never count as clean passes', () => {
  const chromium = passingProject('chromium')
  const cleanAttempt = chromium.results[0]
  const badAttempt = { ...cleanAttempt, status: 'failed' }
  for (const broken of [
    { ...chromium, expectedStatus: 'failed', results: [badAttempt] },
    { ...chromium, status: 'unexpected', results: [badAttempt] },
    { ...chromium, status: 'flaky', results: [badAttempt, { ...cleanAttempt, retry: 1 }] },
    { ...chromium, results: [{ ...cleanAttempt, retry: 1 }] },
    { ...chromium, results: [cleanAttempt, cleanAttempt] },
  ]) {
    const summary = buildCoverage(manifest, inventory, report([spec([broken, ...projects.slice(1).map(passingProject)])]))
    assert.equal(summary.executionPassed, false)
    assert.equal(summary.scenarios[0].evidence[0].verdict, 'failed')
  }
})

test('duplicate manifest IDs or reported specs cannot produce a pass', () => {
  assert.throws(() => buildCoverage({ ...manifest, scenarios: [scenario, scenario] }, inventory, report()), /unique/)
  const summary = buildCoverage(manifest, inventory, report([spec(), spec()]))
  assert.equal(summary.scenarios[0].verdict, 'failed')
  assert.match(summary.scenarios[0].reason, /more than one/)
  assert.equal(summary.gatePassed, false)
})

test('unrelated passing tests do not satisfy a required scenario', () => {
  const summary = buildCoverage(manifest, inventory, report([spec(undefined, 'owner reaches the workspace')]))
  assert.equal(summary.scenarios[0].verdict, 'blocked')
  assert.equal(summary.gatePassed, false)
})

test('unknown or multiple QA IDs must be fixed before accepting the report', () => {
  for (const title of ['[QA:UNKNOWN] unrelated test', '[QA:SESSION-OWNED] [QA:UNKNOWN] multiple tokens']) {
    const summary = buildCoverage(manifest, inventory, report([spec(), spec(undefined, title)]))
    assert.equal(summary.report.issues.length, 1)
    assert.equal(summary.gatePassed, false)
  }
})

test('runner-level errors block the gate without exposing raw errors', () => {
  const summary = buildCoverage(manifest, inventory, report(undefined, { errors: [{ message: 'Sensitive raw test output' }] }))
  assert.equal(summary.scenarios[0].verdict, 'passed')
  assert.equal(summary.gatePassed, false)
  assert.doesNotMatch(JSON.stringify(summary), /Sensitive raw test output/)
})

test('absent, malformed and completely empty reports block the gate', async () => {
  const absent = await readPlaywrightReport(join(tmpdir(), `xtimator-qa-missing-${randomUUID()}.json`))
  assert.equal(absent.state, 'missing')
  for (const input of [absent, { state: 'loaded', report: {} }, report([])]) {
    const summary = buildCoverage(manifest, inventory, input)
    assert.equal(summary.gatePassed, false)
    assert.equal(summary.scenarios[0].verdict, 'blocked')
    assert.equal(summary.report.issues.length, 1)
  }
})

test('route discovery keeps URL segments and separates admin and development surfaces', () => {
  const routeCases = [
    ['app/page.tsx', '/', 'public'],
    ['app\\(app)\\settings\\(tabs)\\company\\page.tsx', '/settings/company', 'workspace'],
    ['app/(app)/chat/[[...id]]/page.tsx', '/chat/[[...id]]', 'workspace'],
    ['app/estimate/[token]/[estimateSlug]/page.tsx', '/estimate/[token]/[estimateSlug]', 'public'],
    ['app/admin/events/[attemptId]/page.tsx', '/admin/events/[attemptId]', 'admin'],
    ['app/dev/dashboard/page.tsx', '/dev/dashboard', 'development'],
    ['app/(auth)/login/page.tsx', '/login', 'identity'],
  ]
  for (const [source, route, category] of routeCases) assert.deepEqual(routeFromPage(source), { source: source.replaceAll('\\', '/'), route, category })
  assert.equal(routeFromPage('app/api/health/route.ts'), null)
  assert.equal(routeFromPage('app/(app)/api/internal/route.ts'), null)
  assert.deepEqual(routeFromPage('app/(app)/settings/(tabs)/defaults/route.ts'), {
    route: '/settings/defaults', category: 'workspace', kind: 'workspace-handler',
    source: 'app/(app)/settings/(tabs)/defaults/route.ts',
  })
  assert.equal(routeFromPage('app/_internal/page.tsx'), null)
})

test('the actual manifest matches existing page sources and has explicit launch gaps', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const [routes, manifest] = await Promise.all([
    inventoryRoutes(root),
    readFile(join(root, 'tests/qa/manifest.json'), 'utf8').then(JSON.parse),
  ])
  const summary = buildCoverage(manifest, routes, { state: 'missing', reason: 'No test report in this check.' })
  assert.ok(routes.length > 50)
  assert.ok(summary.inventory.unmappedRoutes.length)
  assert.deepEqual(summary.inventory.staleMappings, [])
  assert.ok(summary.capabilities.every(entry => entry.verdict === 'blocked'))
})
