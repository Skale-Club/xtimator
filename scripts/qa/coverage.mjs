import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const identifier = /^[A-Z][A-Z0-9-]*$/
const projectName = /^[a-zA-Z0-9_-]+$/

export function routeFromPage(source) {
  const directories = source.replaceAll('\\', '/').split('/')
  if (directories.shift() !== 'app' || directories.pop() !== 'page.tsx') return null
  if (directories.some(segment => segment.startsWith('_'))) return null
  const route = '/' + directories.filter(segment => !/^\([^/]+\)$/.test(segment) && !segment.startsWith('@')).join('/')
  let category = 'public'
  if (route === '/dev' || route.startsWith('/dev/')) category = 'development'
  else if (route === '/admin' || route.startsWith('/admin/')) category = 'admin'
  else if (directories.includes('(app)') || directories.includes('(capture)')) category = 'workspace'
  else if (directories.includes('(auth)') || /^\/(onboarding$|invite\/|oauth\/)/.test(route)) category = 'identity'
  return { route, category, source: source.replaceAll('\\', '/') }
}

export async function inventoryRoutes(root) {
  const entries = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('_')) await visit(path)
      else if (entry.isFile() && entry.name === 'page.tsx') entries.push(routeFromPage(relative(root, path)))
    }
  }
  await visit(resolve(root, 'app'))
  return entries.filter(Boolean).sort((first, second) => first.route.localeCompare(second.route) || first.source.localeCompare(second.source))
}

export async function readPlaywrightReport(path) {
  let content
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { state: 'missing', reason: 'The Playwright JSON report is absent.' }
    return { state: 'unreadable', reason: 'The Playwright JSON report could not be read.' }
  }
  try {
    return { state: 'loaded', report: JSON.parse(content) }
  } catch {
    return { state: 'invalid', reason: 'The Playwright report is not valid JSON.' }
  }
}

function validProjects(projects) {
  return Array.isArray(projects) && projects.length > 0 && projects.every(name => typeof name === 'string' && projectName.test(name))
    && new Set(projects).size === projects.length
}

function validateManifest(manifest) {
  if (manifest?.version !== 1 || !validProjects(manifest.projects) || !Array.isArray(manifest.scenarios)
      || !manifest.scenarios.length || !Array.isArray(manifest.capabilities)) {
    throw new Error('Invalid QA manifest structure or browser matrix.')
  }
  const ids = new Set()
  for (const entry of [...manifest.scenarios, ...manifest.capabilities]) {
    if (!entry || typeof entry.id !== 'string' || !identifier.test(entry.id) || ids.has(entry.id)) {
      throw new Error('QA manifest IDs must be unique and uppercase.')
    }
    ids.add(entry.id)
    if (typeof entry.requiredForLaunch !== 'boolean' || !Array.isArray(entry.routes)
        || entry.routes.some(route => typeof route !== 'string' || !route.startsWith('/'))) {
      throw new Error(`Invalid launch requirement or route mapping for ${entry.id}.`)
    }
  }
  for (const scenario of manifest.scenarios) {
    if (scenario.titleToken !== `[QA:${scenario.id}]` || typeof scenario.requiredForExecution !== 'boolean'
        || typeof scenario.hypothesis !== 'string' || !scenario.hypothesis.trim()
        || typeof scenario.expectedEvidence !== 'string' || !scenario.expectedEvidence.trim()
        || (scenario.projects !== undefined && (!validProjects(scenario.projects) || scenario.projects.some(name => !manifest.projects.includes(name))))) {
      throw new Error(`Invalid evidence contract for ${scenario.id}.`)
    }
  }
  const scenarioIds = new Set(manifest.scenarios.map(scenario => scenario.id))
  for (const capability of manifest.capabilities) {
    const unresolved = ['blocked', 'unimplemented'].includes(capability.state) && capability.reason
    const linked = capability.state === 'evidence-required' && Array.isArray(capability.scenarioIds)
      && capability.scenarioIds.length > 0 && capability.scenarioIds.every(id => scenarioIds.has(id))
    if (!unresolved && !linked) throw new Error(`Invalid capability evidence contract for ${capability.id}.`)
  }
}

