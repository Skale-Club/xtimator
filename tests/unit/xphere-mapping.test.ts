import { describe, it, expect } from 'vitest'
import { buildSyncPayload, XPHERE_STAGES } from '@/lib/integrations/xphere/mapping'
import type { XphereCompanyInput } from '@/lib/integrations/xphere/types'

function makeCompany(
  overrides: Partial<XphereCompanyInput> = {},
): XphereCompanyInput {
  return {
    id: 'company-uuid-1',
    name: 'Acme Landscaping',
    owner_name: 'Jane Doe',
    email: 'jane@acme.test',
    phone: '+15551234567',
    industry: 'landscaping',
    website: 'https://acme.test',
    address: '123 Main St',
    tier: 'pro',
    tier_trial_ends_at: null,
    stripe_customer_id: 'cus_123',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('XPHERE-B3-MAP buildSyncPayload — stage literals', () => {
  it('Test 1: tier pro → stage "Active — Pro", status won', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'pro' }), 'subscription.updated')
    expect(payload.opportunity?.stage).toBe('Active — Pro')
    expect(payload.opportunity?.stage).toBe(XPHERE_STAGES.pro)
    expect(payload.opportunity?.status).toBe('won')
  })

  it('Test 2: tier business → stage "Active — Business", status won', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'business' }), 'subscription.updated')
    expect(payload.opportunity?.stage).toBe('Active — Business')
    expect(payload.opportunity?.stage).toBe(XPHERE_STAGES.business)
    expect(payload.opportunity?.status).toBe('won')
  })

  it('Test 3: tier trial → stage "Trial", status open', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'trial' }), 'company.updated')
    expect(payload.opportunity?.stage).toBe('Trial')
    expect(payload.opportunity?.status).toBe('open')
  })

  it('Test 4: event trial.expired → stage "Churned", status lost', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'pro' }), 'trial.expired')
    expect(payload.opportunity?.stage).toBe('Churned')
    expect(payload.opportunity?.status).toBe('lost')
  })

  it('Test 5: tier free + subscription.updated → stage "Churned", status lost', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'free' }), 'subscription.updated')
    expect(payload.opportunity?.stage).toBe('Churned')
    expect(payload.opportunity?.status).toBe('lost')
  })
})

describe('XPHERE-B3-MAP buildSyncPayload — company + custom_fields', () => {
  it('Test 6: company.id and event are echoed through', () => {
    const company = makeCompany({ id: 'abc-123' })
    const payload = buildSyncPayload(company, 'company.created')
    expect(payload.company.id).toBe('abc-123')
    expect(payload.event).toBe('company.created')
  })

  it('Test 7: tags include xtimator:<tier>', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'pro' }), 'company.updated')
    expect(payload.company.tags).toContain('xtimator:pro')
  })

  it('Test 8: custom_fields snapshot keys + last_event', () => {
    const payload = buildSyncPayload(makeCompany({ tier: 'pro' }), 'estimate.created')
    const cf = payload.company.custom_fields
    expect(cf).toHaveProperty('xtimator_tier')
    expect(cf).toHaveProperty('xtimator_trial_ends_at')
    expect(cf).toHaveProperty('xtimator_stripe_customer_id')
    expect(cf).toHaveProperty('xtimator_signed_up_at')
    expect(cf).toHaveProperty('xtimator_last_event')
    expect(cf.xtimator_last_event).toBe('estimate.created')
  })
})

describe('XPHERE-B3-MAP buildSyncPayload — notes + title', () => {
  it('Test 9: estimate.sent has a non-empty note', () => {
    const payload = buildSyncPayload(makeCompany(), 'estimate.sent')
    expect(payload.note).toBeDefined()
    expect(typeof payload.note?.content).toBe('string')
    expect(payload.note?.content.length).toBeGreaterThan(0)
  })

  it('Test 10: company.updated has no note', () => {
    const payload = buildSyncPayload(makeCompany(), 'company.updated')
    expect(payload.note).toBeUndefined()
  })

  it('Test 11: opportunity.title is "<name> — Subscription"', () => {
    const payload = buildSyncPayload(makeCompany({ name: 'Acme Landscaping' }), 'subscription.updated')
    expect(payload.opportunity?.title).toBe('Acme Landscaping — Subscription')
  })
})
