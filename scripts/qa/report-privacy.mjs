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
].map(name => resolve(QA_SOURCE_DIR, name)))

export const REDACTED_ADMIN_ERROR = 'Admin QA error details redacted.'

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
  return annotations.filter(entry => ['skip', 'fixme', 'fail', 'slow'].includes(entry.type))
    .map(({ type }) => ({ type }))
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
  result.attachments = counts.attachmentCount ? [{
    name: 'admin-evidence-counts',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(counts)),
  }] : []
  return counts
}

export function redactAdminAnnotations(test) {
  test.annotations = safeAnnotations(test.annotations)
}
