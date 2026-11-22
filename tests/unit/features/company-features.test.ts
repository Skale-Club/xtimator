import { describe, expect, it } from 'vitest'
import {
  COMPANY_FEATURE_COLUMNS,
  resolveCompanyFeatures,
  type CompanyFeatureRow,
} from '@/lib/features/company-features'

const open = { connectPaymentsOpen: true }
const closed = { connectPaymentsOpen: false }

const healthyPayments: CompanyFeatureRow = {
  online_payments_allowed: true,
  online_payments_enabled: true,
  stripe_account_id: 'acct_test_123',
  stripe_connect_status: 'active',
  stripe_charges_enabled: true,
}

describe('COMPANY_FEATURE_COLUMNS', () => {
  it('lists every key of CompanyFeatureRow', () => {
    const keys: (keyof CompanyFeatureRow)[] = [
      'online_payments_allowed',
      'online_payments_enabled',
      'digital_signature_allowed',
      'digital_signature_enabled',
      'stripe_account_id',
      'stripe_connect_status',
      'stripe_charges_enabled',
    ]
    const listed = COMPANY_FEATURE_COLUMNS.split(',').map((c) => c.trim())
    expect([...listed].sort()).toEqual([...keys].sort())
  })
})

describe('resolveCompanyFeatures: fail closed', () => {
  it.each([null, undefined, {}])('everything is off for %j', (company) => {
    const f = resolveCompanyFeatures(company, open)
    expect(f.onlinePayments).toEqual({
      allowed: false, enabled: false, linked: false, healthy: false,
      restricted: false, canConnect: false, canIssue: false, showInSettings: false,
    })
    expect(f.digitalSignature).toEqual({
      allowed: false, enabled: false, active: false, showInSettings: false,
    })
  })
})

