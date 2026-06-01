/**
 * Wave 0 — ADMINLOG-03: refresh control static contract.
 * Tests: static source assertion that the refresh button calls router.refresh().
 * RED until Plan 93-02 creates app/admin/events/events-controls.tsx.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('ADMINLOG-03: refresh control calls router.refresh()', () => {
  it('events-controls.tsx contains router.refresh()', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'app/admin/events/events-controls.tsx'),
        'utf8'
      )
      expect(src).toMatch(/router\.refresh\(\)/)
    } catch {
      expect.fail('Wave 0: app/admin/events/events-controls.tsx not yet written')
    }
  })

  it('events-controls.tsx is a client component ("use client" directive present)', () => {
    try {
      const src = readFileSync(
        resolve(process.cwd(), 'app/admin/events/events-controls.tsx'),
        'utf8'
      )
      expect(src).toMatch(/['"]use client['"]/)
    } catch {
      expect.fail('Wave 0: app/admin/events/events-controls.tsx not yet written')
    }
  })
})
