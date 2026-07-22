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
 *
 * Phase 179 Plan 03 (TMPLCOMP-02/03/04/05) additively extends this file: the
 * research found the pre-existing `submitTemplateToMeta` coverage only ever
 * exercised a stub ("does NOT throw"), never a real success path. This plan
 * makes `submitTemplateToMeta` send Meta a real, validated `components`
 * payload and adds `checkTemplateStatus` / `updateTemplateAndResubmit` — the
 * new describe blocks below close that gap with their OWN richer mocks
 * (`makeTemplatesClientWithRow` + a partial `meta-templates-client` mock).
 * The 5 pre-existing tests above are untouched.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin_1' }),
}))

// Phase 179-03: every new action in this file (submitTemplateToMeta,
// checkTemplateStatus, updateTemplateAndResubmit) reads the Meta token/WABA
// id via getWhatsAppPlatformConfig() before doing anything network-shaped.
// Without this mock the scope guard short-circuits before createMetaTemplate
// is ever reached, making the success-path assertions below unreachable.
vi.mock('@/lib/platform-config', () => ({
  getWhatsAppPlatformConfig: vi.fn().mockResolvedValue({
    accessToken: 'tok',
    wabaId: 'waba',
    phoneNumberId: null,
  }),
}))

// Partial mock: keeps mapMetaEventToStatus / buildCreatePayload /
// extractRejectionReason REAL (already exhaustively tested in Plan 179-02)
// while stubbing only the 3 fetch-touching calls — so the existing
// applyTemplateStatusUpdate tests (which depend on real mapMetaEventToStatus
// behavior) keep passing UNMODIFIED.
vi.mock('@/lib/whatsapp/meta-templates-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/whatsapp/meta-templates-client')>()
  return {
    ...actual,
    createMetaTemplate: vi.fn(),
    getMetaTemplateStatus: vi.fn(),
    updateMetaTemplate: vi.fn(),
  }
})

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

/**
 * Phase 179-03: a richer mock-client factory for the 3 new/rewritten actions
 * (submitTemplateToMeta, checkTemplateStatus, updateTemplateAndResubmit),
 * all of which read ONE row by id (`.select('*').eq('id', id).single()`) —
 * a chain the legacy `makeTemplatesClient` above never needed to support.
 *
 * `.update(patch).eq('id', id)` resolves directly (none of the 3 actions
 * chain `.select().single()` after their update call) and records the patch
 * payload on `__from.update` for assertion.
 */
function makeTemplatesClientWithRow(
  row: Record<string, unknown> | null,
  opts?: {
    readError?: { message: string } | null
    readThrows?: boolean
    updateError?: { message: string } | null
  }
) {
  const singleMock = opts?.readThrows
    ? vi.fn().mockRejectedValue(new Error('read failed'))
    : vi.fn().mockResolvedValue(
        opts?.readError ? { data: null, error: opts.readError } : { data: row, error: null }
      )
  const selectEqChain = { single: singleMock }

  const updateChain: Record<string, unknown> = {}
  updateChain.eq = vi.fn().mockResolvedValue(
    opts?.updateError ? { data: null, error: opts.updateError } : { data: row, error: null }
  )

  const fromTable = {
    select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(selectEqChain) }),
    update: vi.fn().mockReturnValue(updateChain),
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

