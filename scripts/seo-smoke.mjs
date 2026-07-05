#!/usr/bin/env node

const args = process.argv.slice(2)
const allowPredeployFailures = args.includes('--allow-predeploy-failures')
const baseArg = args.find((arg) => !arg.startsWith('--'))
if (!baseArg) {
  console.error('Usage: node scripts/seo-smoke.mjs <base-url> [--allow-predeploy-failures]')
  process.exit(1)
}

const base = new URL(baseArg.endsWith('/') ? baseArg : `${baseArg}/`)
const canonicalArg = args.find((arg) => arg.startsWith('--canonical-origin='))
const canonicalBase = new URL(
  canonicalArg ? canonicalArg.slice('--canonical-origin='.length) : base.toString(),
)
const failures = []

function check(condition, message) {
  if (condition) console.log(`PASS ${message}`)
  else {
    failures.push(message)
    console.error(`FAIL ${message}`)
  }
}

async function fetchPage(pathname) {
  const response = await fetch(new URL(pathname, base), { redirect: 'follow' })
  return { response, body: await response.text() }
}

const robots = await fetchPage('/robots.txt')
check(robots.response.ok, '/robots.txt returns 200')
check(robots.body.includes('sitemap.xml'), '/robots.txt references sitemap.xml')

const sitemap = await fetchPage('/sitemap.xml')
check(sitemap.response.ok, '/sitemap.xml returns 200')
check(sitemap.body.includes('<urlset'), '/sitemap.xml is XML sitemap output')
check(!/\/(admin|api|demo|estimate|settings)\//.test(sitemap.body), 'sitemap excludes private routes')

for (const pathname of ['/', '/industries/general-contractors']) {
  const { response, body } = await fetchPage(pathname)
  const expectedCanonical = new URL(pathname, canonicalBase).toString()
  check(response.ok, `${pathname} returns 200`)
  const canonicalMatch = body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)
  const normalizeUrl = (value) => value.replace(/\/$/, '')
  check(
    canonicalMatch && normalizeUrl(canonicalMatch[1]) === normalizeUrl(expectedCanonical),
    `${pathname} has self-canonical`,
  )
  check(/property="og:url"/.test(body), `${pathname} has og:url`)
  check(/property="og:type"/.test(body), `${pathname} has og:type`)
  check(/name="twitter:card"/.test(body), `${pathname} has Twitter card`)
  check(/application\/ld\+json/.test(body), `${pathname} has JSON-LD`)
  const cacheControl = response.headers.get('cache-control') ?? ''
  check(!/private|no-store/i.test(cacheControl), `${pathname} is not private/no-store`)
}

const demo = await fetchPage('/demo')
check(/name="robots" content="noindex, nofollow/.test(demo.body), '/demo emits noindex, nofollow')

if (failures.length) {
  console.error(`\n${failures.length} SEO smoke check(s) failed.`)
  process.exit(allowPredeployFailures ? 0 : 2)
}

console.log('\nSEO smoke checks passed.')
