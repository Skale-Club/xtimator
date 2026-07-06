/**
 * Phase 152-03 (CREDITUI-04 gap closure) — guard test.
 *
 * Locks in that `admin.bonus_credits_granted`'s notification body never
 * surfaces a raw credit count to the tenant. This is the third and final
 * named CREDITUI-04 surface (Plans page + topbar chip were closed in
 * 152-01/152-02); this test closes the notification-copy surface.
 */

import { describe, it, expect } from 'vitest'
import { buildNotificationCopy } from '@/lib/notifications/copy'

describe('admin.bonus_credits_granted tenant-neutral copy', () => {
  it('never renders a digit, regardless of how large ctx.credits is', () => {
    const { body } = buildNotificationCopy('admin.bonus_credits_granted', {
      credits: 500,
    })

    expect(body).not.toMatch(/\d/)
  })

  it('is still a coherent, non-empty sentence when ctx.credits is absent', () => {
    const { body } = buildNotificationCopy('admin.bonus_credits_granted', {})

    expect(body.length).toBeGreaterThan(0)
    expect(body.trim().endsWith('.')).toBe(true)
    expect(body).not.toMatch(/\d/)
  })
})
