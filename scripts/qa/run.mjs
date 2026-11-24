import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { createQaTls, qaTlsEnvironment, removeQaTls } from './tls.mjs'

const allowed = new Set(['--execution-only', '--project=chromium', '--project=mobile-safari', '--project=mobile-chrome'])
if (process.argv.slice(2).some(arg => !allowed.has(arg))) throw new Error('Unknown QA campaign option')
if (process.env.XTIMATOR_QA_DEV !== '1') throw new Error('XTIMATOR_QA_DEV=1 is required')
mkdirSync('qa-results', { recursive: true })
// Preserve old evidence while ensuring this run cannot pass on stale JSON.
for (const name of ['playwright.json', 'coverage.json', 'coverage.md', 'network.jsonl']) {
  const path = `qa-results/${name}`
  if (existsSync(path)) renameSync(path, `${path}.${Date.now()}.previous`)
}
const projects = process.argv.slice(2).filter(arg => arg.startsWith('--project='))
const executionOnly = process.argv.includes('--execution-only')
const scenarioIds = (process.env.QA_SCENARIOS || '').split(',').filter(Boolean)
const knownIds = new Set(JSON.parse(readFileSync('tests/qa/manifest.json', 'utf8')).scenarios.map(scenario => scenario.id))
if (scenarioIds.some(id => !/^[A-Z][A-Z0-9-]*$/.test(id) || !knownIds.has(id))) throw new Error('Unknown QA_SCENARIOS identifier')
const selection = scenarioIds.length ? ['--grep', `\\[QA:(?:${scenarioIds.join('|')})\\]`] : []
const started = Date.now()
const tls = createQaTls()
let browser
try {
  const env = { ...process.env, ...qaTlsEnvironment(tls) }
  delete env.NODE_TLS_REJECT_UNAUTHORIZED
  browser = spawnSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', '--config=playwright.qa.config.ts', ...projects, ...selection,
  ], { stdio: 'inherit', env })
} finally {
  removeQaTls(tls.directory)
}
const report = spawnSync(process.execPath, ['scripts/qa/coverage.mjs', ...(executionOnly ? ['--execution-only'] : [])], { stdio: 'inherit' })
console.log(`QA campaign elapsed seconds: ${Math.round((Date.now() - started) / 1000)}. Provider mode: synthetic; public readiness is reported separately.`)
process.exitCode = browser.status !== 0 || report.status !== 0 ? 1 : 0
