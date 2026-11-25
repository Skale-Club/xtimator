import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, readdirSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  adminErrorContextPath,
  isAdminSpec,
  isKnownAdminSpec,
  redactAdminResult,
  removeAdminErrorContext,
  REDACTED_ADMIN_ERROR,
} from './report-privacy.mjs'
import QaPrivacyReporter from '../../tests/qa/reporters/privacy.mjs'

const source = fileURLToPath(new URL('../../tests/qa/', import.meta.url))
const adminFile = join(source, 'admin-surfaces.spec.ts')
const marker = 'synthetic-private-marker-from-assertion'

function privateResult() {
  const error = { message: marker, stack: marker, snippet: marker, value: marker }
  return {
    status: 'failed', duration: 150, retry: 1,
    error,
    errors: [error, { message: marker }],
    attachments: [
      { name: marker, contentType: 'text/plain', path: marker },
      { name: 'admin-attachment', contentType: 'text/plain', body: Buffer.from(marker) },
    ],
    steps: [{ title: marker, steps: [{ title: marker, error }] }],
    stdout: [marker], stderr: [Buffer.from(marker)],
    annotations: [{ type: 'skip', description: marker }, { type: marker }],
  }
}

function browserFailuresAttachment(report, overrides = {}) {
  return {
    name: 'browser-failures.json', contentType: 'application/json',
    body: Buffer.from(JSON.stringify(report)),
    ...overrides,
  }
}

test('redacts raw and nested admin data while preserving failure, retry, duration, and counts', () => {
  const result = privateResult()
  const counts = redactAdminResult(result)
  assert.equal(result.status, 'failed')
  assert.equal(result.retry, 1)
  assert.equal(result.duration, 150)
  assert.equal(result.error, result.errors[0])
  assert.deepEqual(result.errors, Array.from({ length: 2 }, () => ({ message: REDACTED_ADMIN_ERROR })))
  assert.deepEqual(result.annotations, [{ type: 'skip' }])
  assert.equal(result.attachments[0].path, undefined)
  assert.deepEqual(counts, { errorCount: 2, attachmentCount: 2, stdoutChunks: 1, stderrChunks: 1, stepCount: 1 })
  assert.deepEqual(JSON.parse(result.attachments[0].body), counts)
  assert.equal(JSON.stringify(result).includes(marker), false)
  assert.equal(JSON.stringify(result).includes(Buffer.from(marker).toString('base64')), false)
})

test('retains only allowlisted browser failure fields alongside admin attachment counts', () => {
  const events = [
    { source: 'pageerror', classification: 'fetch-rejection', fatal: true, count: 8 },
    { source: 'console.error', classification: 'hydration', fatal: true, count: 1 },
    { source: 'asset-response', classification: 'http-5xx', resourceType: 'stylesheet', fatal: true, count: 1 },
    { source: 'asset-requestfailed', classification: 'cancelled', resourceType: 'script', fatal: false, count: 3 },
  ]
  const result = privateResult()
  result.attachments.push(browserFailuresAttachment({
    fatalCount: 10,
    events: events.map(event => ({ ...event, url: marker, [marker]: { message: marker } })),
    [marker]: marker,
  }, { [marker]: marker }))

  const counts = redactAdminResult(result)
  assert.equal(counts.attachmentCount, 3)
  assert.deepEqual(result.attachments.map(attachment => attachment.name), ['admin-evidence-counts', 'browser-failures.json'])
  const diagnostic = result.attachments[1]
  assert.deepEqual(Object.keys(diagnostic), ['name', 'contentType', 'body'])
  assert.equal(diagnostic.body.toString().includes(marker), false)
  assert.deepEqual(JSON.parse(diagnostic.body), { fatalCount: 10, events })
  assert.equal(result.status, 'failed')
  assert.equal(result.errors.length, 2)
})

