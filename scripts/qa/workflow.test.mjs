import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync('.github/workflows/test.yml', 'utf8')
const job = name => source.match(new RegExp(`\\n  ${name}:\\r?\\n(?:[^\\n]*\\r?\\n)*?    if: (\\$\\{\\{[^\\n]+\\}\\})`))?.[1]
const full = [...source.matchAll(/- if: (\$\{\{[^\n]+\}\})\r?\n\s+run: npx vitest run tests\/unit tests\/eval/g)].map(match => match[1])
const focused = source.match(/name: Characterize generation credit-read failures on a feature branch\r?\n\s+if: (\$\{\{[^\n]+\}\})/)?.[1]

function enabled(condition, github, inputs) {
  assert.ok(condition, 'The workflow must retain its explicit condition')
  const expression = condition.slice(3, -2).trim()
  // Evaluate only the comparison/boolean subset used here, with no calls,
  // assignments, indexing or access to the host process.
  assert.match(expression, /^[A-Za-z0-9_.\s'!&|=/-]+$/)
  return Boolean(vm.runInNewContext(expression, { github, inputs }, { timeout: 50 }))
}

test('manual acceptance and focused diagnostics cannot bypass main/dev regression', () => {
  assert.equal(full.length, 2, 'Both full determinism passes must remain configured')
  for (const ref of ['refs/heads/main', 'refs/heads/dev']) {
    const github = { ref, event_name: 'workflow_dispatch' }
    for (const qa of [false, true]) {
      const inputs = { qa, unit_scope: 'generation-credits' }
      assert.equal(enabled(job('unit'), github, inputs), true)
      assert.equal(enabled(job('acceptance'), github, inputs), false)
      for (const condition of full) assert.equal(enabled(condition, github, inputs), true)
      assert.equal(enabled(focused, github, inputs), false)
    }
  }
})

test('branch diagnostics select the requested job without changing push/PR gates', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', event_name: 'workflow_dispatch' }
  assert.equal(enabled(job('acceptance'), github, { qa: true }), true)
  assert.equal(enabled(job('unit'), github, { qa: true }), false)
  assert.equal(enabled(focused, github, { qa: false, unit_scope: 'generation-credits' }), true)
  for (const event_name of ['push', 'pull_request']) {
    const event = { ...github, event_name, repository: 'Skale-Club/xtimator',
      event: { pull_request: { head: { repo: { full_name: 'external/xtimator' } } } } }
    assert.equal(enabled(job('unit'), event, {}), true)
    assert.equal(enabled(job('acceptance'), event, {}), false)
    for (const condition of full) assert.equal(enabled(condition, event, {}), true)
  }
})

test('acceptance runs automatically for dev pushes and internal PRs, never main pushes or forks', () => {
  for (const ref of ['refs/heads/main', 'refs/heads/dev']) {
    const github = { ref, event_name: 'push' }
    assert.equal(enabled(job('acceptance'), github, {}), ref === 'refs/heads/dev')
    assert.equal(enabled(job('unit'), github, {}), true)
    for (const condition of full) assert.equal(enabled(condition, github, {}), true)
  }
  for (const owner of ['Skale-Club/xtimator', 'external/xtimator']) {
    const github = { ref: 'refs/pull/123/merge', event_name: 'pull_request', repository: 'Skale-Club/xtimator',
      event: { pull_request: { head: { repo: { full_name: owner } } } } }
    assert.equal(enabled(job('acceptance'), github, {}), owner === github.repository)
    assert.equal(enabled(job('unit'), github, {}), true)
    for (const condition of full) assert.equal(enabled(condition, github, {}), true)
  }
})

test('production-mode compilation uses the same trusted development boundary', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', event_name: 'workflow_dispatch' }
  assert.equal(enabled(job('build'), github, { verify_build: true }), true)
  assert.equal(enabled(job('build'), github, { verify_build: false }), false)
  for (const ref of ['refs/heads/main', 'refs/heads/dev']) {
    assert.equal(enabled(job('build'), { ...github, ref }, { verify_build: true }), false)
    assert.equal(enabled(job('build'), { ref, event_name: 'push' }, {}), ref === 'refs/heads/dev')
  }
  for (const full_name of ['Skale-Club/xtimator', 'external/xtimator']) {
    const pr = { ref: 'refs/pull/1/merge', event_name: 'pull_request', repository: 'Skale-Club/xtimator',
      event: { pull_request: { head: { repo: { full_name } } } } }
    assert.equal(enabled(job('build'), pr, {}), full_name === pr.repository)
  }
})
