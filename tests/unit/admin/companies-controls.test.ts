/**
 * Wave 0 — companies-controls.tsx client controls contract.
 * RED until Task 3 creates app/admin/companies/companies-controls.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('companies-controls.tsx: client controls contract', () => {
  const read = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/companies-controls.tsx'), 'utf8')

  it('is a client component', () => {
    try { expect(read()).toMatch(/['"]use client['"]/) }
    catch { expect.fail('Wave 0: app/admin/companies/companies-controls.tsx not yet written') }
  })

  it('Refresh button calls router.refresh()', () => {
    try { expect(read()).toMatch(/router\.refresh\(\)/) }
    catch { expect.fail('Wave 0: app/admin/companies/companies-controls.tsx not yet written') }
  })

  it('pushes filter/search changes via router.replace(', () => {
    try { expect(read()).toMatch(/router\.replace\(/) }
    catch { expect.fail('Wave 0: app/admin/companies/companies-controls.tsx not yet written') }
  })

  it('has three distinct filter param keys (tier, override, demo)', () => {
    try {
      const src = read()
      expect(src).toMatch(/pushParam\(\s*['"]tier['"]/)
      expect(src).toMatch(/pushParam\(\s*['"]override['"]/)
      expect(src).toMatch(/pushParam\(\s*['"]demo['"]/)
    } catch { expect.fail('Wave 0: app/admin/companies/companies-controls.tsx not yet written') }
  })

  it('search input commits on Enter (onKeyDown) and on blur (onBlur)', () => {
    try {
      const src = read()
      expect(src).toMatch(/onKeyDown/)
      expect(src).toMatch(/onBlur/)
    } catch { expect.fail('Wave 0: app/admin/companies/companies-controls.tsx not yet written') }
  })
})
