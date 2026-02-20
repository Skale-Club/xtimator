/**
 * Sitemap Test Script
 * 
 * This script tests the sitemap generation locally
 * Run with: bun run scripts/test-sitemap.ts
 */

import sitemap from '../app/sitemap'
import robots from '../app/robots'

console.log('🔍 Testing Sitemap Generation...\n')

// Test sitemap
console.log('📄 Sitemap Entries:')
console.log('─'.repeat(80))

const sitemapEntries = sitemap()
console.log(`Total URLs: ${sitemapEntries.length}\n`)

// Group by priority
const byPriority = sitemapEntries.reduce((acc, entry) => {
  const priority = (entry.priority ?? 0.5).toString()
  if (!acc[priority]) acc[priority] = []
  acc[priority].push(entry)
  return acc
}, {} as Record<string, typeof sitemapEntries>)

Object.entries(byPriority)
  .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
  .forEach(([priority, entries]) => {
    console.log(`\nPriority ${priority}:`)
    entries.forEach(entry => {
      console.log(`  - ${entry.url}`)
      console.log(`    Frequency: ${entry.changeFrequency}`)
    })
  })

// Test robots.txt
console.log('\n\n🤖 Robots.txt:')
console.log('─'.repeat(80))

const robotsConfig = robots()
console.log('Rules:', JSON.stringify(robotsConfig.rules, null, 2))
console.log('Sitemap:', robotsConfig.sitemap)

console.log('\n✅ Test complete!\n')
