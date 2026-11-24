import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectWorkerRegistry } from '../../tests/qa/fixtures/worker-registry.ts'

const slugs = ['xtimator-generate-estimate', 'xtimator-transcribe-audio', 'xtimator-analyze-photos']
const app = { externalID: 'xtimator', url: 'http://127.0.0.1:9652/api/inngest', error: null,
  functions: [...slugs, ...slugs.map(id => `${id}-failure`)].map(slug => ({ slug })) }
const body = value => ({ data: { apps: [value] } })

test('requires the three real registered workers and permits only their failure handlers', () => {
  assert.deepEqual(inspectWorkerRegistry(body(app)), { ready: true, reason: 'registered', appCount: 1,
    functionCount: 6, expectedWorkers: 3, callbackValid: true })
  assert.equal(inspectWorkerRegistry(body({ ...app, url: 'http://localhost:9652/api/inngest' })).ready, true)
})

test('rejects absent, duplicate and unrelated functions', () => {
  for (const [functions, reason] of [
    [app.functions.slice(1), 'missing-worker'],
    [[...app.functions, app.functions[0]], 'duplicate-worker'],
    [[...app.functions, { slug: 'xtimator-maintenance' }], 'unexpected-worker'],
  ]) assert.equal(inspectWorkerRegistry(body({ ...app, functions })).reason, reason)
})

test('rejects remote callbacks, errors, extra apps and malformed registry data', () => {
  for (const url of ['https://xtimator.com/api/inngest', 'http://127.0.0.1:9653/api/inngest',
    'http://user:password@localhost:9652/api/inngest', 'http://localhost:9652/api/inngest?secret=value']) {
    assert.equal(inspectWorkerRegistry(body({ ...app, url })).reason, 'unexpected-callback')
  }
  for (const payload of [null, {}, { errors: [{}] }, { data: { apps: [app, app] } },
    body({ ...app, error: 'TLS registration failed' }), body({ ...app, externalID: 'foreign' })]) {
    assert.equal(inspectWorkerRegistry(payload).ready, false)
  }
})

test('evidence excludes arbitrary IDs, callback credentials and original SDK error text', () => {
  const marker = 'SYNTHETIC_PRIVATE_VALUE'
  for (const patch of [{ error: marker }, { url: `http://${marker}@localhost:9652/api/inngest` },
    { functions: [{ slug: marker }] }]) {
    assert.equal(JSON.stringify(inspectWorkerRegistry(body({ ...app, ...patch }))).includes(marker), false)
  }
})
