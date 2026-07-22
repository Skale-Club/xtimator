import { describe, it, expect } from 'vitest'

/**
 * Phase 173 plan 01 (TMPL-04) — `validateTemplateVariables` is the ONE gate
 * both the live client preview (173-02) and `saveNotificationTemplate` /
 * `sendTestNotification` (this plan's server actions) call before a template
 * is ever persisted or dispatched. A `{{var}}` reference not present in that
 * event's `EVENT_TEMPLATE_SEED[eventType].variables` whitelist must always be
 * rejected, with every unknown variable named in the error.
 *
 * Also locks the CREDITUI-04 guard: `admin.bonus_credits_granted`'s catalog
 * is `[]` (Phase 172 seed), so ANY `{{var}}` reference for that event is
 * structurally unknown — no special-casing in the implementation, it falls
 * out of the set-difference against an empty catalog.
 *
 * Plan-checker INFO-1 hardening: a residual literal `{{` + `}}` sequence that
 * `extractVariables()` does NOT parse as a `\w+` token (e.g. `{{client.name}}`,
 * `{{client-name}}`) must also be rejected — it would otherwise render
 * literally to a tenant (the render engine's regex silently skips it, so the
 * validation gate must not).
 */

import { validateTemplateVariables } from '@/lib/notifications/template-validation'

describe('validateTemplateVariables (TMPL-04)', () => {
  it('accepts a body that only references catalog variables', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      body: '{{clientName}} opened {{estimateNumber}}.',
    })
    expect(result).toEqual({ valid: true, unknownVariables: [] })
  })

  it('rejects an unknown variable in body, naming it in the error', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      body: '{{clientName}} opened {{clientEmail}}.',
    })
    expect(result.valid).toBe(false)
    expect(result.unknownVariables).toEqual(['clientEmail'])
    expect(result.error).toContain('{{clientEmail}}')
  })

  it('rejects an unknown variable in subject alone, even with an otherwise-valid body', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      subject: 'Re: {{badVar}}',
      body: '{{clientName}} opened {{estimateNumber}}.',
    })
    expect(result.valid).toBe(false)
    expect(result.unknownVariables).toEqual(['badVar'])
  })

  it('rejects an unknown variable in title alone, even with an otherwise-valid body', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      title: '{{badVar}}',
      body: '{{clientName}} opened {{estimateNumber}}.',
    })
    expect(result.valid).toBe(false)
    expect(result.unknownVariables).toEqual(['badVar'])
  })

  it('lists every unknown variable across all three fields, not just the first', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      subject: '{{foo}}',
      title: '{{bar}}',
      body: '{{clientName}} and {{baz}}.',
    })
    expect(result.valid).toBe(false)
    expect(result.unknownVariables.slice().sort()).toEqual(['bar', 'baz', 'foo'])
  })

  it('admin.bonus_credits_granted (empty catalog) rejects any {{var}} reference at all', () => {
    const result = validateTemplateVariables('admin.bonus_credits_granted', {
      body: 'You got {{credits}} bonus credits!',
    })
    expect(result.valid).toBe(false)
    expect(result.unknownVariables).toEqual(['credits'])
  })

  it('admin.bonus_credits_granted accepts a variable-free body (CREDITUI-04 not special-cased to always-fail)', () => {
    const result = validateTemplateVariables('admin.bonus_credits_granted', {
      body: 'An admin added bonus credits to your account.',
    })
    expect(result).toEqual({ valid: true, unknownVariables: [] })
  })

  it('trial.expired (also an empty catalog) accepts a variable-free body', () => {
    const result = validateTemplateVariables('trial.expired', {
      body: 'Your trial has ended.',
    })
    expect(result.valid).toBe(true)
  })

  // --- Plan-checker INFO-1 hardening -----------------------------------
  it('rejects a malformed token like {{client.name}} that extractVariables cannot parse as a \\w+ token', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      body: 'Hello {{client.name}}, your estimate is ready.',
    })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects a malformed token like {{client-name}}', () => {
    const result = validateTemplateVariables('estimate.viewed', {
      body: 'Hello {{client-name}}.',
    })
    expect(result.valid).toBe(false)
  })
})
