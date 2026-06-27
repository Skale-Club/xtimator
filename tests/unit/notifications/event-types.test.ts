import { describe, it, expect } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the reduced event catalog (NOTIF-01).
 *
 * The module `@/lib/notifications/event-types` ALREADY EXISTS, but today it
 * carries 8 categories (estimate | payment | trial | quota | whatsapp | ai_job
 * | admin | system) and a 2-channel DEFAULT_PREFERENCES. Wave 1 reduces the set
 * to `estimate | billing | system | _dropped` and widens defaults to 4 channels.
 *
 * These are ASSERTION-fail RED tests (the import resolves; the current values
 * differ) — a valid RED form. Wave 1 turns them GREEN.
 *
 * Owner: Wave 1 (104.1 — category reduction + event remap + 4-channel defaults).
 */

import {
  EVENT_CATEGORIES,
  DROPPED_EVENT_TYPES,
  DEFAULT_PREFERENCES,
  getCategoryForEvent,
  isVisibleNotificationEventType,
} from '@/lib/notifications/event-types'

const ALLOWED_CATEGORIES = ['estimate', 'billing', 'system', '_dropped']

describe('lib/notifications/event-types — reduced catalog (NOTIF-01 RED)', () => {
  it('every EVENT_CATEGORIES value is one of estimate/billing/system/_dropped', () => {
    const distinct = [...new Set(Object.values(EVENT_CATEGORIES))]
    for (const cat of distinct) {
      expect(ALLOWED_CATEGORIES).toContain(cat)
    }
    // Explicitly: none of the old categories survive as a value.
    expect(distinct).not.toContain('payment')
    expect(distinct).not.toContain('trial')
    expect(distinct).not.toContain('quota')
    expect(distinct).not.toContain('whatsapp')
    expect(distinct).not.toContain('ai_job')
    expect(distinct).not.toContain('admin')
  })

  it('billing-source events map to "billing"', () => {
    expect(getCategoryForEvent('payment.received')).toBe('billing')
    expect(getCategoryForEvent('trial.expiring_3d')).toBe('billing')
    expect(getCategoryForEvent('quota.80pct')).toBe('billing')
    expect(getCategoryForEvent('admin.tier_changed')).toBe('billing')
  })

  it('dropped events map to "_dropped"', () => {
    expect(getCategoryForEvent('whatsapp.inbound')).toBe('_dropped')
    expect(getCategoryForEvent('ai_job.failed')).toBe('_dropped')
    expect(getCategoryForEvent('ai_job.completed')).toBe('_dropped')
    expect(DROPPED_EVENT_TYPES).toEqual([
      'whatsapp.inbound',
      'ai_job.failed',
      'ai_job.completed',
    ])
    expect(isVisibleNotificationEventType('whatsapp.inbound')).toBe(false)
    expect(isVisibleNotificationEventType('estimate.viewed')).toBe(true)
  })

  it('estimate + system events keep their category', () => {
    expect(getCategoryForEvent('estimate.viewed')).toBe('estimate')
    expect(getCategoryForEvent('system.maintenance')).toBe('system')
  })

  it('DEFAULT_PREFERENCES has 4-channel shape; whatsapp+sms default false', () => {
    for (const cat of ['estimate', 'billing', 'system'] as const) {
      const pref = (DEFAULT_PREFERENCES as unknown as Record<string, Record<string, boolean>>)[cat]
      expect(pref).toBeDefined()
      expect(Object.keys(pref).sort()).toEqual(['email', 'in_app', 'sms', 'whatsapp'])
      expect(pref.whatsapp).toBe(false)
      expect(pref.sms).toBe(false)
    }
  })
})
