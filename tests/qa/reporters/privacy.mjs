import { fileURLToPath } from 'node:url'
import {
  adminErrorContextPath,
  isAdminSpec,
  isKnownAdminSpec,
  redactAdminAnnotations,
  redactAdminResult,
  removeAdminErrorContext,
  REDACTED_ADMIN_ERROR,
} from '../../../scripts/qa/report-privacy.mjs'

const qaOutputDir = fileURLToPath(new URL('../../../qa-results/artifacts', import.meta.url))

function writeError(stream, error) {
  const text = [error.stack ?? error.message ?? error.value ?? 'Playwright error.', error.snippet]
    .filter(Boolean).join('\n')
  stream.write(text + '\n')
}

// Must run before JSON/HTML/JUnit so those reporters only receive redacted
// admin results. This reporter is the sole live console consumer.
export default class QaPrivacyReporter {
  constructor({ stdout = process.stdout, stderr = process.stderr } = {}) {
    this.stdout = stdout
    this.stderr = stderr
    this.cleanupFailures = 0
  }

  printsToStdio() { return true }

  onStdOut(chunk, test) {
    if (!isAdminSpec(test?.location.file)) this.stdout.write(chunk)
  }

  onStdErr(chunk, test) {
    if (!isAdminSpec(test?.location.file)) this.stderr.write(chunk)
  }

  onError(error) {
    writeError(this.stderr, error)
  }

  onTestEnd(test, result) {
    const project = test.parent.project()
    const summary = `[${project.name}] ${test.title} · ${result.status} · ${result.duration} ms · retry ${result.retry}`
    if (!isAdminSpec(test.location.file)) {
      this.stdout.write(summary + '\n')
      for (const error of result.errors) writeError(this.stderr, error)
      return
    }

    const contexts = result.attachments.filter(entry => entry.name === 'error-context')
    const counts = redactAdminResult(result)
    redactAdminAnnotations(test)
    this.stdout.write(`${summary} · ${counts.errorCount} error(s) · ${counts.attachmentCount} attachment(s) · ${counts.stdoutChunks + counts.stderrChunks} suppressed output chunk(s)\n`)
    if (counts.errorCount) this.stderr.write(REDACTED_ADMIN_ERROR + '\n')

    let cleanupOk = false
    try {
      if (project.outputDir === qaOutputDir) {
        const expected = adminErrorContextPath({
          file: test.location.file,
          titles: test.titlePath().slice(3),
          project: project.name,
          outputDir: qaOutputDir,
          retry: result.retry,
          repeat: test.repeatEachIndex,
        })
        const contextsMatch = contexts.every(entry => entry.path === expected && entry.contentType === 'text/markdown')
        cleanupOk = removeAdminErrorContext(expected, expected, qaOutputDir)
          && contextsMatch && isKnownAdminSpec(test.location.file)
      }
    } catch {
      // Keep private error text and filesystem paths out of the console.
    }
    if (!cleanupOk) {
      this.cleanupFailures++
      this.stderr.write('Admin QA error-context cleanup could not be verified.\n')
    }
  }

  onEnd() {
    if (this.cleanupFailures) return { status: 'failed' }
  }
}
