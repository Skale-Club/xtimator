#!/usr/bin/env node

const urls = process.argv.slice(2)
if (!urls.length) {
  console.error('Usage: node scripts/lighthouse.mjs <url> [<url>...]')
  process.exit(1)
}

let lighthouse, launch, desktopConfig
try {
  ;({ default: lighthouse } = await import('lighthouse'))
  ;({ launch } = await import('chrome-launcher'))
  ;({ default: desktopConfig } = await import('lighthouse/core/config/desktop-config.js'))
} catch (_error) {
  console.error('lighthouse is required. Run: npm install --save-dev lighthouse chrome-launcher')
  process.exit(1)
}

const chrome = await launch({ chromeFlags: ['--headless=new', '--no-sandbox'] })
const rows = []
try {
  for (const url of urls) {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    }, desktopConfig)
    if (result.lhr.runtimeError) {
      throw new Error(`${url}: ${result.lhr.runtimeError.code} - ${result.lhr.runtimeError.message}`)
    }
    const categories = result.lhr.categories
    rows.push({
      url,
      perf: Math.round((categories.performance?.score ?? 0) * 100),
      a11y: Math.round((categories.accessibility?.score ?? 0) * 100),
      bp: Math.round((categories['best-practices']?.score ?? 0) * 100),
      seo: Math.round((categories.seo?.score ?? 0) * 100),
    })
  }
} finally {
  try {
    await chrome.kill()
  } catch (error) {
    if (error?.code !== 'EPERM') throw error
    console.warn('Warning: Chrome exited but its temporary profile could not be removed on Windows.')
  }
}

console.log([
  '| URL | Performance | Accessibility | Best Practices | SEO |',
  '|-----|-------------|---------------|----------------|-----|',
  ...rows.map((row) => `| ${row.url} | ${row.perf} | ${row.a11y} | ${row.bp} | ${row.seo} |`),
].join('\n'))

const failures = rows.filter((row) => row.perf < 85 || row.a11y < 85 || row.seo < 95)
if (failures.length) {
  console.error(
    '\nFAIL: required thresholds are performance >=85, accessibility >=85, SEO >=95:',
    failures.map((row) => row.url).join(', '),
  )
  process.exit(2)
}