describe('submitTemplateToMeta — real Meta payload + variables_schema write-through (179-03)', () => {
  it('refuses an incomplete draft (body_text: null) BEFORE any Meta call', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createMetaTemplate } = await import('@/lib/whatsapp/meta-templates-client')
    const row = {
      id: 'tpl_1',
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: null,
      variables_schema: [],
    }
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplatesClientWithRow(row)
    )

    const result = await submitTemplateToMeta('tpl_1')

    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('refuses a body that fails validateComposerTemplate (ends with a variable) BEFORE any Meta call', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createMetaTemplate } = await import('@/lib/whatsapp/meta-templates-client')
    const row = {
      id: 'tpl_1',
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: 'Hello {{1}}',
      variables_schema: [{ label: 'Name', example: 'John' }],
    }
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplatesClientWithRow(row)
    )

    const result = await submitTemplateToMeta('tpl_1')

    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('sends a REAL non-empty components payload and writes meta_template_id + status + variables_schema in one update', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createMetaTemplate } = await import('@/lib/whatsapp/meta-templates-client')
    const params = [
      { label: 'Name', example: 'John' },
      { label: 'Total', example: '$100' },
    ]
    const row = {
      id: 'tpl_1',
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: 'Hi {{1}}, your total is {{2}}.',
      variables_schema: params,
    }
    const svc = makeTemplatesClientWithRow(row)
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    ;(createMetaTemplate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      id: 'meta_999',
    })

    const result = await submitTemplateToMeta('tpl_1')

    expect(result).toEqual({ ok: true, metaTemplateId: 'meta_999' })
    expect(createMetaTemplate).toHaveBeenCalledTimes(1)
    const [wabaIdArg, accessTokenArg, payload] = (createMetaTemplate as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [string, string, Record<string, unknown>]
    expect(wabaIdArg).toBe('waba')
    expect(accessTokenArg).toBe('tok')
    expect(payload.name).toBe('owner_billing_alert')
    expect(payload.language).toBe('en_US')
    expect(Array.isArray(payload.components)).toBe(true)
    expect((payload.components as unknown[]).length).toBeGreaterThan(0)

    const updateArg = (svc.__from.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(updateArg).toMatchObject({
      meta_template_id: 'meta_999',
      status: 'pending',
      variables_schema: params,
    })
  })

  it('maps a 403 createMetaTemplate response to reason: scope', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createMetaTemplate } = await import('@/lib/whatsapp/meta-templates-client')
    const row = {
      id: 'tpl_1',
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: 'Hi {{1}}.',
      variables_schema: [{ label: 'Name', example: 'John' }],
    }
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplatesClientWithRow(row)
    )
    ;(createMetaTemplate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: 'missing scope',
    })

    const result = await submitTemplateToMeta('tpl_1')

    expect(result).toMatchObject({ ok: false, reason: 'scope' })
  })

  it('surfaces a 400 createMetaTemplate response as a generic error containing the status', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const { createMetaTemplate } = await import('@/lib/whatsapp/meta-templates-client')
    const row = {
      id: 'tpl_1',
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: 'Hi {{1}}.',
      variables_schema: [{ label: 'Name', example: 'John' }],
    }
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplatesClientWithRow(row)
    )
    ;(createMetaTemplate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'bad request',
    })

    const result = await submitTemplateToMeta('tpl_1')

    expect(result.ok).toBe(false)
    expect((result as { error?: string }).error).toEqual(expect.stringContaining('400'))
  })

  it('never throws even when the read chain errors (regression)', async () => {
    const { submitTemplateToMeta } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(
      makeTemplatesClientWithRow(null, { readError: { message: 'boom' } })
    )

    const result = await submitTemplateToMeta('tpl_1')

    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
    expect(result.ok).toBe(false)
  })
})

describe('createTemplate — body_text/variables_schema passthrough (179-03)', () => {
  it('includes body_text + variables_schema verbatim in the insert payload when provided', async () => {
    const { createTemplate } = await import('@/lib/actions/admin-whatsapp-templates')
    const { requireServiceClient } = await import('@/lib/supabase/service')
    const svc = makeTemplatesClient({ insertSingle: { data: { id: 'tpl_new' }, error: null } })
    ;(requireServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(svc)
    const params = [{ label: 'Name', example: 'John' }]

    await createTemplate({
      template_name: 'owner_billing_alert',
      language_code: 'en_US',
      body_text: 'Hi {{1}}.',
      variables_schema: params,
    })

    const insertArg = (svc.__from.insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(insertArg).toMatchObject({
      body_text: 'Hi {{1}}.',
      variables_schema: params,
    })
  })
})
