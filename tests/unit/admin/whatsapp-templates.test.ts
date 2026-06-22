import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * Phase 104 plan 00 — Wave-0 RED test for the super-admin WhatsApp-template
 * panel server actions (104.3).
 *
 * `@/lib/actions/admin-whatsapp-templates` does NOT exist yet — Wave 3 creates
 * the CRUD + the `message_template_status_update` webhook handler logic. The
 * panel manages platform-level rows in `whatsapp_notification_templates`
 * (service-role-only RLS, like `notifications`).
 *
 * RED form: module-not-found until Wave 3. Lazy `await import` keeps the file
 * collectable now. Mocks are scoped + cleared in afterEach so cross-suite forks
 * runs don't leak. `requireAdmin` is mocked defensively (the actions are admin-
 * guarded + service-role).
 *
 * Owner: Wave 3 (104.3 — super-admin template panel).
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin_1' }),
}))

afterEach(() => {
  vi.clearAllMocks()
})

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

function makeTemplatesClient(opts: {
  insertSingle?: SimpleResp<unknown>
  listData?: SimpleResp<unknown[]>
  updateSingle?: SimpleResp<unknown>
}) {
  const insertChain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(opts.insertSingle ?? { data: { id: 'tpl_new' }, error: null }),
  }
  insertChain.select = vi.fn().mockReturnValue(insertChain)

  const updateChain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(opts.updateSingle ?? { data: { id: 'tpl_1' }, error: null }),
  }
  updateChain.select = vi.fn().mockReturnValue(updateChain)
  updateChain.eq = vi.fn().mockReturnValue(updateChain)

  const selectChain: Record<string, unknown> = {
    order: vi.fn().mockResolvedValue(opts.listData ?? { data: [], error: null }),
  }
  selectChain.eq = vi.fn().mockReturnValue(selectChain)

  const fromTable = {
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    select: vi.fn().mockReturnValue(selectChain),
  }
  return { from: vi.fn().mockReturnValue(fromTable), __from: fromTable }
}

describe('lib/actions/admin-whatsapp-templates — panel CRUD + webhook (104.3 RED)', () => {
  it('createTemplate inserts a whatsapp_notification_templates draft row', async () => {
    const { createTemplate } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeTemplatesClient({ insertSingle: { data: { id: 'tpl_new' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await createTemplate({
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      event_category: 'billing',
    })

    expect(svc.from).toHaveBeenCalledWith('whatsapp_notification_templates')
    const insertArg = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertArg).toMatchObject({
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      event_category: 'billing',
      status: 'draft',
    })
  })

  it('listTemplates selects from whatsapp_notification_templates and returns rows', async () => {
    const { listTemplates } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const rows = [{ id: 'tpl_1', template_name: 'owner_billing_alert', status: 'approved' }]
    const svc = makeTemplatesClient({ listData: { data: rows, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    const result = await listTemplates()
    expect(svc.from).toHaveBeenCalledWith('whatsapp_notification_templates')
    expect(result).toEqual(rows)
  })

  it('applyTemplateStatusUpdate flips status to approved on APPROVED event', async () => {
    const { applyTemplateStatusUpdate } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeTemplatesClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await applyTemplateStatusUpdate({ message_template_id: 'meta_123', event: 'APPROVED' })

    expect(svc.__from.update).toHaveBeenCalled()
    const updateArg = (svc.__from.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(updateArg).toMatchObject({ status: 'approved' })
  })

  it('applyTemplateStatusUpdate sets rejected + reason on REJECTED event', async () => {
    const { applyTemplateStatusUpdate } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeTemplatesClient({})
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)

    await applyTemplateStatusUpdate({
      message_template_id: 'meta_123',
      event: 'REJECTED',
      reason: 'INVALID_FORMAT',
    })

    const updateArg = (svc.__from.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(updateArg).toMatchObject({ status: 'rejected', rejection_reason: 'INVALID_FORMAT' })
  })

  it('submitTemplateToMeta does NOT throw and returns an object (de-risked MVP stub)', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(makeTemplatesClient({}))

    const result = await submitTemplateToMeta('tpl_1')
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })
})