test('retains fixed admin alias failure identifiers while rejecting private diagnostic strings', () => {
  const result = privateResult()
  result.annotations = [
    { type: 'qa-admin-zone-check', description: 'utc-pacific:distinct' },
    { type: 'qa-admin-zone-check', description: 'utc-pacific:distinct' + marker },
    { type: 'qa-admin-read-failure', description: 'admins:content' },
    { type: 'qa-admin-read-failure', description: 'integrations:catalog' },
    { type: 'qa-admin-read-react-error', description: 'admins:418:text' },
    { type: 'qa-admin-read-failure', description: 'admins:content\n' + marker },
    { type: 'qa-admin-read-react-error', description: 'company:418:' + marker },
    { type: 'qa-admin-read-failure', description: marker + ':content' },
    { type: 'qa-admin-alias-error', description: 'legal:418:html' },
    { type: 'qa-admin-alias-error', description: 'templates:423:text' },
    { type: 'qa-admin-alias-error', description: 'inbox:other:unknown' },
    { type: 'qa-admin-alias-error', description: 'legal:418:html\n' + marker },
    { type: 'qa-admin-alias-error', description: 'legal:418:html\n' },
    { type: 'qa-admin-alias-error', description: '/admin/companies/' + marker },
    { type: 'qa-admin-alias-error', description: 'legal:418:' + marker },
    { type: marker, description: 'legal:418:html' },
  ]
  redactAdminResult(result)
  assert.deepEqual(result.annotations, [
    { type: 'qa-admin-zone-check', description: 'utc-pacific:distinct' },
    { type: 'qa-admin-read-failure', description: 'admins:content' },
    { type: 'qa-admin-read-failure', description: 'integrations:catalog' },
    { type: 'qa-admin-read-react-error', description: 'admins:418:text' },
    { type: 'qa-admin-alias-error', description: 'legal:418:html' },
    { type: 'qa-admin-alias-error', description: 'templates:423:text' },
    { type: 'qa-admin-alias-error', description: 'inbox:other:unknown' },
  ])
  assert.equal(JSON.stringify(result).includes(marker), false)
})

test('falls back to counts for malformed, oversized or spoofed browser evidence', () => {
  const event = { source: 'pageerror', classification: 'fetch-rejection', fatal: true, count: 1 }
  const report = { fatalCount: 1, events: [event] }
  const invalid = [
    browserFailuresAttachment({ ...report, fatalCount: 2 }),
    browserFailuresAttachment({ ...report, fatalCount: 10_001 }),
    browserFailuresAttachment({ ...report, events: [{ ...event, source: marker }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, classification: marker }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, source: 'asset-response', resourceType: 'script' }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, resourceType: marker }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, count: 0.5 }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, count: 10_001 }] }),
    browserFailuresAttachment({ ...report, events: [{ ...event, fatal: false }] }),
    browserFailuresAttachment(report, { path: marker }),
    browserFailuresAttachment(report, { body: undefined, path: marker }),
    browserFailuresAttachment(report, { contentType: 'text/plain' }),
    browserFailuresAttachment(report, { body: Buffer.from(`[${marker}`) }),
    browserFailuresAttachment(report, { body: Buffer.alloc(4097) }),
  ]
  for (const attachment of invalid) {
    const result = privateResult()
    result.attachments.push(attachment)
    assert.equal(redactAdminResult(result).attachmentCount, 3)
    assert.deepEqual(result.attachments.map(item => item.name), ['admin-evidence-counts'])
  }
  const ambiguous = privateResult()
  ambiguous.attachments.push(browserFailuresAttachment(report), browserFailuresAttachment(report))
  assert.equal(redactAdminResult(ambiguous).attachmentCount, 4)
  assert.deepEqual(ambiguous.attachments.map(item => item.name), ['admin-evidence-counts'])
})