function collectSpecs(suites) {
  if (!Array.isArray(suites)) throw new Error('Invalid Playwright suites.')
  const specs = []
  for (const suite of suites) {
    if (!Array.isArray(suite?.specs)) throw new Error('Invalid Playwright specs.')
    for (const spec of suite.specs) {
      if (typeof spec?.title !== 'string' || !Array.isArray(spec.tests)) throw new Error('Invalid Playwright test records.')
      specs.push(spec)
    }
    if (suite.suites !== undefined) specs.push(...collectSpecs(suite.suites))
  }
  return specs
}

function inspectReport(input, knownIds) {
  const issues = []
  const matchingSpecs = new Map()
  const configuredProjects = []
  const observedProjects = new Set()
  if (input.state !== 'loaded') {
    return { state: input.state, issues: [input.reason], matchingSpecs, configuredProjects, observedProjects: [], durationMs: null }
  }

  const report = input.report
  let specs
  try {
    if (!Array.isArray(report?.errors) || !Array.isArray(report.config?.projects)
        || !Number.isFinite(report.stats?.duration) || report.stats.duration < 0
        || !['expected', 'skipped', 'unexpected', 'flaky'].every(key => Number.isInteger(report.stats[key]) && report.stats[key] >= 0)) {
      throw new Error('Invalid Playwright report envelope.')
    }
    specs = collectSpecs(report.suites)
  } catch {
    return { state: 'invalid', issues: ['The Playwright report has an invalid structure.'], matchingSpecs, configuredProjects, observedProjects: [], durationMs: null }
  }

  for (const project of report.config.projects) {
    if (typeof project?.name === 'string' && projectName.test(project.name)) configuredProjects.push(project.name)
  }
  if (report.errors.length) issues.push('Playwright reported runner or setup errors.')
  if (report.stats.unexpected || report.stats.flaky) issues.push('Playwright reported unexpected or flaky results.')
  if (!specs.length) issues.push('The Playwright report contains no tests.')

  for (const spec of specs) {
    for (const test of spec.tests) {
      if (typeof test?.projectName === 'string' && projectName.test(test.projectName)) observedProjects.add(test.projectName)
    }
    const ids = Array.from(spec.title.matchAll(/\[QA:([^\]]+)\]/g), match => match[1])
    if (ids.length > 1) {
      issues.push('A test title contains multiple QA IDs.')
      continue
    }
    const id = ids[0]
    if (!id) continue
    if (!knownIds.has(id)) {
      issues.push('A test title contains a QA ID absent from the manifest.')
      continue
    }
    const matches = matchingSpecs.get(id) ?? []
    matches.push(spec)
    matchingSpecs.set(id, matches)
  }

  return {
    state: 'loaded', issues: [...new Set(issues)], matchingSpecs,
    configuredProjects: [...new Set(configuredProjects)], observedProjects: [...observedProjects],
    durationMs: report.stats.duration,
  }
}

function projectEvidence(tests, project) {
  const matches = tests.filter(test => test?.projectName === project)
  const evidence = { project, verdict: 'blocked' }
  if (!matches.length) return { ...evidence, reason: 'Missing project result.' }
  if (matches.length !== 1) return { ...evidence, reason: 'Duplicate test results for this project.' }

  const test = matches[0]
  const result = test.results?.[0]
  if (!Array.isArray(test.results) || !test.results.length) return { ...evidence, reason: 'No test attempt was recorded.' }
  if (test.status === 'skipped' || result?.status === 'skipped') return { ...evidence, reason: 'Playwright skipped the test.' }
  if (test.status === 'flaky' || test.results.length !== 1 || (typeof result?.retry === 'number' && result.retry !== 0)) {
    return { ...evidence, verdict: 'failed', reason: 'Flaky result or retry detected.' }
  }
  if (test.status !== 'expected' || test.expectedStatus !== 'passed' || result?.status !== 'passed' || result.retry !== 0
      || result.error != null || !Array.isArray(result.errors) || result.errors.length
      || !Number.isFinite(result.duration) || result.duration < 0) {
    return { ...evidence, verdict: 'failed', reason: 'A clean first-attempt pass was not recorded.' }
  }
  return { project, verdict: 'passed', durationMs: result.duration, attachments: Array.isArray(result.attachments) ? result.attachments.length : 0 }
}

