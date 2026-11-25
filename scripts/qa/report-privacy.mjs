import { createHash } from 'node:crypto'
import { lstatSync, realpathSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QA_SOURCE_DIR = fileURLToPath(new URL('../../tests/qa/', import.meta.url))
const ADMIN_SPEC_FILES = new Set([
  'admin.spec.ts',
  'admin-event.spec.ts',
  'admin-learner.spec.ts',
  'admin-route-denial.spec.ts',
  'admin-surfaces.spec.ts',
  'admin-content-details.spec.ts',
].map(name => resolve(QA_SOURCE_DIR, name)))

export const REDACTED_ADMIN_ERROR = 'Admin QA error details redacted.'

const BROWSER_FAILURES_NAME = 'browser-failures.json'
const MAX_BROWSER_FAILURES_BYTES = 4096
const MAX_BROWSER_FAILURE_EVENTS = 32
const MAX_BROWSER_FAILURE_COUNT = 10_000
const REACT_FAILURES = ['hook-order', 'hydration', 'rsc-serialization']
// Match the events emitted by tests/qa/fixtures/browser-failures.ts.
const BROWSER_FAILURE_CLASSIFICATIONS = new Map([
  ['pageerror', [...REACT_FAILURES, 'unhandled-exception', 'fetch-rejection']],
  ['console.error', REACT_FAILURES],
  ['asset-response', ['http-4xx', 'http-5xx']],
  ['asset-requestfailed', ['connection-retry-limit', 'load-failed', 'request-failed', 'cancelled']],
])

export function isAdminSpec(file) {
  if (typeof file !== 'string' || !isAbsolute(file)) return false
  const realFile = resolve(file)
  return dirname(realFile) === resolve(QA_SOURCE_DIR) && /^admin[^/]*\.spec\.ts$/i.test(basename(realFile))
}

export function isKnownAdminSpec(file) {
  return isAdminSpec(file) && ADMIN_SPEC_FILES.has(resolve(file))
}

function sanitizedName(value) {
  return value.replace(/[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g, '-')
}

// Match the Playwright 1.59 TestInfo output-directory format for these direct
// QA spec files and unique project names, using only public reporter fields.
export function adminErrorContextPath({ file, titles, outputDir, project, retry = 0, repeat = 0 }) {
  if (!isAdminSpec(file) || !isAbsolute(outputDir) || !/^[a-z][a-z0-9-]*$/.test(project)
    || !Number.isSafeInteger(retry) || retry < 0 || !Number.isSafeInteger(repeat) || repeat < 0) {
    throw new Error('Invalid admin QA output identity')
  }
  const full = basename(file, '.spec.ts') + '-' + sanitizedName(titles.join(' '))
  const hash = createHash('sha1').update(full).digest('hex').slice(0, 5)
  const stem = full.length <= 60 ? full : `${full.slice(0, 26)}-${hash}-${full.slice(-27)}`
  const run = `${project}${retry ? `-retry${retry}` : ''}${repeat ? `-repeat${repeat}` : ''}`
  return join(outputDir, `${stem}-${run}`, 'error-context.md')
}

export function removeAdminErrorContext(path, expected, outputDir) {
  if (path !== expected || !isAbsolute(path) || dirname(dirname(path)) !== outputDir
    || basename(path) !== 'error-context.md') return false

  try {
    if (!lstatSync(outputDir).isDirectory() || !lstatSync(dirname(path)).isDirectory()
      || !lstatSync(path).isFile()) return false
    const realOutput = realpathSync(outputDir)
    if (realOutput !== outputDir) return false
    const realFile = join(realOutput, basename(dirname(path)), 'error-context.md')
    if (realpathSync(path) !== realFile) return false
    unlinkSync(path)
    return true
  } catch (error) {
    return error.code === 'ENOENT'
  }
}

function redactError() {
  return { message: REDACTED_ADMIN_ERROR }
}

function safeAnnotations(annotations) {
  return annotations.flatMap(({ type, description }) => {
    if (['skip', 'fixme', 'fail', 'slow'].includes(type)) return [{ type }]
    if (type === 'qa-admin-zone-check' && description === 'utc-pacific:distinct') return [{ type, description }]
    if (typeof description === 'string' && description.trim() === description) {
      if (type === 'qa-admin-read-failure'
        && /^(?:dashboard|admins|company|events|integrations):(?:navigation|response|url|banner|heading|content|catalog)$/.test(description)) return [{ type, description }]
      if (type === 'qa-admin-read-react-error'
        && /^(?:dashboard|admins|company|events|integrations):(?:300|310|418|423|other):(?:html|text|unknown)$/.test(description)) return [{ type, description }]
    }
    // Fixed alias identifiers, React numeric codes and fixed reason enums only.
    // No error text, URL, DOM, company ID or integration metadata is retained.
    if (type === 'qa-admin-alias-error' && typeof description === 'string'
      && description.trim() === description
      && /^(?:legal|inbox|templates):(?:300|310|418|423|other):(?:html|text|unknown)$/.test(description)) {
      return [{ type, description }]
    }
    return []
  })
}

function safeBrowserFailures(attachments) {
  const candidates = attachments.filter(attachment => attachment.name === BROWSER_FAILURES_NAME)
  if (candidates.length !== 1) return
  const { contentType, body, path } = candidates[0]
  if (contentType !== 'application/json' || path !== undefined || !Buffer.isBuffer(body)
    || body.length > MAX_BROWSER_FAILURES_BYTES) return

  let report
  try {
    report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } catch {
    return
  }
  if (!Number.isSafeInteger(report?.fatalCount) || report.fatalCount < 0
    || report.fatalCount > MAX_BROWSER_FAILURE_COUNT || !Array.isArray(report.events)
    || report.events.length > MAX_BROWSER_FAILURE_EVENTS) return

  const events = []
  let fatalCount = 0
  for (const event of report.events) {
    if (!event || typeof event !== 'object') return
    const { source, classification, resourceType, fatal, count } = event
    if (!BROWSER_FAILURE_CLASSIFICATIONS.get(source)?.includes(classification)
      || fatal !== (classification !== 'cancelled') || !Number.isSafeInteger(count)
      || count < 1 || count > MAX_BROWSER_FAILURE_COUNT) return
    const asset = source === 'asset-response' || source === 'asset-requestfailed'
    if (asset ? resourceType !== 'script' && resourceType !== 'stylesheet' : resourceType !== undefined) return
    if (fatal) fatalCount += count
    events.push({ source, classification, ...(asset ? { resourceType } : {}), fatal, count })
  }
  if (fatalCount !== report.fatalCount) return
  return {
    name: BROWSER_FAILURES_NAME,
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ fatalCount, events })),
  }
}

export function redactAdminResult(result) {
  const counts = {
    errorCount: Math.max(result.errors.length, Number(result.error != null)),
    attachmentCount: result.attachments.length,
    stdoutChunks: result.stdout.length,
    stderrChunks: result.stderr.length,
    stepCount: result.steps.length,
  }
  const hadError = result.error != null
  result.errors = result.errors.map(redactError)
  result.error = result.errors[0] ?? (hadError ? redactError() : undefined)
  result.steps = []
  result.stdout = []
  result.stderr = []
  result.annotations = safeAnnotations(result.annotations)
  const browserFailures = safeBrowserFailures(result.attachments)
  result.attachments = counts.attachmentCount ? [{
    name: 'admin-evidence-counts',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(counts)),
  }] : []
  if (browserFailures) result.attachments.push(browserFailures)
  return counts
}

export function redactAdminAnnotations(test) {
  test.annotations = safeAnnotations(test.annotations)
}
