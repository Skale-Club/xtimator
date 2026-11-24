import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'

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
const started = Date.now()
const browser = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.qa.config.ts', ...projects], { stdio: 'inherit', env: process.env })
const report = spawnSync(process.execPath, ['scripts/qa/coverage.mjs', ...(executionOnly ? ['--execution-only'] : [])], { stdio: 'inherit' })
console.log(`QA campaign elapsed seconds: ${Math.round((Date.now() - started) / 1000)}. Provider mode: synthetic; public readiness is reported separately.`)
process.exitCode = browser.status !== 0 || report.status !== 0 ? 1 : 0
