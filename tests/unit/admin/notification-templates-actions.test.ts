import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 173 plan 01 (TMPL-02 / TMPL-04 / TMPL-05) — super-admin
 * notification-template server actions.
 *
 * `@/lib/actions/admin-notification-templates` does NOT exist yet — RED on
 * "Cannot find module" until Task 2. Mirrors the chainable-mock pattern from
 * `tests/unit/admin/whatsapp-templates.test.ts` and the mock-shape from
 * `tests/unit/admin/telegram-chat-id-save.test.ts`.
 *
 * Covers:
 *  1. listNotificationTemplates — admin-gated, scope-filtered select.
 *  2. saveNotificationTemplate — validateTemplateVariables gates the upsert
 *     (never called on an unknown variable); on success, upserts on
 *     (scope,event_type,channel) with per-channel subject/title nulling.
 *  3. sendTestNotification — renders against SAMPLE_COPY_CONTEXT, dispatches
 *     to exactly one of Resend/sendSms/sendTelegramMessage per `target`,
 *     never throws, and (plan-checker WARNING-1) rejects a non-E.164 admin-
 *     typed phone before ever calling sendSms.
 *  4. requireAdmin() is called by every exported action.
 */

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

const requireAdminMock = vi.fn(async () => ({ userId: 'admin_1', email: 'admin@xtimator.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/platform-config', () => ({
  getIntegrationKey: vi.fn(),
}))

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn().mockResolvedValue({ id: 'em_test_1' }),
}))
vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

vi.mock('@/lib/sms/client', () => ({
  sendSms: vi.fn(),
}))

vi.mock('@/lib/telegram/client', () => ({
  sendTelegramMessage: vi.fn(),
}))

import {
  listNotificationTemplates,
  saveNotificationTemplate,
  sendTestNotification,
  type SaveTemplateInput,
} from '@/lib/actions/admin-notification-templates'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { sendSms } from '@/lib/sms/client'
import { sendTelegramMessage } from '@/lib/telegram/client'

type SimpleResp<T = unknown> = { data: T; error: { message: string } | null }

/** Chainable stub for `svc.from('notification_templates')`:
 *  - `.select('*').eq('scope', scope).order(...)` (listNotificationTemplates)
 *  - `.upsert(payload, opts).select().single()` (saveNotificationTemplate)
 */
function makeNotificationTemplatesClient(opts: {
  upsertSingle?: SimpleResp<unknown>
  listData?: SimpleResp<unknown[]>
}) {
  const upsertChain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue(opts.upsertSingle ?? { data: { id: 'row_1' }, error: null }),
  }
  upsertChain.select = vi.fn().mockReturnValue(upsertChain)

  const selectChain: Record<string, unknown> = {
    order: vi.fn().mockResolvedValue(opts.listData ?? { data: [], error: null }),
  }
  selectChain.eq = vi.fn().mockReturnValue(selectChain)

  const fromTable = {
    upsert: vi.fn().mockReturnValue(upsertChain),
    select: vi.fn().mockReturnValue(selectChain),
  }
  return {
    from: vi.fn().mockReturnValue(fromTable),
    __from: fromTable,
    __upsertChain: upsertChain,
    __selectChain: selectChain,
  }
}

let svc: ReturnType<typeof makeNotificationTemplatesClient>

const VALID_INPUT: SaveTemplateInput = {
  scope: 'tenant',
  eventType: 'estimate.viewed',
  channel: 'email',
  subject: '{{clientName}} update',
  title: null,
  body: '{{clientName}} opened {{estimateNumber}}.',
  isActive: true,
}

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin_1', email: 'admin@xtimator.com' })

  svc = makeNotificationTemplatesClient({})
  vi.mocked(requireServiceClient).mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

  vi.mocked(getIntegrationKey).mockReset()
  sendMock.mockClear()
  sendMock.mockResolvedValue({ id: 'em_test_1' })
  vi.mocked(sendSms).mockReset()
  vi.mocked(sendTelegramMessage).mockReset()
})

describe('listNotificationTemplates', () => {
  it('requires admin, selects scope-filtered rows, and returns them', async () => {
    const rows = [{ id: 'row_1', event_type: 'estimate.viewed', channel: 'email' }]
    svc = makeNotificationTemplatesClient({ listData: { data: rows, error: null } })
    vi.mocked(requireServiceClient).mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const result = await listNotificationTemplates('tenant')

    expect(requireAdminMock).toHaveBeenCalled()
    expect(svc.from).toHaveBeenCalledWith('notification_templates')
    expect(svc.__from.select).toHaveBeenCalledWith('*')
    expect(svc.__selectChain.eq).toHaveBeenCalledWith('scope', 'tenant')
    expect(svc.__selectChain.order).toHaveBeenCalled()
    expect(result).toEqual(rows)
  })
})

