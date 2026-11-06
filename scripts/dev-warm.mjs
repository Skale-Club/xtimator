#!/usr/bin/env node
/**
 * scripts/dev-warm.mjs — hit the main routes once so the dev server compiles
 * them before the first click (SEED-058 §1). Prints a timing table; useful as
 * a quick local benchmark too.
 *
 *   node scripts/dev-warm.mjs                 # http://localhost:9633
 *   node scripts/dev-warm.mjs --port 9634
 *   DEV_WARM_COOKIE="sb-...=..." node scripts/dev-warm.mjs   # authenticated routes
 */
const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const port = portIdx !== -1 ? args[portIdx + 1] : '9633'
const base = `http://localhost:${port}`
const cookie = process.env.DEV_WARM_COOKIE ?? ''

const ROUTES = [
  '/',
  '/api/health?quick=1',
  '/dashboard',
  '/projects',
  '/clients',
  '/price-book',
  '/settings/estimates',
]

async function hit(path) {
  const t0 = performance.now()
  try {
    const res = await fetch(base + path, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    })
    await res.arrayBuffer()
    return { path, ms: Math.round(performance.now() - t0), status: res.status }
  } catch (err) {
    return { path, ms: Math.round(performance.now() - t0), status: `ERR ${err?.cause?.code ?? err?.message ?? err}` }
  }
}

console.log(`[dev-warm] ${base}${cookie ? ' (with session cookie)' : ''}`)
const rows = []
for (const path of ROUTES) {
  rows.push(await hit(path)) // cold (compiles the route)
  rows.push({ ...(await hit(path)), path: `${path} (warm)` })
}
console.table(rows)
