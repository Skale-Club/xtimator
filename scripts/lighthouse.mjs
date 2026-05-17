#!/usr/bin/env node
// scripts/lighthouse.mjs
// Usage: bun scripts/lighthouse.mjs http://localhost:9633/ http://localhost:9633/dashboard
//
// Phase 71 perf gate runner. Records Lighthouse perf/a11y/best-practices/seo
// scores for the given URLs and prints a markdown table. Fails (exit 2) if any
// URL scores below 80 on perf or a11y.
//
// If lighthouse/chrome-launcher aren't installed, exits 0 with an install hint
// (this is a phase gate, not a build step — install during Plan 71-10).

const urls = process.argv.slice(2)
if (!urls.length) {
  console.error('Usage: bun scripts/lighthouse.mjs <url> [<url>...]')
  process.exit(1)
}

let lighthouse, launch
try {
  ;({ default: lighthouse } = await import('lighthouse'))
  ;({ launch } = await import('chrome-launcher'))
} catch (_e) {
  console.error('lighthouse not installed. Run: bun add -d lighthouse chrome-launcher')
  process.exit(0)
}

const chrome = await launch({ chromeFlags: ['--headless=new'] })
const rows = []
for (const url of urls) {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  })
  const c = result.lhr.categories
  rows.push({
    url,
    perf: Math.round((c.performance?.score ?? 0) * 100),
    a11y: Math.round((c.accessibility?.score ?? 0) * 100),
    bp: Math.round((c['best-practices']?.score ?? 0) * 100),
    seo: Math.round((c.seo?.score ?? 0) * 100),
  })
}
await chrome.kill()

const md = [
  '| URL | Performance | Accessibility | Best Practices | SEO |',
  '|-----|-------------|---------------|----------------|-----|',
  ...rows.map((r) => `| ${r.url} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} |`),
].join('\n')
console.log(md)

const failures = rows.filter((r) => r.perf < 80 || r.a11y < 80)
if (failures.length) {
  console.error('\nFAIL: perf or a11y below 80:', failures.map((f) => f.url).join(', '))
  process.exit(2)
}