function evaluateScenario(scenario, projects, matches) {
  const spec = matches.length === 1 ? matches[0] : null
  const evidence = projects.map(project => projectEvidence(spec?.tests ?? [], project))
  const verdicts = evidence.map(project => project.verdict)
  if (matches.length > 1) {
    return { ...scenario, projects, evidence, verdict: 'failed', reason: 'The QA ID matches more than one test title.' }
  }
  if (!spec) return { ...scenario, projects, evidence, verdict: 'blocked', reason: 'No test has the required title token.' }
  if (verdicts.includes('failed')) return { ...scenario, projects, evidence, verdict: 'failed', reason: 'A required browser project failed.' }
  if (verdicts.includes('blocked')) return { ...scenario, projects, evidence, verdict: 'blocked', reason: 'A required browser project lacks a clean result.' }
  if (spec.ok !== true) return { ...scenario, projects, evidence, verdict: 'failed', reason: 'Playwright did not mark this test spec OK.' }
  return { ...scenario, projects, evidence, verdict: 'passed' }
}

function routeMappings(inventory, scenarios, capabilities) {
  return inventory.map(entry => ({
    ...entry,
    scenarios: scenarios.filter(scenario => scenario.routes.includes(entry.route)).map(scenario => scenario.id),
    capabilities: capabilities.filter(capability => capability.routes.includes(entry.route)).map(capability => capability.id),
  }))
}

export function buildCoverage(manifest, inventory, input, { executionOnly = false } = {}) {
  validateManifest(manifest)
  const report = inspectReport(input, new Set(manifest.scenarios.map(scenario => scenario.id)))
  const scenarios = manifest.scenarios.map(scenario => evaluateScenario(
    scenario, scenario.projects ?? manifest.projects, report.matchingSpecs.get(scenario.id) ?? [],
  ))
  const capabilities = manifest.capabilities.map(capability => {
    if (capability.state !== 'evidence-required') return { ...capability, verdict: 'blocked' }
    const passed = capability.scenarioIds.every(id => scenarios.find(scenario => scenario.id === id)?.verdict === 'passed')
    return { ...capability, verdict: passed ? 'passed' : 'blocked', ...(passed ? {} : { reason: 'Required linked scenario evidence is missing.' }) }
  })
  const routes = routeMappings(inventory, scenarios, capabilities)
  const knownRoutes = new Set(routes.map(entry => entry.route))
  const staleMappings = [...new Set([...scenarios, ...capabilities].flatMap(entry => entry.routes).filter(route => !knownRoutes.has(route)))].sort()
  if (staleMappings.length) report.issues.push('The manifest maps routes absent from the source inventory.')

  const executionPassed = !report.issues.length && scenarios.every(scenario => !scenario.requiredForExecution || scenario.verdict === 'passed')
  const publicReady = !executionOnly && executionPassed
    && scenarios.every(scenario => !scenario.requiredForLaunch || scenario.verdict === 'passed')
    && capabilities.every(capability => !capability.requiredForLaunch || capability.verdict === 'passed')

  return {
    version: 1,
    mode: executionOnly ? 'execution-only' : 'public-launch',
    executionPassed,
    publicReady,
    gatePassed: executionOnly ? executionPassed : publicReady,
    report: { state: report.state, issues: report.issues, durationMs: report.durationMs },
    browsers: { desired: manifest.projects, configured: report.configuredProjects, observed: report.observedProjects },
    scenarios,
    capabilities,
    inventory: { routes, unmappedRoutes: routes.filter(entry => !entry.scenarios.length), staleMappings },
  }
}

