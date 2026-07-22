import { describe, it, expect, vi, afterEach } from 'vitest'
import type { EventType } from '@/lib/notifications/event-types'
import { EVENT_TEMPLATE_SEED } from '@/lib/notifications/template-seed'
import { buildNotificationCopy, type CopyContext } from '@/lib/notifications/copy'
import { renderTemplate, type TemplateVars } from '@/lib/notifications/template-engine'

/**
 * Phase 172 plan 03 (TMPL-06 / TMPL-07) — RED tests for the DB-first,
 * copy.ts-fallback template resolver.
 *
 * Mirrors tests/unit/notifications/whatsapp-registry.test.ts's
 * `makeTemplateClient()` chainable-mock pattern, adapted to
 * `notification_templates`'s 4-`.eq()` chain (scope, event_type, channel,
 * is_active) + `.select('title, subject, body')` + `.maybeSingle()`.
 *
 * `lib/notifications/template-resolver.ts` does NOT exist yet — this file is
 * RED on "Cannot find module" until Task 2 creates it.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

/** Chainable stub matching .from().select().eq().eq().eq().eq().maybeSingle(). */
function makeTemplateClient(maybeSingle: SimpleResp<unknown> | (() => Promise<never>)) {
  const chain: Record<string, unknown> = {
    maybeSingle:
      typeof maybeSingle === 'function'
        ? vi.fn().mockImplementation(maybeSingle)
        : vi.fn().mockResolvedValue(maybeSingle),
  }
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('lib/notifications/template-resolver — resolveNotificationCopy() (TMPL-06)', () => {
  it('an ACTIVE matching row renders {{var}} tokens and WINS over copy.ts', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: {
          title: 'Estimate viewed by {{clientName}}',
          subject: null,
          body: 'Heads up: {{clientName}} just opened estimate {{estimateNumber}}.',
        },
        error: null,
      }),
    )

    const ctx: CopyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx)

    expect(copy.body).toBe('Heads up: Acme Co just opened estimate EST-1.')
    expect(copy.title).toBe('Estimate viewed by Acme Co')
    // Sanity: this is NOT copy.ts's output for the same ctx (DB wins).
    expect(copy.body).not.toBe(buildNotificationCopy('estimate.viewed', ctx).body)
  })

  it('no matching row (data: null) falls back to buildNotificationCopy exactly', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const ctx: CopyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx)

    expect(copy).toEqual(buildNotificationCopy('estimate.viewed', ctx))
  })

  it('a row excluded by the server-side is_active filter (data: null) falls back the same way', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const ctx: CopyContext = { clientName: 'Acme Co' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.accepted', 'in_app', ctx)

    expect(copy).toEqual(buildNotificationCopy('estimate.accepted', ctx))
  })

  it('a body that renders to an EMPTY string after substitution falls back (Pitfall 2 — corrupt template)', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { title: 'Estimate viewed', subject: null, body: '{{missingVar}}' },
        error: null,
      }),
    )

    const ctx: CopyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx)

    // The corrupt DB row must NEVER reach delivery — fallback to copy.ts.
    expect(copy).toEqual(buildNotificationCopy('estimate.viewed', ctx))
  })

  it('a rejecting DB query is caught, warns, and falls back — never throws (assert with .resolves)', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient(() => Promise.reject(new Error('connection refused'))),
    )

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx: CopyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }

    await expect(
      resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx),
    ).resolves.toEqual(buildNotificationCopy('estimate.viewed', ctx))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('createServiceClient() returning null falls back immediately, no throw', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const ctx: CopyContext = { clientName: 'Acme Co', estimateNumber: 'EST-1' }
    await expect(
      resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx),
    ).resolves.toEqual(buildNotificationCopy('estimate.viewed', ctx))
  })

  it('HTML injection (TMPL-07 / Pitfall 4): email channel HTML-escapes an injected value', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { title: null, subject: 'Estimate viewed', body: '{{clientName}} viewed it' },
        error: null,
      }),
    )

    const ctx: CopyContext = { clientName: '<script>alert(1)</script>' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.viewed', 'email', ctx)

    expect(copy.body).toContain('&lt;script&gt;')
    expect(copy.body).not.toContain('<script>')
  })

  it('channel divergence: the same row/ctx resolved for sms/in_app does NOT HTML-escape', async () => {
    const { resolveNotificationCopy } = await import('@/lib/notifications/template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { title: 'Estimate viewed', subject: null, body: '{{clientName}} viewed it' },
        error: null,
      }),
    )

    const ctx: CopyContext = { clientName: 'Acme & Co' }
    const copy = await resolveNotificationCopy('tenant', 'estimate.viewed', 'in_app', ctx)

    expect(copy.body).toBe('Acme & Co viewed it')
    expect(copy.body).not.toContain('&amp;')
  })

  it('seed byte-equivalence (TMPL-01): renderTemplate(seed.body) matches buildNotificationCopy(...).body for every EventType', () => {
    const fixtures: Record<EventType, CopyContext> = {
      'estimate.viewed': { clientName: 'Acme Co', estimateNumber: 'EST-001' },
      'estimate.accepted': { clientName: 'Acme Co', estimateNumber: 'EST-001' },
      'estimate.declined': { clientName: 'Acme Co', estimateNumber: 'EST-001' },
      'estimate.expired': { estimateNumber: 'EST-001' },
      'payment.received': { amountUSD: '$500.00', projectName: 'Kitchen remodel' },
      'payment.refunded': { amountUSD: '$500.00', projectName: 'Kitchen remodel' },
      'trial.expiring_3d': { daysRemaining: 5 },
      'trial.expired': {},
      'trial.converted': {},
      'quota.80pct': { quotaPercent: 85 },
      'quota.exhausted': {},
      'whatsapp.inbound': { whatsappFrom: '+15551234567' },
      'ai_job.failed': { jobType: 'Estimate generation', errorMessage: 'Timeout contacting AI provider' },
      'ai_job.completed': { jobType: 'Estimate generation' },
      'admin.tier_changed': { tierFrom: 'Starter', tierTo: 'Pro' },
      'admin.bonus_credits_granted': {},
      'system.maintenance': {
        maintenanceTitle: 'Scheduled maintenance',
        maintenanceBody: 'Brief downtime expected.',
      },
    }

    for (const eventType of Object.keys(EVENT_TEMPLATE_SEED) as EventType[]) {
      const ctx = fixtures[eventType]
      const seedRendered = renderTemplate(
        EVENT_TEMPLATE_SEED[eventType].body,
        ctx as unknown as TemplateVars,
        'text',
      )
      const copyRendered = buildNotificationCopy(eventType, ctx).body
      expect(seedRendered, `mismatch for event "${eventType}"`).toBe(copyRendered)
    }
  })
})
