// Radix UI components (RadioGroup, Select, etc.) use ResizeObserver internally.
// JSDOM doesn't implement it, so provide a no-op stub.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/**
 * Test setup: load .env.local into process.env before tests run.
 *
 * Integration tests hit the real Supabase project (see tests/integration/*.test.ts),
 * so they need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Unit tests don't need these but it's harmless for them to be present.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const envFile = resolve(process.cwd(), '.env.local')
if (existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    // Strip matching surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}
