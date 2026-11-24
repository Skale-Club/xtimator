import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'

// Node 24 strips TS types. This hook resolves the fixture's existing relative
// extensionless TS import without installing another runtime on the Surface.
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !extname(specifier) && context.parentURL) {
    const candidate = new URL(specifier + '.ts', context.parentURL)
    if (existsSync(candidate)) return next(candidate.href, context)
  }
  return next(specifier, context)
} })
const { createQaFixture } = await import('../../tests/qa/fixtures/tenant.ts')
const fixture = createQaFixture('http://127.0.0.1:9650')
try {
  await fixture.seed()
  const estimate = await fixture.readEstimate()
  if (Number(estimate?.total) !== fixture.total) throw new Error('Persisted QA total differs from the seeded expectation')
  if (fixture.cookies()[0]?.name !== 'xtimator_session') throw new Error('QA fixture did not issue the current owned-session cookie')
  console.log('QA development fixture persisted its expected total and prepared an owned session.')
} finally {
  await fixture.cleanup()
  console.log('QA development fixture cleanup completed.')
}
