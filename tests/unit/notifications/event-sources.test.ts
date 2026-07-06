/**
 * Phase 77 plan 03 — Event source instrumentation tests.
 *
 * Each describe block proves a single call site invokes `notify()` with the
 * expected `eventType` (and, where relevant, dedupe metadata + force-channels).
 *
 * Tests mock `@/lib/notifications/dispatch` so we don't hit the DB; we only
 * assert the wiring contract — what gets called where.
 *
 * Also smoke-tests `buildNotificationCopy` returns non-empty title + body for
 * every one of the 17 EventTypes (NOTIF-04 catalog completeness).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import type { EventType } from '@/lib/notifications/event-types'

vi.mock('@/lib/notifications/dispatch', () => ({
  notify: vi.fn().mockResolvedValue({ ok: true, notificationId: 'notif_test' }),
}))

// ----------------------------------------------------------------------
// Block A — copy module catalog completeness (NOTIF-04)
// ----------------------------------------------------------------------
describe('lib/notifications/copy — buildNotificationCopy', () => {
  it('returns non-empty title + body for every EventType', async () => {
    const { buildNotificationCopy } = await import('@/lib/notifications/copy')
    const events: EventType[] = [
      'estimate.viewed',
      'estimate.accepted',
      'estimate.declined',
      'estimate.expired',
      'payment.received',
      'payment.refunded',
      'trial.expiring_3d',
      'trial.expired',
      'trial.converted',
      'quota.80pct',
      'quota.exhausted',
      'whatsapp.inbound',
      'ai_job.failed',
      'ai_job.completed',
      'admin.tier_changed',
      'admin.bonus_credits_granted',
      'system.maintenance',
    ]
    for (const eventType of events) {
      const copy = buildNotificationCopy(eventType, {})
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.body.length).toBeGreaterThan(0)
    }
  })

  it('surfaces estimateNumber + clientName when given', async () => {
    const { buildNotificationCopy } = await import('@/lib/notifications/copy')
    const copy = buildNotificationCopy('estimate.viewed', {
      estimateNumber: 'EST-001',
      clientName: 'Acme Co',
    })
    expect(copy.body).toContain('Acme Co')
    expect(copy.body).toContain('EST-001')
  })
})

// ----------------------------------------------------------------------
// Block B — estimate viewed (logEstimateView server action)
// ----------------------------------------------------------------------
describe('estimate.viewed instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logEstimateView fires notify({eventType:"estimate.viewed"}) with dedupe key', async () => {
    const responses: Array<{ data: unknown; error: unknown }> = [
      {
        data: {
          id: 'est_1',
          project_id: 'proj_1',
          company_id: 'co_1',
          viewed_at: null,
          estimate_number: 'EST-001',
          client_name: 'Acme',
        },
        error: null,
      },
      { data: { notify_on_view: false, email: null, name: 'BizName' }, error: null },
      { data: { name: 'Roof Job' }, error: null },
    ]
    let i = 0
    const makeChain = () => {
      const chain: Record<string, unknown> = {
        single: vi.fn().mockImplementation(() => Promise.resolve(responses[i++] ?? { data: null, error: null })),
      }
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockResolvedValue({ error: null })
      return chain
    }
    const from = vi.fn().mockImplementation(() => makeChain())

    vi.doMock('@/lib/supabase/service', () => ({
      requireServiceClient: () => ({ from }),
    }))
    vi.doMock('@/lib/platform-config', () => ({
      getIntegrationKey: vi.fn().mockResolvedValue(null),
      getBranding: vi.fn().mockResolvedValue({ appName: 'Xtimator' }),
    }))

    const { logEstimateView } = await import('@/app/estimate/[token]/actions')
    await logEstimateView('share_token_abc')

    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const viewedCall = calls.find((c) => (c[0] as { eventType: string }).eventType === 'estimate.viewed')
    expect(viewedCall).toBeDefined()
    const params = viewedCall![0] as Record<string, unknown>
    expect((params.metadata as { dedupe_key?: string } | undefined)?.dedupe_key).toMatch(/estimate-viewed-est_1/)
    vi.doUnmock('@/lib/supabase/service')
    vi.doUnmock('@/lib/platform-config')
  })
})

// ----------------------------------------------------------------------
// Block C — estimate accepted / declined (respondToEstimate)
// ----------------------------------------------------------------------
describe('estimate.accepted / estimate.declined instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())

  function buildSupabaseMock(_response: 'accepted' | 'declined') {
    // Each from() call gets its own chain (estimates lookup, estimates update,
    // projects update, estimate_activity insert, companies lookup).
    const responses: Array<{ data: unknown; error: unknown }> = [
      {
        data: {
          id: 'est_2',
          project_id: 'proj_2',
          company_id: 'co_2',
          client_response: null,
          estimate_number: 'EST-002',
          client_name: 'Bob',
        },
        error: null,
      },
      {
        data: {
          notify_on_accept: false,
          notify_on_decline: false,
          email: null,
          name: 'Biz',
        },
        error: null,
      },
    ]
    let singleCallIndex = 0
    const makeChain = () => {
      const chain: Record<string, unknown> = {
        single: vi.fn().mockImplementation(() => {
          const r = responses[singleCallIndex++] ?? { data: null, error: null }
          return Promise.resolve(r)
        }),
      }
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockResolvedValue({ error: null })
      return chain
    }
    return {
      from: vi.fn().mockImplementation(() => makeChain()),
    }
  }

  for (const response of ['accepted', 'declined'] as const) {
    it(`respondToEstimate(${response}) fires notify({eventType:"estimate.${response}"})`, async () => {
      vi.resetModules()
      const svc = buildSupabaseMock(response)
      vi.doMock('@/lib/supabase/service', () => ({
        requireServiceClient: () => svc,
      }))
      vi.doMock('@/lib/platform-config', () => ({
        getIntegrationKey: vi.fn().mockResolvedValue(null),
        getBranding: vi.fn().mockResolvedValue({ appName: 'Xtimator' }),
      }))
      vi.doMock('@/lib/notifications/dispatch', () => ({
        notify: vi.fn().mockResolvedValue({ ok: true }),
      }))
      const { respondToEstimate } = await import('@/app/estimate/[token]/actions')
      await respondToEstimate('tok_x', response)
      const { notify } = await import('@/lib/notifications/dispatch')
      const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
      const match = calls.find(
        (c) => (c[0] as { eventType: string }).eventType === `estimate.${response}`
      )
      expect(match).toBeDefined()
      vi.doUnmock('@/lib/supabase/service')
      vi.doUnmock('@/lib/platform-config')
    })
  }
})

// ----------------------------------------------------------------------
// Block D — payment.received via Stripe Connect webhook handler
// ----------------------------------------------------------------------
describe('payment.received instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('handleConnectEvent(checkout.session.completed) fires notify({eventType:"payment.received"}) with dedupe key', async () => {
    const updated = {
      id: 'est_p1',
      company_id: 'co_p',
      project_id: 'proj_p',
      share_token: 'tok_p',
    }
    const single = vi.fn().mockResolvedValueOnce({ data: updated, error: null })
    const selectAfterUpdate = vi.fn().mockReturnValue({ single })
    const updateEq = vi.fn().mockReturnValue({ select: selectAfterUpdate })
    const update = vi.fn().mockReturnValue({ eq: updateEq })

    // companies + projects look-ups
    const companiesSingle = vi.fn().mockResolvedValue({
      data: {
        email: null,
        name: 'Acme',
        stripe_account_display_name: 'Acme Roofing',
        user_id: 'user_owner',
      },
      error: null,
    })
    const projectsSingle = vi.fn().mockResolvedValue({
      data: { name: 'Roof Job' },
      error: null,
    })
    const select = vi.fn().mockImplementation((cols: string) => {
      if (cols.includes('stripe_account')) {
        return { eq: vi.fn().mockReturnValue({ single: companiesSingle }) }
      }
      return { eq: vi.fn().mockReturnValue({ single: projectsSingle }) }
    })

    const svc = {
      from: vi.fn().mockImplementation(() => ({ update, select })),
    }

    vi.doMock('@/lib/email/payment-emails', () => ({
      sendPaymentReceivedEmail: vi.fn().mockResolvedValue(undefined),
      sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined),
    }))

    const { handleConnectEvent } = await import('@/lib/billing/connect-webhook')
    const fakeEvent = {
      id: 'evt_stripe_abc',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          metadata: { estimate_id: 'est_p1' },
          amount_total: 12345,
          payment_intent: 'pi_x',
          customer_details: { email: 'c@x.com', name: 'Cust' },
          customer_email: null,
        },
      },
    } as unknown as import('stripe').default.Event

    await handleConnectEvent(fakeEvent, {} as unknown as import('stripe').default, svc as unknown as ReturnType<typeof import('@/lib/supabase/service').requireServiceClient>)

    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const match = calls.find((c) => (c[0] as { eventType: string }).eventType === 'payment.received')
    expect(match).toBeDefined()
    const params = match![0] as Record<string, unknown>
    expect((params.metadata as { dedupe_key?: string } | undefined)?.dedupe_key).toBe('evt_stripe_abc')
    expect((params.channels as { email?: boolean } | undefined)?.email).toBe(true)

    vi.doUnmock('@/lib/email/payment-emails')
  })
})

// ----------------------------------------------------------------------
// Blocks E/F (trial.expired / trial.expiring_3d crons) were REMOVED in
// Billing v2: the 14-day trial is retired — the free tier IS the trial via the
// one-time signup credit grant, and the trial crons no longer exist.
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// Block G — quota crosses 80% (notifyQuotaThresholds helper)
// ----------------------------------------------------------------------
describe('quota.80pct + quota.exhausted instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('notifyQuotaThresholds fires quota.80pct when count crosses 80%', async () => {
    const { notifyQuotaThresholds } = await import('@/lib/quota')
    await notifyQuotaThresholds({
      companyId: 'co_q',
      userId: 'user_q',
      previousCount: 7,
      newCount: 8,
      limit: 10,
    })
    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const match = calls.find((c) => (c[0] as { eventType: string }).eventType === 'quota.80pct')
    expect(match).toBeDefined()
  })

  it('notifyQuotaThresholds fires quota.exhausted with force channels at 100%', async () => {
    const { notifyQuotaThresholds } = await import('@/lib/quota')
    await notifyQuotaThresholds({
      companyId: 'co_q',
      userId: 'user_q',
      previousCount: 9,
      newCount: 10,
      limit: 10,
    })
    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const exhausted = calls.find(
      (c) => (c[0] as { eventType: string }).eventType === 'quota.exhausted'
    )
    expect(exhausted).toBeDefined()
    const params = exhausted![0] as Record<string, unknown>
    expect((params.channels as { email?: boolean; inApp?: boolean } | undefined)?.email).toBe(true)
    expect((params.channels as { email?: boolean; inApp?: boolean } | undefined)?.inApp).toBe(true)
  })
})

// ----------------------------------------------------------------------
// Block H — admin actions (tier.force + grantBonusCredits)
// ----------------------------------------------------------------------
describe('admin.tier_changed + admin.bonus_credits_granted instrumentation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forceTier fires notify({eventType:"admin.tier_changed"}) with force channels', async () => {
    const makeChain = () => {
      const chain: Record<string, unknown> = {
        single: vi.fn().mockResolvedValue({
          data: { user_id: 'user_owner', tier: 'free' },
          error: null,
        }),
      }
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.select = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockResolvedValue({ error: null })
      return chain
    }
    const svc = { from: vi.fn().mockImplementation(() => makeChain()) }

    vi.doMock('@/lib/auth/admin-context', () => ({
      requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin_1', email: 'admin@x.com' }),
    }))
    vi.doMock('@/lib/admin/audit-log', () => ({
      logAdminAction: vi.fn(),
    }))
    vi.doMock('@/lib/supabase/service', () => ({
      requireServiceClient: () => svc,
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))

    const { forceTier } = await import('@/app/admin/billing/actions')
    await forceTier('co_admin', 'pro')

    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const match = calls.find((c) => (c[0] as { eventType: string }).eventType === 'admin.tier_changed')
    expect(match).toBeDefined()
    const params = match![0] as Record<string, unknown>
    expect((params.channels as { email?: boolean } | undefined)?.email).toBe(true)

    vi.doUnmock('@/lib/auth/admin-context')
    vi.doUnmock('@/lib/admin/audit-log')
    vi.doUnmock('@/lib/supabase/service')
    vi.doUnmock('next/cache')
  })

  it('grantBonusCredits fires notify({eventType:"admin.bonus_credits_granted"})', async () => {
    const makeChain = () => {
      const chain: Record<string, unknown> = {
        single: vi.fn().mockResolvedValue({ data: { user_id: 'user_owner' }, error: null }),
      }
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.select = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockResolvedValue({ error: null })
      return chain
    }
    const svc = { from: vi.fn().mockImplementation(() => makeChain()) }

    vi.doMock('@/lib/auth/admin-context', () => ({
      requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin_1', email: 'admin@x.com' }),
    }))
    vi.doMock('@/lib/admin/audit-log', () => ({
      logAdminAction: vi.fn(),
    }))
    vi.doMock('@/lib/supabase/service', () => ({
      requireServiceClient: () => svc,
    }))
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }))

    const { grantBonusCredits } = await import('@/app/admin/billing/actions')
    await grantBonusCredits('co_admin', 5)

    const { notify } = await import('@/lib/notifications/dispatch')
    const calls = (notify as ReturnType<typeof vi.fn>).mock.calls
    const match = calls.find(
      (c) => (c[0] as { eventType: string }).eventType === 'admin.bonus_credits_granted'
    )
    expect(match).toBeDefined()

    vi.doUnmock('@/lib/auth/admin-context')
    vi.doUnmock('@/lib/admin/audit-log')
    vi.doUnmock('@/lib/supabase/service')
    vi.doUnmock('next/cache')
  })
})
