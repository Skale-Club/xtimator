import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync('.github/workflows/test.yml', 'utf8')
const job = name => source.match(new RegExp(`\\n  ${name}:\\r?\\n(?:[^\\n]*\\r?\\n)*?    if: (\\$\\{\\{[^\\n]+\\}\\})`))?.[1]
const full = [...source.matchAll(/- if: (\$\{\{[^\n]+\}\})\r?\n\s+run: npx vitest run tests\/unit tests\/eval/g)].map(match => match[1])
const focused = source.match(/name: Characterize generation credit-read failures on a feature branch\r?\n\s+if: (\$\{\{[^\n]+\}\})/)?.[1]
const foundations = source.match(/name: Verify campaign fixes on a feature branch\r?\n\s+if: (\$\{\{[^\n]+\}\})/)?.[1]

function enabled(condition, github, inputs, needs = {}) {
  assert.ok(condition, 'The workflow must retain its explicit condition')
  const expression = condition.slice(3, -2).trim()
  // Evaluate only the comparison/boolean subset used here, with no calls,
  // assignments, indexing or access to the host process.
  assert.match(expression, /^[A-Za-z0-9_.\s'!&|=/-]+$/)
  // Constrained hosts can pause this thread for more than50ms even though
  // these validated Boolean expressions execute immediately.
  return Boolean(vm.runInNewContext(expression, { github, inputs, needs }, { timeout: 1000 }))
}

test('recovery keeps the originating attempt and ignores a cancellation before fixture initialization', () => {
  const condition = job('cleanup').replace('always()', 'true')
  for (const result of ['success', 'failure', 'cancelled']) {
    for (const fixture_attempt of ['', '1', '2']) {
      const needs = { acceptance: { result, outputs: { fixture_attempt } } }
      assert.equal(enabled(condition, {}, {}, needs), fixture_attempt !== '')
    }
  }
  assert.equal(enabled(condition, {}, {}, {
    acceptance: { result: 'skipped', outputs: { fixture_attempt: '1' } },
  }), false)
  const acceptance = source.split('\n  acceptance:')[1]?.split('\n  payment-sandbox:')[0]
  assert.match(acceptance, /steps:\s+- name: Identify this acceptance attempt\s+id: campaign\s+run: echo "attempt=\$GITHUB_RUN_ATTEMPT" >> "\$GITHUB_OUTPUT"/)
  const cleanup = source.split('\n  cleanup:')[1]
  assert.match(cleanup, /QA_CAMPAIGN_ATTEMPT: \$\{\{ needs\.acceptance\.outputs\.fixture_attempt \}\}/)
  assert.doesNotMatch(cleanup, /QA_CAMPAIGN_ATTEMPT:.*github\.run_attempt/)
})

test('manual acceptance and focused diagnostics cannot bypass main/dev regression', () => {
  assert.equal(full.length, 2, 'Both full determinism passes must remain configured')
  for (const ref of ['refs/heads/main', 'refs/heads/dev']) {
    const github = { ref, ref_type: 'branch', event_name: 'workflow_dispatch', repository: 'Skale-Club/xtimator' }
    for (const inputs of [
      { qa: false, payment_sandbox: false, unit_scope: 'generation-credits' },
      { qa: true, payment_sandbox: false, unit_scope: 'generation-credits' },
      { qa: false, payment_sandbox: true, unit_scope: 'generation-credits' },
      { qa: true, payment_sandbox: true, payment_browser: true, unit_scope: 'generation-credits' },
      { qa: false, payment_sandbox: false, unit_scope: 'qa-foundations' },
      { qa: false, payment_sandbox: false, unit_scope: 'dependency-lock' },
    ]) {
      assert.equal(enabled(job('unit'), github, inputs), true)
      assert.equal(enabled(job('acceptance'), github, inputs), false)
      assert.equal(enabled(job('payment-sandbox'), github, inputs), false)
      for (const condition of full) assert.equal(enabled(condition, github, inputs), true)
      assert.equal(enabled(focused, github, inputs), false)
    }
  }
})

test('branch diagnostics select the requested job without changing push/PR gates', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', ref_type: 'branch', event_name: 'workflow_dispatch' }
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

test('foundation diagnostics cannot replace full regression on protected branches or tags', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', ref_type: 'branch', event_name: 'workflow_dispatch' }
  const inputs = { qa: false, payment_sandbox: false, unit_scope: 'qa-foundations' }
  assert.equal(enabled(job('unit'), github, inputs), true)
  assert.equal(enabled(foundations, github, inputs), true)
  assert.equal(enabled(focused, github, inputs), false)
  for (const condition of full) assert.equal(enabled(condition, github, inputs), false)
  for (const event of [
    { ...github, ref: 'refs/heads/main' }, { ...github, ref: 'refs/heads/dev' },
    { ...github, ref: 'refs/tags/release-test', ref_type: 'tag' },
    { ...github, event_name: 'push' }, { ...github, event_name: 'pull_request' },
  ]) {
    assert.equal(enabled(foundations, event, inputs), false)
    for (const condition of full) assert.equal(enabled(condition, event, inputs), true)
  }
})

test('payment is opt-in on upstream branch dispatches and cannot run on pushes, PRs, forks or tags', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', ref_type: 'branch', event_name: 'workflow_dispatch', repository: 'Skale-Club/xtimator' }
  assert.equal(enabled(job('payment-sandbox'), github, { payment_sandbox: false }), false)
  const inputs = { payment_sandbox: true, qa: true }
  assert.equal(enabled(job('payment-sandbox'), github, inputs), true)
  assert.equal(enabled(job('payment-sandbox'), { ...github, repository: 'external/xtimator' }, inputs), false)
  assert.equal(enabled(job('acceptance'), github, inputs), false)
  assert.equal(enabled(job('unit'), github, inputs), false)
  assert.equal(enabled(job('unit'), github, { payment_sandbox: true, qa: false }), false)
  for (const event_name of ['push', 'pull_request']) {
    for (const ref of [github.ref, 'refs/heads/main', 'refs/heads/dev']) {
      const event = { ...github, event_name, ref }
      assert.equal(enabled(job('payment-sandbox'), event, inputs), false)
      assert.equal(enabled(job('unit'), event, inputs), true)
    }
  }
  const tag = { ...github, ref: 'refs/tags/test', ref_type: 'tag' }
  assert.equal(enabled(job('payment-sandbox'), tag, inputs), false)
  assert.equal(enabled(job('unit'), tag, inputs), true)
})

test('hosted Checkout requires a separate explicit opt-in and installs Chromium before secrets', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', ref_type: 'branch', event_name: 'workflow_dispatch', repository: 'Skale-Club/xtimator' }
  const payment = source.split('\n  payment-sandbox:')[1]?.split('\n  cleanup:')[0]
  const install = payment?.match(/name: Install Chromium for hosted Stripe Checkout\r?\n\s+if: (\$\{\{[^\n]+\}\})\r?\n\s+run: [^\n]+/)?.[0]
  const browserEnv = payment?.match(/RUN_PAYMENT_BROWSER: (\$\{\{[^\n]+\}\})/)?.[1]
  assert.match(source, /payment_browser:\r?\n\s+description: [^\n]+\r?\n\s+type: boolean\r?\n\s+default: false/)
  assert.ok(install && browserEnv)
  assert.ok(payment.indexOf(install) < payment.indexOf('env:'))
  assert.equal(enabled(job('payment-sandbox'), github, { payment_browser: true }), false)
  for (const payment_browser of [false, true]) {
    const inputs = { payment_sandbox: true, payment_browser }
    assert.equal(enabled(job('payment-sandbox'), github, inputs), true)
    assert.equal(enabled(install.match(/if: (\$\{\{[^\n]+\}\})/)?.[1], github, inputs), payment_browser)
    // Evaluate the literal 1/0 branches as booleans to confirm the same opt-in.
    assert.equal(enabled(browserEnv.replace("'1'", 'true').replace("'0'", 'false'), github, inputs), payment_browser)
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

test('dependency resolution is a secret-free manual candidate and cannot replace protected regression', () => {
  const github = { ref: 'refs/heads/feat/autonomous-launch-qa', ref_type: 'branch', event_name: 'workflow_dispatch', repository: 'Skale-Club/xtimator' }
  const inputs = { qa: false, payment_sandbox: false, unit_scope: 'dependency-lock' }
  assert.equal(enabled(job('dependency-lock'), github, inputs), true)
  assert.equal(enabled(job('unit'), github, inputs), false)
  for (const event of [
    { ...github, ref: 'refs/heads/main' }, { ...github, ref: 'refs/heads/dev' },
    { ...github, ref_type: 'tag' }, { ...github, event_name: 'push' }, { ...github, event_name: 'pull_request' },
  ]) {
    assert.equal(enabled(job('dependency-lock'), event, inputs), false)
    assert.equal(enabled(job('unit'), event, inputs), true)
  }
  assert.equal(enabled(job('dependency-lock'), { ...github, repository: 'external/xtimator' }, inputs), false)
  const candidate = source.split('\n  dependency-lock:')[1]?.split('\n  build:')[0]
  assert.ok(candidate)
  assert.doesNotMatch(candidate, /secrets\.|persist-credentials: true|npm audit fix|--force/)
  assert.match(candidate, /--package-lock-only --ignore-scripts/)
  assert.match(candidate, /name: dependency-lock-\$\{\{ github.run_id \}\}/)
})
