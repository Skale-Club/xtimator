const expected = ['xtimator-generate-estimate', 'xtimator-transcribe-audio', 'xtimator-analyze-photos']
const allowed = new Set([...expected, ...expected.map(id => `${id}-failure`)])

/** Report structure only; never retain registry errors, callbacks or arbitrary IDs. */
export function inspectWorkerRegistry(payload: unknown) {
  const result = { ready: false, reason: 'invalid-response', appCount: 0, functionCount: 0, expectedWorkers: 0, callbackValid: false }
  if (!payload || typeof payload !== 'object') return result
  const body = payload as { errors?: unknown[]; data?: { apps?: unknown } }
  if (body.errors?.length) return { ...result, reason: 'graphql-error' }
  if (!Array.isArray(body.data?.apps)) return result
  result.appCount = body.data.apps.length
  if (result.appCount !== 1) return { ...result, reason: 'unexpected-app-count' }
  const app = body.data.apps[0] as { externalID?: unknown; url?: unknown; error?: unknown; functions?: unknown }
  if (!app || app.externalID !== 'xtimator') return { ...result, reason: 'unexpected-app' }
  if (app.error) return { ...result, reason: 'sdk-registration-error' }
  try {
    const url = new URL(String(app.url))
    result.callbackValid = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
      && url.port === '9652' && url.pathname === '/api/inngest' && !url.username && !url.password && !url.search && !url.hash
  } catch { /* Keep the invalid callback out of evidence. */ }
  if (!result.callbackValid) return { ...result, reason: 'unexpected-callback' }
  if (!Array.isArray(app.functions)) return result
  result.functionCount = app.functions.length
  const ids = app.functions.map(fn => (fn as { slug?: unknown } | null)?.slug)
  const unique = new Set(ids)
  result.expectedWorkers = expected.filter(id => unique.has(id)).length
  if (unique.size !== ids.length) return { ...result, reason: 'duplicate-worker' }
  if (ids.some(id => typeof id !== 'string' || !allowed.has(id))) return { ...result, reason: 'unexpected-worker' }
  if (result.expectedWorkers !== expected.length) return { ...result, reason: 'missing-worker' }
  return { ...result, ready: true, reason: 'registered' }
}
