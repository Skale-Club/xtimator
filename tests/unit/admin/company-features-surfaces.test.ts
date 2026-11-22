import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('admin feature surfaces (static source)', () => {
  it('detail page uses the resolver and the shared column list', () => {
    const src = read('app/admin/companies/[id]/page.tsx')
    expect(src).toContain('resolveCompanyFeatures')
    expect(src).toContain('COMPANY_FEATURE_COLUMNS')
    expect(src).toContain('getPlatformFeatureState')
    expect(src).toContain("'open'")
    expect(src).toContain('CompanyFeaturesForm')
  })

  it('list page filters via the payments search param on the allowed column', () => {
    const src = read('app/admin/companies/page.tsx')
    expect(src).toContain('sp.payments')
    expect(src).toContain("'online_payments_allowed'")
    expect(src).toContain("params.set('payments'")
    const ctl = read('app/admin/companies/companies-controls.tsx')
    expect(ctl).toContain("pushParam('payments'")
  })

  it('billing form no longer passes connectPaymentsOpen through unchanged', () => {
    const src = read('app/admin/integrations/billing-config-form.tsx')
    expect(src).not.toContain('connectPaymentsOpen: current.connectPaymentsOpen')
    expect(src).toContain('Client payments open (Stripe Connect)')
  })
})