export function toMarkdown(summary) {
  const code = value => '`' + value + '`'
  const lines = [
    '# Xtimator QA evidence', '',
    `Mode **${summary.mode}**`,
    `Initial campaign **${summary.executionPassed ? 'passed' : 'blocked'}**`,
    `Public launch **${summary.publicReady ? 'ready' : 'blocked'}**`, '',
    `Desired browser projects ${summary.browsers.desired.join(', ')}.`,
    `Configured browser projects ${summary.browsers.configured.join(', ') || 'unavailable'}.`,
    `Reported browser projects ${summary.browsers.observed.join(', ') || 'none'}.`,
    `Recorded Playwright duration ${summary.report.durationMs === null ? 'unavailable' : `${summary.report.durationMs} ms`}.`, '',
  ]
  if (summary.report.issues.length) {
    lines.push('## Report issues', '', ...summary.report.issues.map(issue => `- ${issue}`), '')
  }
  lines.push('## Initial campaign', '')
  for (const scenario of summary.scenarios) {
    lines.push(`### ${scenario.id} · ${scenario.verdict}`, '', scenario.hypothesis, '', scenario.expectedEvidence, '')
    if (scenario.reason) lines.push(scenario.reason, '')
    for (const evidence of scenario.evidence) {
      const result = evidence.reason ?? `${evidence.durationMs} ms, ${evidence.attachments} attachments.`
      lines.push(`- ${code(evidence.project)} · ${evidence.verdict}. ${result}`)
    }
    lines.push('')
  }
  lines.push('## Launch capabilities', '')
  for (const capability of summary.capabilities) {
    lines.push(`- **${capability.id}** · ${capability.state} · ${capability.verdict}.${capability.reason ? ` ${capability.reason}` : ''}`)
  }
  const { routes, unmappedRoutes, staleMappings } = summary.inventory
  lines.push('', '## Route inventory', '',
    `Discovered ${routes.length} page sources. ${unmappedRoutes.length} have no scenario mapping. A mapping identifies intended evidence for a page and does not establish coverage of every page state, interaction, API or job.`, '',
    '| Route | Surface | Scenario IDs | Capability gates | Source |', '| --- | --- | --- | --- | --- |')
  for (const entry of routes) {
    lines.push(`| ${code(entry.route)} | ${entry.category} | ${entry.scenarios.join(', ') || '**Unmapped**'} | ${entry.capabilities.join(', ') || '—'} | ${code(entry.source)} |`)
  }
  if (staleMappings.length) lines.push('', `Routes missing from source ${staleMappings.map(code).join(', ')}.`)
  return lines.join('\n') + '\n'
}

async function main(args) {
  let executionOnly = false
  let reportPath = resolve(repoRoot, 'qa-results/playwright.json')
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--execution-only') executionOnly = true
    else if (args[index] === '--report' && args[index + 1] && !args[index + 1].startsWith('--')) reportPath = resolve(args[++index])
    else throw new Error('Usage: node scripts/qa/coverage.mjs [--execution-only] [--report <path>]')
  }
  const [manifest, inventory, report] = await Promise.all([
    readFile(resolve(repoRoot, 'tests/qa/manifest.json'), 'utf8').then(JSON.parse),
    inventoryRoutes(repoRoot),
    readPlaywrightReport(reportPath),
  ])
  const coverage = buildCoverage(manifest, inventory, report, { executionOnly })
  const output = resolve(repoRoot, 'qa-results')
  await mkdir(output, { recursive: true })
  await Promise.all([
    writeFile(resolve(output, 'coverage.json'), JSON.stringify(coverage, null, 2) + '\n'),
    writeFile(resolve(output, 'coverage.md'), toMarkdown(coverage)),
  ])
  console.log(`QA ${coverage.mode} gate ${coverage.gatePassed ? 'passed' : 'blocked'}. See qa-results/coverage.md.`)
  process.exitCode = coverage.gatePassed ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error && error.message.startsWith('Usage:') ? error.message : 'QA evidence evaluation failed. Check the local manifest and report files.')
    process.exitCode = 1
  })
}
