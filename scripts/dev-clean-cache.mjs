#!/usr/bin/env node
/**
 * scripts/dev-clean-cache.mjs — purge the Turbopack dev cache only when it has
 * grown past a size cap (SEED-058 §1).
 *
 * `npm run dev` used to `rimraf .next` on every start, which threw away the
 * persistent cache that makes the SECOND start fast, while a long-lived dev
 * server let `.next/dev/cache` grow unbounded (measured 9.57 GB on 2026-11-06,
 * with the dev process at 9.9 GB RSS). This keeps the cache while it is
 * useful and resets it once it is clearly past that point.
 *
 *   node scripts/dev-clean-cache.mjs            # purge when > 2 GB
 *   node scripts/dev-clean-cache.mjs --max-gb 1 # custom cap
 *   node scripts/dev-clean-cache.mjs --force    # always purge
 */
import { rm, stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_DIR = join(process.cwd(), '.next', 'dev', 'cache')
const args = process.argv.slice(2)
const force = args.includes('--force')
const maxGbIdx = args.indexOf('--max-gb')
const maxGb = maxGbIdx !== -1 ? Number(args[maxGbIdx + 1]) : 2
const MAX_BYTES = (Number.isFinite(maxGb) && maxGb > 0 ? maxGb : 2) * 1024 ** 3

async function dirSize(dir) {
  let total = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += await dirSize(full)
    else if (entry.isFile()) {
      try {
        total += (await stat(full)).size
      } catch {
        // file vanished mid-walk — ignore
      }
    }
  }
  return total
}

const bytes = await dirSize(CACHE_DIR)
const gb = (bytes / 1024 ** 3).toFixed(2)
if (bytes === 0) {
  console.log('[dev-clean-cache] no Turbopack cache yet')
} else if (force || bytes > MAX_BYTES) {
  await rm(CACHE_DIR, { recursive: true, force: true })
  console.log(`[dev-clean-cache] purged .next/dev/cache (${gb} GB${force ? ', --force' : `, cap ${maxGb} GB`})`)
} else {
  console.log(`[dev-clean-cache] keeping .next/dev/cache (${gb} GB, cap ${maxGb} GB)`)
}
