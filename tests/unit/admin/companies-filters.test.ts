/**
 * Wave 0 — ADMINCO-02: tier / AI-override / demo-vs-real filter chain.
 * RED until Task 2 rewrites app/admin/companies/page.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('companies/page.tsx: tier / AI-override / demo-vs-real filter chain', () => {
  const read = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')

  it("applies .eq('tier', ...) when tier filter active", () => {
    try { expect(read()).toMatch(/\.eq\(\s*['"]tier['"]/) }
    catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('applies both branches of the AI-override tri-state filter', () => {
    try {
      const src = read()
      expect(src).toMatch(/\.not\(\s*['"]ai_model_override['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/)
      expect(src).toMatch(/\.is\(\s*['"]ai_model_override['"]\s*,\s*null\s*\)/)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('applies both branches of the demo-vs-real tri-state filter', () => {
    try {
      const src = read()
      expect(src).toMatch(/\.not\(\s*['"]demo_estimate_quota['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/)
      expect(src).toMatch(/\.is\(\s*['"]demo_estimate_quota['"]\s*,\s*null\s*\)/)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })

  it('derives tier options from lib/entitlements, not a new hardcoded array', () => {
    try {
      const src = read()
      expect(src).toMatch(/from\s+['"]@\/lib\/entitlements['"]/)
      expect(src).toMatch(/tiers/)
    } catch { expect.fail('Wave 0: app/admin/companies/page.tsx not yet written') }
  })
})
