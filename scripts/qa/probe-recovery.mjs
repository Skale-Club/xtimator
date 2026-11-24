import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { recoverQaCampaign } from './cleanup.mjs'

// An independent local probe must never select an actual running CI campaign.
if (process.env.GITHUB_RUN_ID) throw new Error('Recovery probe must run outside GitHub Actions')
Object.assign(process.env, {
  GITHUB_RUN_ID: `${Date.now()}9`, GITHUB_RUN_ATTEMPT: '1', QA_CAMPAIGN_ATTEMPT: '1',
})
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !extname(specifier) && context.parentURL) {
    const candidate = new URL(specifier + '.ts', context.parentURL)
    if (existsSync(candidate)) return next(candidate.href, context)
  }
  return next(specifier, context)
} })
const { createQaFixture } = await import('../../tests/qa/fixtures/tenant.ts')
const fixture = createQaFixture('http://127.0.0.1:9650')
const started = Date.now()
try {
  await fixture.seed()
  const result = await recoverQaCampaign()
  if (result.matchedAccounts !== 1 || result.deletedAccounts !== 1 || result.erasedCompanies !== 1 || result.deletedSessions !== 1) {
    throw new Error('Recovery probe did not erase exactly its own synthetic fixture')
  }
  if (await fixture.readCompany() || await fixture.readEstimate()) throw new Error('Recovery probe found remaining synthetic tenant data')
  console.log(JSON.stringify({ probe: 'development-recovery', passed: true, ...result, elapsedMs: Date.now() - started }))
} finally {
  await fixture.cleanup()
}
