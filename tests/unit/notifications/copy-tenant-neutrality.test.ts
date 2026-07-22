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

/**
 * Phase 173 plan 01 — the same CREDITUI-04 invariant, re-pointed at the
 * DB-template era: the admin editor's save/preview gate must be structurally
 * unable to reintroduce a raw credit count into this event's tenant-facing
 * copy. `@/lib/notifications/template-catalog` and
 * `@/lib/notifications/template-validation` do not exist yet at RED time —
 * lazy `await import` inside each test keeps this describe block collectable
 * (and its own RED isolated) without breaking the two pre-existing tests
 * above, which import `@/lib/notifications/copy` (already shipped) at the
 * top of the file.
 */
describe('admin.bonus_credits_granted template-editor guard (TMPL-04 / Phase 173)', () => {
  it('getEventVariableCatalog returns an empty catalog for this event', async () => {
    const { getEventVariableCatalog } = await import('@/lib/notifications/template-catalog')
    expect(getEventVariableCatalog('admin.bonus_credits_granted')).toEqual([])
  })

  it('validateTemplateVariables rejects any {{var}} reference for this event', async () => {
    const { validateTemplateVariables } = await import('@/lib/notifications/template-validation')
    const result = validateTemplateVariables('admin.bonus_credits_granted', {
      body: '{{credits}} credits added!',
    })
    expect(result.valid).toBe(false)
  })
})
