import { describe, it, expect } from 'vitest'

/**
 * lib/notifications/platform-events.ts — Phase 175 (PLAT-01) platform-event catalog.
 *
 * A typed catalog of PLATFORM-scoped alert kinds, distinct from the tenant
 * `EventType` (lib/notifications/event-types.ts). Covers:
 *  - the exact 10-kind set-equality (4 new tenant kinds + 6 already-shipped
 *    reliability kinds)
 *  - every kind has a non-empty label, a valid category, and a boolean locked
 *  - the locked set is EXACTLY { pipeline_stuck, cron_failed }
 *  - isLockedPlatformEvent() true for the 2 locked kinds, false for every
 *    other cataloged kind and an unknown string
 */

import {
  PLATFORM_EVENTS,
  PLATFORM_EVENT_KINDS,
  LOCKED_PLATFORM_EVENT_KINDS,
  isLockedPlatformEvent,
  type PlatformEventKind,
} from '@/lib/notifications/platform-events'

const EXPECTED_KINDS: PlatformEventKind[] = [
  'tenant_signup',
  'tenant_payment_received',
  'subscription_payment_received',
  'tenant_quota_exhausted',
  'estimate_generation_failed',
  'transcription_failed',
  'vision_failed',
  'ai_fallback',
  'pipeline_stuck',
  'cron_failed',
]

describe('lib/notifications/platform-events', () => {
  it('PLATFORM_EVENT_KINDS is set-equal to the exact 10 expected kinds', () => {
    expect(new Set(PLATFORM_EVENT_KINDS)).toEqual(new Set(EXPECTED_KINDS))
    expect(PLATFORM_EVENT_KINDS).toHaveLength(10)
  })

  it('tenant_payment_received and subscription_payment_received are distinct kinds', () => {
    expect(PLATFORM_EVENTS.tenant_payment_received.kind).toBe('tenant_payment_received')
    expect(PLATFORM_EVENTS.subscription_payment_received.kind).toBe('subscription_payment_received')
    expect(PLATFORM_EVENTS.tenant_payment_received.kind).not.toBe(
      PLATFORM_EVENTS.subscription_payment_received.kind
    )
  })

  it('every cataloged kind has a non-empty label, a valid category, and a boolean locked', () => {
    for (const kind of PLATFORM_EVENT_KINDS) {
      const def = PLATFORM_EVENTS[kind]
      expect(def.kind).toBe(kind)
      expect(typeof def.label).toBe('string')
      expect(def.label.length).toBeGreaterThan(0)
      expect(['tenant', 'job_failure', 'critical']).toContain(def.category)
      expect(typeof def.locked).toBe('boolean')
    }
  })

  it('LOCKED_PLATFORM_EVENT_KINDS is EXACTLY { pipeline_stuck, cron_failed }', () => {
    expect(LOCKED_PLATFORM_EVENT_KINDS).toEqual(new Set(['pipeline_stuck', 'cron_failed']))
  })

  it('isLockedPlatformEvent returns true for pipeline_stuck and cron_failed', () => {
    expect(isLockedPlatformEvent('pipeline_stuck')).toBe(true)
    expect(isLockedPlatformEvent('cron_failed')).toBe(true)
  })

  it('isLockedPlatformEvent returns false for every other cataloged kind', () => {
    const nonLocked = EXPECTED_KINDS.filter((k) => k !== 'pipeline_stuck' && k !== 'cron_failed')
    for (const kind of nonLocked) {
      expect(isLockedPlatformEvent(kind)).toBe(false)
    }
  })

  it('isLockedPlatformEvent returns false for an unknown kind string', () => {
    expect(isLockedPlatformEvent('nonexistent_kind')).toBe(false)
  })
})