describe('saveNotificationTemplate', () => {
  it('rejects an unknown variable and NEVER calls upsert (validation gate runs before any DB write)', async () => {
    const result = await saveNotificationTemplate({
      ...VALID_INPUT,
      body: '{{clientName}} opened {{clientEmail}}.',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('clientEmail')
    expect(svc.__from.upsert).not.toHaveBeenCalled()
  })

  it('upserts on (scope,event_type,channel) with the payload shape from <interfaces>', async () => {
    const savedRow = { id: 'row_1', event_type: 'estimate.viewed', channel: 'email' }
    svc = makeNotificationTemplatesClient({ upsertSingle: { data: savedRow, error: null } })
    vi.mocked(requireServiceClient).mockReturnValue(svc as unknown as ReturnType<typeof requireServiceClient>)

    const result = await saveNotificationTemplate(VALID_INPUT)

    expect(result.ok).toBe(true)
    expect(result.row).toEqual(savedRow)
    expect(svc.__from.upsert).toHaveBeenCalledTimes(1)
    const [payload, upsertOpts] = (svc.__from.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]
    expect(upsertOpts).toEqual({ onConflict: 'scope,event_type,channel' })
    expect(payload).toMatchObject({
      scope: 'tenant',
      event_type: 'estimate.viewed',
      channel: 'email',
      body: '{{clientName}} opened {{estimateNumber}}.',
      is_active: true,
      updated_by: 'admin_1',
      subject: '{{clientName}} update',
      title: null,
    })
    expect(payload.variables).toEqual(['clientName', 'estimateNumber'])
  })

  it('nulls subject for a non-email channel and title for a non-in_app channel, even if both are passed', async () => {
    await saveNotificationTemplate({
      ...VALID_INPUT,
      channel: 'sms',
      subject: 'should be nulled',
      title: 'should be nulled',
      body: '{{clientName}} opened {{estimateNumber}}.',
    })

    const [payload] = (svc.__from.upsert as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
    ]
    expect(payload.subject).toBeNull()
    expect(payload.title).toBeNull()
  })
})

describe('sendTestNotification', () => {
  it('target=email renders with SAMPLE_COPY_CONTEXT and sends via Resend to the admin email with a [TEST]-prefixed subject', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue('re_test_key')

    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      subject: 'Update on {{estimateNumber}}',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'email',
    })

    expect(result.ok).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0]![0] as { to: string; subject: string; html: string }
    expect(arg.to).toBe('admin@xtimator.com')
    expect(arg.subject).toMatch(/^\[TEST\]/)
    // Sanity check from <interfaces>: this exact literal string proves
    // SAMPLE_COPY_CONTEXT['estimate.viewed'] renders correctly end to end.
    expect(arg.html).toBe('Jane Doe opened estimate EST-1042.')
  })

  it('target=email with Resend unconfigured returns ok:false without throwing', async () => {
    vi.mocked(getIntegrationKey).mockResolvedValue(null)

    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'email',
    })

    expect(result.ok).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('target=sms sends the rendered TEXT-mode (not HTML-escaped) body via sendSms', async () => {
    vi.mocked(sendSms).mockResolvedValue({ ok: true, sid: 'SM123' })

    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: "{{clientName}} opened estimate {{estimateNumber}} & co.",
      target: 'sms',
      toPhone: '+15551234567',
    })

    expect(result.ok).toBe(true)
    expect(sendSms).toHaveBeenCalledWith('+15551234567', 'Jane Doe opened estimate EST-1042 & co.')
  })

  it('target=sms propagates a provider failure as {ok:false, message} without throwing', async () => {
    vi.mocked(sendSms).mockResolvedValue({ ok: false, error: 'twilio_unconfigured' })

    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'sms',
      toPhone: '+15551234567',
    })

    expect(result).toEqual({ ok: false, message: 'twilio_unconfigured' })
  })

  it('target=sms without toPhone returns an error mentioning phone and never calls sendSms', async () => {
    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'sms',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/phone/i)
    expect(sendSms).not.toHaveBeenCalled()
  })

  // Plan-checker WARNING-1 hardening: the admin-typed phone must be E.164 —
  // the recipient is admin-supplied by design (platform-admin trust tier),
  // but a malformed number must still never reach the Twilio call.
  it('target=sms rejects a non-E.164 phone and never calls sendSms', async () => {
    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'sms',
      toPhone: 'not-a-phone',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/e\.164/i)
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('target=telegram calls sendTelegramMessage with the rendered body', async () => {
    vi.mocked(sendTelegramMessage).mockResolvedValue(undefined)

    const result = await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'telegram',
    })

    expect(result.ok).toBe(true)
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining('Jane Doe opened estimate EST-1042.'),
    )
  })

  it('target=telegram catches a rejected sendTelegramMessage and resolves {ok:false, message} — never throws', async () => {
    vi.mocked(sendTelegramMessage).mockRejectedValue(new Error('[Telegram] not configured'))

    await expect(
      sendTestNotification({
        eventType: 'estimate.viewed',
        body: '{{clientName}} opened estimate {{estimateNumber}}.',
        target: 'telegram',
      }),
    ).resolves.toEqual({ ok: false, message: '[Telegram] not configured' })
  })

  it('returns ok:false without calling any transport when the rendered body is empty against sample data', async () => {
    const result = await sendTestNotification({
      eventType: 'trial.expired',
      body: '   ',
      target: 'sms',
      toPhone: '+15551234567',
    })

    expect(result.ok).toBe(false)
    expect(sendSms).not.toHaveBeenCalled()
  })
})

describe('admin-gate posture', () => {
  it('every exported action calls requireAdmin()', async () => {
    await listNotificationTemplates('tenant')
    await saveNotificationTemplate(VALID_INPUT)
    vi.mocked(sendSms).mockResolvedValue({ ok: true, sid: 'SM1' })
    await sendTestNotification({
      eventType: 'estimate.viewed',
      body: '{{clientName}} opened estimate {{estimateNumber}}.',
      target: 'sms',
      toPhone: '+15551234567',
    })

    expect(requireAdminMock).toHaveBeenCalledTimes(3)
  })
})
