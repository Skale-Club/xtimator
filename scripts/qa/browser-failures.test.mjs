import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserFailureTracker } from '../../tests/qa/fixtures/browser-failures.ts'

const origin = 'https://127.0.0.1:9650'
const script = `${origin}/_next/static/runtime.js`
const stylesheet = `${origin}/_next/static/app.css`

test('counts hook, hydration and serialization console errors and all unhandled page exceptions', () => {
  const tracker = createBrowserFailureTracker(origin)
  tracker.consoleError('Error: Rendered more hooks than during the previous render.')
  tracker.consoleError('Rendered fewer hooks than expected. This may be caused by an accidental early return statement.')
  tracker.consoleError('Hydration failed because the server rendered HTML did not match the client.')
  tracker.consoleError('Functions cannot be passed directly to Client Components unless you explicitly expose it.')
  tracker.pageError('An unrelated unexpected exception')
  assert.deepEqual(tracker.summary(), { fatalCount: 5, events: [
    { source: 'console.error', classification: 'hook-order', fatal: true, count: 2 },
    { source: 'console.error', classification: 'hydration', fatal: true, count: 1 },
    { source: 'console.error', classification: 'rsc-serialization', fatal: true, count: 1 },
    { source: 'pageerror', classification: 'unhandled-exception', fatal: true, count: 1 },
  ] })
})

test('known browser fetch rejections remain fatal and expose only a fixed category', () => {
  const tracker = createBrowserFailureTracker(origin)
  tracker.pageError('Load failed')
  tracker.pageError('TypeError: Failed to fetch')
  assert.deepEqual(tracker.summary(), { fatalCount: 2, events: [
    { source: 'pageerror', classification: 'fetch-rejection', fatal: true, count: 2 },
  ] })
})

test('a handled provider outage and its failed API request do not trip the browser gate', () => {
  const tracker = createBrowserFailureTracker(origin)
  tracker.consoleError('The provider returned 503. Estimate generation failed; please try again.')
  tracker.assetResponse(`${origin}/api/generate`, 'fetch', 503)
  tracker.assetRequestFailed(`${origin}/api/generate`, 'fetch', 'Load failed')
  tracker.assetResponse('https://external.invalid/script.js', 'script', 404)
  assert.deepEqual(tracker.summary(), { fatalCount: 0, events: [] })
})

test('fails same-origin stylesheet/script errors and records only explicit cancellations as nonfatal', () => {
  const tracker = createBrowserFailureTracker(origin)
  tracker.assetResponse(script, 'script', 404)
  tracker.assetResponse(stylesheet, 'stylesheet', 500)
  tracker.assetResponse(stylesheet, 'stylesheet', 304)
  tracker.assetRequestFailed(stylesheet, 'stylesheet', 'net::ERR_TOO_MANY_RETRIES')
  tracker.assetRequestFailed(script, 'script', 'Load failed')
  tracker.assetRequestFailed(script, 'script', 'net::ERR_ABORTED')
  tracker.assetRequestFailed(script, 'script', 'NS_BINDING_ABORTED')
  tracker.assetRequestFailed(script, 'script', 'net::ERR_ABORTED with unspecified follow-up')
  assert.equal(tracker.summary().fatalCount, 5)
  assert.deepEqual(tracker.summary().events.map(entry => [entry.classification, entry.resourceType, entry.fatal, entry.count]), [
    ['http-4xx', 'script', true, 1], ['http-5xx', 'stylesheet', true, 1],
    ['connection-retry-limit', 'stylesheet', true, 1], ['load-failed', 'script', true, 1],
    ['cancelled', 'script', false, 2], ['request-failed', 'script', true, 1],
  ])
})

test('sanitized attachments never include exception texts, URLs or request failure details', () => {
  const tracker = createBrowserFailureTracker(origin)
  const marker = 'SYNTHETIC_PRIVATE_VALUE'
  tracker.pageError(`Unexpected exception contains ${marker}`)
  tracker.consoleError(`Rendered more hooks; diagnostic contains ${marker}`)
  tracker.assetRequestFailed(`${script}?private=${marker}`, 'script', `Unfamiliar browser error ${marker}`)
  const evidence = JSON.stringify(tracker.summary())
  assert.equal(tracker.summary().fatalCount, 3)
  for (const privateText of [marker, origin, 'runtime.js', 'Unexpected exception contains', 'Unfamiliar browser error']) {
    assert.equal(evidence.includes(privateText), false)
  }
})
