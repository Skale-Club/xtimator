import { describe, it, expect } from 'vitest'

/**
 * Phase 176 Plan 03 — resolveRecipientZones() derives a recipient's local
 * timezone(s) via a three-tier precedence chain (clients.state -> area-code
 * -> tenant companies.state) and explicitly fails closed (returns null) when
 * none of the three signals resolve. Callers (176-04's send gate) MUST treat
 * null as "block the send" — never guess a default timezone.
 */

describe('lib/notifications/timezone-derive — resolveRecipientZones()', () => {
  it('resolves a single-zone state from clientState', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(resolveRecipientZones({ clientState: 'CA', clientPhone: null, companyState: null })).toEqual({
      zones: ['America/Los_Angeles'],
      source: 'client_state',
    })
  })

  it('is case-insensitive on clientState', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(resolveRecipientZones({ clientState: 'ca', clientPhone: null, companyState: null })).toEqual({
      zones: ['America/Los_Angeles'],
      source: 'client_state',
    })
  })

  it('resolves a split-timezone state (FL) to a multi-zone array', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(resolveRecipientZones({ clientState: 'FL', clientPhone: null, companyState: null })).toEqual({
      zones: ['America/New_York', 'America/Chicago'],
      source: 'client_state',
    })
  })

  it('falls through to area-code tier when clientState is null', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(
      resolveRecipientZones({ clientState: null, clientPhone: '+12125551234', companyState: null }),
    ).toEqual({
      zones: ['America/New_York'],
      source: 'area_code',
    })
  })

  it('falls through to area-code tier when clientState is unrecognized', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(
      resolveRecipientZones({ clientState: 'ZZ', clientPhone: '+14155551234', companyState: null }),
    ).toEqual({
      zones: ['America/Los_Angeles'],
      source: 'area_code',
    })
  })

  it('falls through to company_state tier when NPA is unmapped', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(
      resolveRecipientZones({ clientState: null, clientPhone: '+19995551234', companyState: 'TX' }),
    ).toEqual({
      zones: ['America/Chicago', 'America/Denver'],
      source: 'company_state',
    })
  })

  it('fails closed (returns null) when no tier resolves', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(
      resolveRecipientZones({ clientState: null, clientPhone: null, companyState: null }),
    ).toBeNull()
    expect(
      resolveRecipientZones({ clientState: 'ZZ', clientPhone: '+19995551234', companyState: 'ZZ' }),
    ).toBeNull()
  })

  it('strips formatting punctuation from clientPhone before NPA lookup', async () => {
    const { resolveRecipientZones } = await import('@/lib/notifications/timezone-derive')
    expect(
      resolveRecipientZones({ clientState: null, clientPhone: '(212) 555-1234', companyState: null }),
    ).toEqual({
      zones: ['America/New_York'],
      source: 'area_code',
    })
    expect(
      resolveRecipientZones({ clientState: null, clientPhone: '212-555-1234', companyState: null }),
    ).toEqual({
      zones: ['America/New_York'],
      source: 'area_code',
    })
  })
})
