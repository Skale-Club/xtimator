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
  tracker.assetRequestFailed(script, 'script', 'cancelled')
  tracker.assetRequestFailed(script, 'script', 'net::ERR_ABORTED with unspecified follow-up')
  assert.equal(tracker.summary().fatalCount, 5)
  assert.deepEqual(tracker.summary().events.map(entry => [entry.classification, entry.resourceType, entry.fatal, entry.count]), [
    ['http-4xx', 'script', true, 1], ['http-5xx', 'stylesheet', true, 1],
    ['connection-retry-limit', 'stylesheet', true, 1], ['load-failed', 'script', true, 1],
    ['cancelled', 'script', false, 3], ['request-failed', 'script', true, 1],
  ])
})

test('WebKit navigation cancellations do not mask fetch exceptions or other failed assets', () => {
  const tracker = createBrowserFailureTracker(origin)
  tracker.assetRequestFailed(script, 'script', 'cancelled')
  tracker.assetRequestFailed(stylesheet, 'stylesheet', 'cancelled')
  tracker.assetRequestFailed(script, 'script', 'cancelled with an unknown reason')
  tracker.assetRequestFailed(script, 'script', 'The network connection was lost.')
  tracker.assetRequestFailed(script, 'script', 'Load failed')
  tracker.pageError('Fetch API cannot load the session endpoint due to access control checks.')
  assert.equal(tracker.summary().fatalCount, 4)
  assert.deepEqual(tracker.summary().events.map(entry => [entry.classification, entry.fatal, entry.count]), [
    ['cancelled', false, 1], ['cancelled', false, 1], ['request-failed', true, 2],
    ['load-failed', true, 1], ['unhandled-exception', true, 1],
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

const notifications = `${origin}/api/notifications/list?limit=20`
const accessError = url => `Fetch API cannot load ${url} due to access control checks.`

test('access-control pageerrors are nonfatal only when the same URL was observed cancelled, in either order', () => {
  const a = createBrowserFailureTracker(origin)
  a.assetRequestFailed(notifications, 'fetch', 'cancelled')
  a.pageError(accessError(notifications))
  const b = createBrowserFailureTracker(origin)
  b.pageError(`TypeError: ${accessError(notifications)}`)
  b.assetRequestFailed(notifications, 'fetch', 'net::ERR_ABORTED')
  for (const t of [a, b]) {
    assert.deepEqual(t.summary(), { fatalCount: 0, events: [{ source: 'pageerror', classification: 'cancelled', fatal: false, count: 1 }] })
  }
})

test('access-control pageerror without a cancelled request, or cross-origin, stays fatal', () => {
  const none = createBrowserFailureTracker(origin)
  none.pageError(accessError(notifications))
  assert.equal(none.summary().fatalCount, 1)
  assert.equal(none.summary().events[0].classification, 'unhandled-exception')
  const cross = createBrowserFailureTracker(origin)
  const other = 'https://external.invalid/api/x'
  cross.assetRequestFailed(other, 'fetch', 'cancelled')
  cross.pageError(accessError(other))
  assert.equal(cross.summary().fatalCount, 1)
})

test('truncated access-control URL resolves and a different query string does not match', () => {
  const t = createBrowserFailureTracker(origin)
  t.assetRequestFailed(notifications, 'fetch', 'cancelled')
  t.pageError(accessError('/127.0.0.1:9650/api/notifications/list?limit=20'))
  assert.equal(t.summary().fatalCount, 0)
  const q = createBrowserFailureTracker(origin)
  q.assetRequestFailed(notifications, 'fetch', 'cancelled')
  q.pageError(accessError(`${origin}/api/notifications/list?limit=50`))
  assert.equal(q.summary().fatalCount, 1)
  assert.equal(JSON.stringify(t.summary()).includes('127.0.0.1'), false)
})

test('the exact WebKit message from run 45649047574 (name split at the scheme colon) resolves', () => {
  // Error.name was "Fetch API cannot load https"; Error.message is what the fixture receives.
  const message = '/127.0.0.1:9650/api/notifications/list?limit=20 due to access control checks.'
  const cancelled = createBrowserFailureTracker(origin)
  cancelled.pageError(message)
  cancelled.assetRequestFailed(notifications, 'fetch', 'cancelled')
  assert.equal(cancelled.summary().fatalCount, 0)
  const live = createBrowserFailureTracker(origin)
  live.pageError(message)
  assert.equal(live.summary().fatalCount, 1)
})

test('the WebKit teardown report from run 45707472434 resolves when the same fetch was answered, not when it failed', () => {
  // The app caught the rejection and the request itself answered 200; WebKit still reported it on navigation.
  const config = `${origin}/api/auth/config`
  const message = '/127.0.0.1:9650/api/auth/config due to access control checks.'
  const answered = createBrowserFailureTracker(origin)
  answered.pageError(message)
  answered.assetResponse(config, 'fetch', 200)
  assert.equal(answered.summary().fatalCount, 0)
  const failed = createBrowserFailureTracker(origin)
  failed.assetResponse(config, 'fetch', 503)
  failed.pageError(message)
  assert.equal(failed.summary().fatalCount, 1)
  const document = createBrowserFailureTracker(origin)
  document.assetResponse(config, 'document', 200)
  document.pageError(message)
  assert.equal(document.summary().fatalCount, 1)
})