describe('resolveCompanyFeatures: online payments', () => {
  it('allowed + enabled + healthy can issue', () => {
    const p = resolveCompanyFeatures(healthyPayments, open).onlinePayments
    expect(p).toMatchObject({ allowed: true, enabled: true, linked: true, healthy: true, restricted: false, canIssue: true, canConnect: false, showInSettings: true })
  })

  it('allowed but tenant switch off cannot issue or connect', () => {
    const p = resolveCompanyFeatures({ ...healthyPayments, online_payments_enabled: false }, open).onlinePayments
    expect(p.allowed).toBe(true)
    expect(p.canIssue).toBe(false)
    const unlinked = resolveCompanyFeatures({ online_payments_allowed: true, online_payments_enabled: false }, open).onlinePayments
    expect(unlinked.canConnect).toBe(false)
    expect(unlinked.showInSettings).toBe(true)
  })

  it('tenant on but platform off cannot issue or connect', () => {
    const p = resolveCompanyFeatures({ ...healthyPayments, online_payments_allowed: false }, open).onlinePayments
    expect(p.allowed).toBe(false)
    expect(p.canIssue).toBe(false)
    expect(p.canConnect).toBe(false)
    const unlinked = resolveCompanyFeatures({ online_payments_allowed: false, online_payments_enabled: true }, open).onlinePayments
    expect(unlinked.canConnect).toBe(false)
    expect(unlinked.showInSettings).toBe(false)
  })

  it('global stop closed turns allowed/canConnect/canIssue off but keeps linked and showInSettings', () => {
    const p = resolveCompanyFeatures(healthyPayments, closed).onlinePayments
    expect(p.allowed).toBe(false)
    expect(p.canIssue).toBe(false)
    expect(p.canConnect).toBe(false)
    expect(p.linked).toBe(true)
    expect(p.showInSettings).toBe(true)
    const unlinked = resolveCompanyFeatures({ online_payments_allowed: true, online_payments_enabled: true }, closed).onlinePayments
    expect(unlinked.canConnect).toBe(false)
  })

  it('linked + restricted status is restricted, not healthy, cannot issue', () => {
    const p = resolveCompanyFeatures({ ...healthyPayments, stripe_connect_status: 'restricted' }, open).onlinePayments
    expect(p).toMatchObject({ linked: true, healthy: false, restricted: true, canIssue: false })
  })

  it('linked + stripe_charges_enabled false is restricted', () => {
    const p = resolveCompanyFeatures({ ...healthyPayments, stripe_charges_enabled: false }, open).onlinePayments
    expect(p).toMatchObject({ healthy: false, restricted: true, canIssue: false })
  })

  it('linked + stripe_charges_enabled null (legacy) stays healthy', () => {
    const p = resolveCompanyFeatures({ ...healthyPayments, stripe_charges_enabled: null }, open).onlinePayments
    expect(p).toMatchObject({ healthy: true, restricted: false, canIssue: true })
  })

  it('status disconnected with no account id is not linked', () => {
    const p = resolveCompanyFeatures(
      { online_payments_allowed: true, online_payments_enabled: true, stripe_connect_status: 'disconnected', stripe_account_id: null },
      open,
    ).onlinePayments
    expect(p).toMatchObject({ linked: false, healthy: false, restricted: false, canIssue: false, canConnect: true })
  })

  it('canConnect only when allowed, enabled and not linked', () => {
    const base = { online_payments_allowed: true, online_payments_enabled: true }
    expect(resolveCompanyFeatures(base, open).onlinePayments.canConnect).toBe(true)
    expect(resolveCompanyFeatures({ ...base, stripe_account_id: 'acct_test_123' }, open).onlinePayments.canConnect).toBe(false)
    expect(resolveCompanyFeatures({ ...base, online_payments_enabled: false }, open).onlinePayments.canConnect).toBe(false)
    expect(resolveCompanyFeatures({ ...base, online_payments_allowed: false }, open).onlinePayments.canConnect).toBe(false)
  })

  it('cannot issue when the linked status is disconnected or pending', () => {
    for (const status of ['disconnected', 'pending']) {
      const p = resolveCompanyFeatures({ ...healthyPayments, stripe_connect_status: status }, open).onlinePayments
      expect(p).toMatchObject({ linked: true, healthy: false, canIssue: false })
    }
  })

  it('cannot issue without an account id even if the status says active, or when never connected', () => {
    const active = resolveCompanyFeatures({ ...healthyPayments, stripe_account_id: null }, open).onlinePayments
    expect(active).toMatchObject({ linked: false, healthy: false, canIssue: false })
    const never = resolveCompanyFeatures(
      { online_payments_allowed: true, online_payments_enabled: true, stripe_account_id: null, stripe_connect_status: null },
      open,
    ).onlinePayments
    expect(never).toMatchObject({ linked: false, healthy: false, canIssue: false })
  })

  it('stays healthy when stripe_charges_enabled is omitted entirely (legacy row shape)', () => {
    const { stripe_charges_enabled: _omit, ...legacy } = healthyPayments
    void _omit
    expect(resolveCompanyFeatures(legacy, open).onlinePayments).toMatchObject({ healthy: true, canIssue: true })
  })

  it('showInSettings stays true when not allowed but still linked', () => {
    const p = resolveCompanyFeatures({ online_payments_allowed: false, stripe_account_id: 'acct_test_123', stripe_connect_status: 'active' }, open).onlinePayments
    expect(p.showInSettings).toBe(true)
    expect(p.canIssue).toBe(false)
  })
})

describe('resolveCompanyFeatures: digital signature', () => {
  it('allowed + enabled is active', () => {
    expect(resolveCompanyFeatures({ digital_signature_allowed: true, digital_signature_enabled: true }, open).digitalSignature)
      .toEqual({ allowed: true, enabled: true, active: true, showInSettings: true })
  })

  it('allowed only is not active but shows in settings', () => {
    expect(resolveCompanyFeatures({ digital_signature_allowed: true, digital_signature_enabled: false }, open).digitalSignature)
      .toEqual({ allowed: true, enabled: false, active: false, showInSettings: true })
  })

  it('enabled only (platform off) is not active and hidden from settings', () => {
    expect(resolveCompanyFeatures({ digital_signature_allowed: false, digital_signature_enabled: true }, open).digitalSignature)
      .toEqual({ allowed: false, enabled: true, active: false, showInSettings: false })
  })

  it('neither is off', () => {
    const s = resolveCompanyFeatures({ digital_signature_allowed: false, digital_signature_enabled: false }, open).digitalSignature
    expect(s.active).toBe(false)
    expect(s.showInSettings).toBe(false)
  })

  it('is independent of the payments global stop', () => {
    expect(resolveCompanyFeatures({ digital_signature_allowed: true, digital_signature_enabled: true }, closed).digitalSignature.active).toBe(true)
  })
})
