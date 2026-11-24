import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'

// Read-only diagnostics of the currently deployed release. No login, browser
// scripts, provider action, estimate bearer token or database credential is used.
const origin = 'https://xtimator.com'
const paths = ['/', '/login', '/industries', '/industries/general-contractors', '/blog',
  '/privacy-policy', '/terms-of-service', '/delete-account', '/offline']
const evidence = { checkedAt: new Date().toISOString(), origin, mode: 'anonymous-read-only',
  candidateReadiness: false, deployedRevision: null, pages: [] }
const health = await fetch(`${origin}/api/health?quick=1`, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
const status = await health.json()
if (!health.ok || !/^[0-9a-f]{40}$/.test(status.sha ?? status.commit ?? '')) {
  throw new Error('Production health did not identify a healthy immutable revision')
}
evidence.deployedRevision = status.sha ?? status.commit
for (const path of paths) {
  const response = await fetch(`${origin}${path}`, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  const body = await response.text()
  const headings = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map(match => match[1].replace(/<[^>]+>/g, '').trim())
  const legal = ['/privacy-policy', '/terms-of-service'].includes(path)
  const passed = response.status === 200 && headings.length > 0 && !headings.some(h => /^404\b/.test(h))
    && (!legal || (/<article\b/.test(body) && /Privacy Policy|Terms of Service/i.test(headings.join(' '))))
  evidence.pages.push({ path, status: response.status, headings, passed,
    contentSha256: createHash('sha256').update(body).digest('hex') })
}
mkdirSync('.bg-shell/qa', { recursive: true })
writeFileSync('.bg-shell/qa/production-public-smoke.json', JSON.stringify(evidence, null, 2))
console.log(JSON.stringify(evidence, null, 2))
process.exitCode = evidence.pages.every(page => page.passed) ? 0 : 1
