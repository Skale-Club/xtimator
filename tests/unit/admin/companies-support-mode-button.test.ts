import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readButton = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/support-mode-button.tsx'), 'utf8')
const readPage = () => readFileSync(resolve(process.cwd(), 'app/admin/companies/page.tsx'), 'utf8')

describe('app/admin/companies/support-mode-button.tsx: contract', () => {
  it('imports startSupportSession from @/lib/auth/support-mode', () => {
    try {
      expect(readButton()).toMatch(/startSupportSession/)
      expect(readButton()).toMatch(/from\s+['"]@\/lib\/auth\/support-mode['"]/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/support-mode-button.tsx not yet written')
    }
  })

  it('uses the Eye icon (visually distinct from HandoffButton\'s Send icon)', () => {
    try {
      expect(readButton()).toMatch(/Eye/)
      expect(readButton()).not.toMatch(/\bSend\b/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/support-mode-button.tsx not yet written')
    }
  })

  it('label reads "Support Mode →"', () => {
    try {
      expect(readButton()).toMatch(/Support Mode/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/support-mode-button.tsx not yet written')
    }
  })

  it('is a client component with an error-handling path — mirrors HandoffButton (\'use client\' + useTransition + toast.error)', () => {
    try {
      const src = readButton()
      expect(src).toMatch(/^\s*['"]use client['"]/m)
      expect(src).toMatch(/useTransition/)
      expect(src).toMatch(/toast\.error\(/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/support-mode-button.tsx not yet written, or missing the required error-handling path (\'use client\' / useTransition / toast.error)')
    }
  })
})

describe('app/admin/companies/page.tsx: renders Support Mode row action in both table sections', () => {
  it('source references the Support Mode row action', () => {
    try {
      expect(readPage()).toMatch(/Support Mode/)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet updated with Support Mode row action')
    }
  })

  it('row action ordering: HandoffButton before Support Mode before Configure, in the Demo Accounts section', () => {
    try {
      const src = readPage()
      const handoffIdx = src.indexOf('HandoffButton')
      const supportIdx = src.indexOf('Support Mode', handoffIdx)
      const configureIdx = src.indexOf('Configure', supportIdx)
      expect(handoffIdx).toBeGreaterThan(-1)
      expect(supportIdx).toBeGreaterThan(handoffIdx)
      expect(configureIdx).toBeGreaterThan(supportIdx)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet updated with Support Mode row action')
    }
  })

  it('the All Companies section also renders the Support Mode row action (appears more than once in the file)', () => {
    try {
      const src = readPage()
      const matches = src.match(/Support Mode/g) ?? []
      expect(matches.length).toBeGreaterThanOrEqual(2)
    } catch {
      expect.fail('Wave 0: app/admin/companies/page.tsx not yet updated with Support Mode row action')
    }
  })
})
