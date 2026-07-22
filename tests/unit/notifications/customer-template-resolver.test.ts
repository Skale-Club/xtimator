import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCustomerCopy, type CustomerCopyContext } from '@/lib/notifications/customer-copy'

/**
 * Phase 177 plan 05 (CUST-02) — RED/GREEN tests for the customer-scoped
 * DB-first template resolver, the parallel sibling of Phase 172's
 * `resolveNotificationCopy` (lib/notifications/template-resolver.ts) kept
 * deliberately SEPARATE because `buildNotificationCopy`/`EventType` are
 * switch-exhaustive against a different, unrelated (tenant) union.
 *
 * `makeTemplateClient()` below is COPIED (not imported) from
 * tests/unit/notifications/template-resolver.test.ts's helper of the same
 * name/shape — same `.from().select().eq()...eq().maybeSingle()` chain —
 * per plan instruction to avoid any shared-file coupling with the sibling
 * 174-04 executor currently editing template-resolver.ts.
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

describe('lib/notifications/customer-template-resolver — resolveCustomerCopy() (CUST-02)', () => {
  it('an ACTIVE scope=customer row with {{var}} tokens renders and WINS over buildCustomerCopy', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: {
          subject: '{{businessName}} sent you an estimate',
          body: 'Hello {{clientName}}, view it here: {{shareUrl}}',
        },
        error: null,
      }),
    )

    const ctx: CustomerCopyContext = {
      businessName: 'Joe Plumbing',
      clientName: 'Alice',
      shareUrl: 'https://x.io/e/1',
    }
    const copy = await resolveCustomerCopy('estimate.sent', 'email', ctx)

    expect(copy.body).toBe('Hello Alice, view it here: https://x.io/e/1')
    expect(copy.subject).toBe('Joe Plumbing sent you an estimate')
    // Sanity: DB copy differs from the built-in fallback for the same ctx.
    expect(copy.body).not.toBe(buildCustomerCopy('estimate.sent', 'email', ctx).body)
  })

  it('no matching row (data: null) falls back to buildCustomerCopy exactly', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: null, error: null }),
    )

    const ctx: CustomerCopyContext = { businessName: 'Joe Plumbing', shareUrl: 'https://x.io/e/1' }
    const copy = await resolveCustomerCopy('estimate.sent', 'sms', ctx)

    expect(copy).toEqual(buildCustomerCopy('estimate.sent', 'sms', ctx))
  })

  it('row exists but body is null/empty falls back', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: { subject: 'Hi', body: null }, error: null }),
    )

    const ctx: CustomerCopyContext = { businessName: 'Joe Plumbing', shareUrl: 'https://x.io/e/1' }
    const copy = await resolveCustomerCopy('estimate.sent', 'email', ctx)

    expect(copy).toEqual(buildCustomerCopy('estimate.sent', 'email', ctx))
  })

  it('row renders to an EMPTY string after substitution falls back (never send blank content)', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({ data: { subject: null, body: '{{unknownVar}}' }, error: null }),
    )

    const ctx: CustomerCopyContext = { businessName: 'Joe Plumbing', shareUrl: 'https://x.io/e/1' }
    const copy = await resolveCustomerCopy('estimate.sent', 'sms', ctx)

    expect(copy).toEqual(buildCustomerCopy('estimate.sent', 'sms', ctx))
  })

  it('createServiceClient() throws: caught, falls back, console.warn called', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('connection refused')
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx: CustomerCopyContext = { businessName: 'Joe Plumbing', shareUrl: 'https://x.io/e/1' }

    await expect(resolveCustomerCopy('estimate.sent', 'email', ctx)).resolves.toEqual(
      buildCustomerCopy('estimate.sent', 'email', ctx),
    )
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('channel: sms renders with text escaping (no HTML entities even with & or <)', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { subject: null, body: '{{businessName}} sent an estimate' },
        error: null,
      }),
    )

    const ctx: CustomerCopyContext = { businessName: 'Joe & Sons <Plumbing>' }
    const copy = await resolveCustomerCopy('estimate.sent', 'sms', ctx)

    expect(copy.body).toBe('Joe & Sons <Plumbing> sent an estimate')
    expect(copy.body).not.toContain('&amp;')
    expect(copy.body).not.toContain('&lt;')
  })

  it('channel: email renders with html escaping', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplateClient({
        data: { subject: null, body: '{{businessName}} sent an estimate' },
        error: null,
      }),
    )

    const ctx: CustomerCopyContext = { businessName: 'Joe & Sons <Plumbing>' }
    const copy = await resolveCustomerCopy('estimate.sent', 'email', ctx)

    expect(copy.body).toContain('&amp;')
    expect(copy.body).toContain('&lt;')
    expect(copy.body).not.toContain('<Plumbing>')
  })

  it('createServiceClient() returns null falls back without ever calling .from()', async () => {
    const { resolveCustomerCopy } = await import('@/lib/notifications/customer-template-resolver')
    const { createServiceClient } = await import('@/lib/supabase/service')
    ;(createServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(null)

    const ctx: CustomerCopyContext = { businessName: 'Joe Plumbing', shareUrl: 'https://x.io/e/1' }
    const copy = await resolveCustomerCopy('estimate.sent', 'sms', ctx)

    expect(copy).toEqual(buildCustomerCopy('estimate.sent', 'sms', ctx))
  })
})