test('classifies every current admin spec and redacts future admin specs before failing closed', () => {
  for (const file of readdirSync(source).filter(file => /^admin.*\.spec\.ts$/.test(file))) {
    assert.equal(isKnownAdminSpec(join(source, file)), true)
  }
  assert.equal(isAdminSpec(join(source, 'other', 'admin-surfaces.spec.ts')), false)
  assert.equal(isAdminSpec(join(source, 'core.spec.ts')), false)
  assert.equal(isAdminSpec(join(source, 'admin-new.spec.ts')), true)
  assert.equal(isKnownAdminSpec(join(source, 'admin-new.spec.ts')), false)
  let consoleText = ''
  const stream = { write: chunk => { consoleText += chunk.toString() } }
  const reporter = new QaPrivacyReporter({ stdout: stream, stderr: stream })
  const testCase = {
    location: { file: join(source, 'admin-new.spec.ts') },
    title: 'Synthetic private-path test',
    parent: { project: () => ({ name: 'chromium', outputDir: tmpdir() }) },
    annotations: [{ type: 'fail', description: marker }],
  }
  const result = privateResult()
  reporter.onStdOut(marker, testCase)
  reporter.onStdErr(Buffer.from(marker), testCase)
  reporter.onTestEnd(testCase, result)
  assert.equal(consoleText.includes(marker), false)
  assert.match(consoleText, /failed.*2 error\(s\).*2 suppressed output chunk\(s\)/)
  assert.equal(JSON.stringify(testCase.annotations).includes(marker), false)
  assert.deepEqual(reporter.onEnd(), { status: 'failed' })
})

test('preserves non-admin diagnostics and the live global error stream', () => {
  let consoleText = ''
  const stream = { write: chunk => { consoleText += chunk.toString() } }
  const reporter = new QaPrivacyReporter({ stdout: stream, stderr: stream })
  const testCase = {
    location: { file: join(source, 'core.spec.ts') },
    title: 'Synthetic public diagnostic',
    parent: { project: () => ({ name: 'chromium' }) },
  }
  const result = privateResult()
  reporter.onStdOut('non-admin stdout', testCase)
  reporter.onStdErr('non-admin stderr', testCase)
  reporter.onTestEnd(testCase, result)
  reporter.onError({ message: 'global setup error' })
  assert.match(consoleText, /non-admin stdout/)
  assert.match(consoleText, /non-admin stderr/)
  assert.match(consoleText, new RegExp(marker))
  assert.match(consoleText, /global setup error/)
  assert.equal(result.errors[0].message, marker)
  assert.equal(reporter.onEnd(), undefined)
})

test('removes only the exact owned error-context path, and refuses directory links', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'qa-private-report-')))
  try {
    const outputDir = join(directory, 'artifacts')
    const expected = adminErrorContextPath({
      file: adminFile,
      titles: ['[QA:ADM-CONTENT-SCREENS] administrative content editors and the design catalog render without saving'],
      outputDir,
      project: 'mobile-safari',
    })
    assert.equal(basename(dirname(expected)), 'admin-surfaces--QA-ADM-CON-75e08-talog-render-without-saving-mobile-safari')

    const other = join(outputDir, 'admin-other', 'error-context.md')
    mkdirSync(dirname(other), { recursive: true })
    writeFileSync(other, marker)
    assert.equal(removeAdminErrorContext(other, expected, outputDir), false)
    assert.equal(lstatSync(other).isFile(), true)

    const outside = join(directory, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'error-context.md'), marker)
    symlinkSync(outside, dirname(expected), 'junction')
    assert.equal(removeAdminErrorContext(expected, expected, outputDir), false)
    assert.equal(lstatSync(join(outside, 'error-context.md')).isFile(), true)
    if (process.platform === 'win32') rmdirSync(dirname(expected))
    else unlinkSync(dirname(expected))

    mkdirSync(dirname(expected))
    writeFileSync(expected, marker)
    const sibling = join(dirname(expected), 'retained-counts.json')
    writeFileSync(sibling, '{}')
    assert.equal(removeAdminErrorContext(expected, expected, outputDir), true)
    assert.throws(() => lstatSync(expected), { code: 'ENOENT' })
    assert.equal(lstatSync(sibling).isFile(), true)
  } finally {
    // This exact absolute directory was created by mkdtempSync above.
    assert.equal(dirname(directory), realpathSync(tmpdir()))
    assert.equal(basename(directory).startsWith('qa-private-report-'), true)
    rmSync(directory, { recursive: true, force: true })
  }
})
