/**
 * Unit tests for admin WhatsApp account provisioning actions.
 *
 * Tests cover:
 * - Unauthenticated/non-admin denial (requireAdmin gate)
 * - E.164 normalization and validation
 * - Uniqueness rejection (active number on another company)
 * - Status transition guards
 * - Company/member scope verification
 * - Audit call on every successful mutation
 * - Metadata safety (no full phone in audit)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────
// NOTE: vi.mock factories are hoisted to the TOP of the file by vitest.
// They CANNOT reference variables defined below. All mock values must be
// inline or imported from a module that is itself mock-safe.

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ userId: 'admin-123', email: 'admin@test.com' }),
}))

function chainable() {
  const chain: Record<string, any> = {}
  chain.from = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.lt = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  return chain
}

let mockSvc: ReturnType<typeof chainable>

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => mockSvc),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/whatsapp/account-registry', () => ({
  isCurrentWhatsAppLinkedIdentity: vi.fn(),
  normalizeWhatsAppPhone: vi.fn((raw: string) => {
    if (!raw) return null
    const digits = raw.replace(/[^\d]/g, '')
    if (digits.length < 7 || digits.length > 15) return null
    return `+${digits}`
  }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import {
  resolveWhatsAppWelcomeTemplate,
  saveWhatsAppAccount,
  saveWhatsAppSender,
  setWhatsAppSenderStatus,
  removeWhatsAppSender,
} from '@/lib/actions/admin-whatsapp-accounts'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { isCurrentWhatsAppLinkedIdentity } from '@/lib/whatsapp/account-registry'

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockSvc = chainable()
  vi.mocked(isCurrentWhatsAppLinkedIdentity).mockResolvedValue(false)
})

describe('requireAdmin gate', () => {
  it('calls requireAdmin before any write', async () => {
    mockSvc.maybeSingle.mockResolvedValue({ data: { id: 'comp-1' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({ data: { id: 'cfg-1', company_id: 'comp-1', status: 'pending_review', delivery_format: 'interactive' }, error: null })

    await saveWhatsAppAccount('comp-1', {})

    expect(requireAdmin).toHaveBeenCalled()
  })
})

describe('resolveWhatsAppWelcomeTemplate', () => {
  const senderId = '10000000-0000-4000-8000-000000000009'
  const claimUntil = '2026-11-01T12:00:00.000+00:00'

  it('records an audited confirmation only for the exact expired sender attempt', async () => {
    mockSvc.select.mockResolvedValueOnce({ data: [{ id: senderId }], error: null })

    const result = await resolveWhatsAppWelcomeTemplate(senderId, claimUntil, 'sent')

    expect(result.ok).toBe(true)
    expect(mockSvc.eq).toHaveBeenCalledWith('welcome_template_claim_until', claimUntil)
    expect(mockSvc.lt).toHaveBeenCalledWith('welcome_template_claim_until', expect.any(String))
    expect(mockSvc.update).toHaveBeenCalledWith({
      welcome_template_claim_until: null,
      welcome_template_needs_review: false,
      welcome_template_sent_at: expect.any(String),
    })
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'whatsapp.welcome.reconcile', targetId: senderId,
      metadata: { kind: 'template', resolution: 'sent' },
    }))
  })

  it('rejects a stale or still active review attempt without recording an audit resolution', async () => {
    mockSvc.select.mockResolvedValueOnce({ data: [], error: null })
    expect((await resolveWhatsAppWelcomeTemplate(senderId, claimUntil, 'unsent')).ok).toBe(false)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})

describe('saveWhatsAppAccount', () => {
  it('returns error when companyId is empty', async () => {
    const result = await saveWhatsAppAccount('', {})
    expect(result.ok).toBe(false)
    expect(result.message).toContain('companyId is required')
  })

  it('returns error when company not found', async () => {
    mockSvc.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppAccount('comp-missing', {})
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Company not found')
  })

  it('creates new config when none exists', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null }) // company check
      .mockResolvedValueOnce({ data: null, error: null }) // existing config check
    mockSvc.select.mockReturnValue(mockSvc)

    const newRow = { id: 'cfg-1', company_id: 'comp-1', status: 'pending_review', delivery_format: 'share_link' }
    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({ data: newRow, error: null })

    const result = await saveWhatsAppAccount('comp-1', {})

    expect(result.ok).toBe(true)
    expect(mockSvc.insert).toHaveBeenCalledWith(expect.objectContaining({ delivery_format: 'share_link' }))
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.account.save',
        targetType: 'company',
        targetId: 'comp-1',
      }),
    )
  })

  it('rejects invalid status transitions', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'active', delivery_format: 'share_link' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    // active -> pending_review is NOT a valid transition
    const result = await saveWhatsAppAccount('comp-1', { status: 'pending_review' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Cannot transition')
  })

  it('allows valid status transitions', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'suspended', delivery_format: 'share_link' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    mockSvc.update.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: { id: 'cfg-1', company_id: 'comp-1', status: 'active', delivery_format: 'share_link' },
      error: null,
    })

    const result = await saveWhatsAppAccount('comp-1', { status: 'active' })
    expect(result.ok).toBe(true)
    expect(logAdminAction).toHaveBeenCalled()
  })

  it('rejects invalid delivery format', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'active', delivery_format: 'share_link' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppAccount('comp-1', { deliveryFormat: 'interactive' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Invalid delivery format')
  })

  it('audit metadata does not contain full phone', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'pending_review', delivery_format: 'share_link' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    mockSvc.update.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: { id: 'cfg-1', company_id: 'comp-1', status: 'active', delivery_format: 'share_link' },
      error: null,
    })

    await saveWhatsAppAccount('comp-1', { status: 'active' })

    const auditCall = vi.mocked(logAdminAction).mock.calls[0][0]
    const metadataStr = JSON.stringify(auditCall.metadata)
    expect(metadataStr).not.toMatch(/\+1\d{10}/)
  })
})

describe('saveWhatsAppSender', () => {
  it('returns error for invalid phone', async () => {
    const result = await saveWhatsAppSender('comp-1', 'abc')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Invalid phone')
  })

  it('returns error when company has no config', async () => {
    mockSvc.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppSender('comp-1', '+15551234567')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('WhatsApp config')
  })

  it('requires a matching verified phone on an enabled company member account', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null }) // config check
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppSender('comp-1', '+15551234567', { userId: 'user-999' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('enabled account that belongs to this company')
    expect(isCurrentWhatsAppLinkedIdentity).toHaveBeenCalledWith('comp-1', 'user-999', '+15551234567')
    expect(mockSvc.insert).not.toHaveBeenCalled()
  })

  it('rejects duplicate active phone on another company', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.limit.mockResolvedValue({
      data: [{ company_id: 'comp-other', id: 'sender-other' }],
      error: null,
    })

    const result = await saveWhatsAppSender('comp-1', '+15551234567')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('already active for another company')
  })

  it('creates new sender successfully', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.limit.mockResolvedValue({ data: [], error: null })

    const newSender = {
      id: 'sender-1',
      company_id: 'comp-1',
      config_id: 'cfg-1',
      phone_e164: '+15551234567',
      status: 'pending',
      user_id: null,
      verified_at: null,
      created_by_admin: true,
    }
    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({ data: newSender, error: null })

    const result = await saveWhatsAppSender('comp-1', '+15551234567')
    expect(result.ok).toBe(true)
    expect(mockSvc.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active', admin_phone_only: true, user_id: null, verified_at: expect.any(String),
    }))
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.sender.save',
        targetType: 'whatsapp_sender',
      }),
    )
  })

  it('preserves the linked user when saving an existing sender without a replacement user', async () => {
    vi.mocked(isCurrentWhatsAppLinkedIdentity).mockResolvedValue(true)
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null })
      .mockResolvedValueOnce({ data: {
        id: 'sender-1', user_id: 'user-1', status: 'active', updated_at: '2026-01-01',
      }, error: null })
    mockSvc.limit.mockResolvedValue({ data: [], error: null })
    mockSvc.single.mockResolvedValue({ data: { id: 'sender-1' }, error: null })

    expect(await saveWhatsAppSender('comp-1', '+15551234567', { senderId: 'sender-1' })).toMatchObject({ ok: true })
    expect(mockSvc.update).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', admin_phone_only: false,
    }))
  })

  it('audit metadata contains only last4 of phone', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.limit.mockResolvedValue({ data: [], error: null })

    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: {
        id: 'sender-1',
        company_id: 'comp-1',
        config_id: 'cfg-1',
        phone_e164: '+15551234567',
        status: 'pending',
      },
      error: null,
    })

    await saveWhatsAppSender('comp-1', '+15551234567')

    const auditCall = vi.mocked(logAdminAction).mock.calls[0][0]
    const metadataStr = JSON.stringify(auditCall.metadata)
    expect(metadataStr).toContain('4567')
    expect(metadataStr).not.toContain('+15551234567')
  })
})

describe('setWhatsAppSenderStatus', () => {
  it('returns error for invalid status', async () => {
    const result = await setWhatsAppSenderStatus('sender-1', 'invalid')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Invalid status')
  })

  it('returns error when sender not found', async () => {
    mockSvc.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await setWhatsAppSenderStatus('sender-missing', 'active')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('not found')
  })

  it('rejects invalid transitions', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'active', phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await setWhatsAppSenderStatus('sender-1', 'pending_review')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Cannot transition')
  })

  it('allows valid transition (active -> suspended)', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'active', phone_e164: '+15551234567', company_id: 'comp-1', verified_at: '2026-01-01' },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.update.mockReturnValue(mockSvc)

    const result = await setWhatsAppSenderStatus('sender-1', 'suspended')
    expect(result.ok).toBe(true)
    expect(mockSvc.update).toHaveBeenCalledWith(expect.objectContaining({ suspension_reason: 'admin' }))
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.sender.status',
      }),
    )
  })

  it('requires admin attestation before activating an unlinked legacy sender', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'pending_review', user_id: null, admin_phone_only: false, phone_e164: '+15551234567', company_id: 'comp-1', verified_at: null },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await setWhatsAppSenderStatus('sender-1', 'active')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('without a linked account')
  })

  it('can reactivate an explicitly attested phone-only sender', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'suspended', user_id: null, admin_phone_only: true, phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })

    expect(await setWhatsAppSenderStatus('sender-1', 'active')).toMatchObject({ ok: true })
    expect(mockSvc.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', suspension_reason: null }))
  })

  it('records an explicit re-attestation for a previously admin-created phone-only sender', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'suspended', user_id: null, created_by_admin: true, admin_phone_only: false, phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })

    expect(await setWhatsAppSenderStatus('sender-1', 'active', { confirmPhoneOnly: true })).toMatchObject({ ok: true })
    expect(mockSvc.update).toHaveBeenCalledWith(expect.objectContaining({ admin_phone_only: true }))
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ confirmedPhoneOnly: true }),
    }))
  })
})

describe('removeWhatsAppSender', () => {
  it('returns error when sender not found', async () => {
    mockSvc.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await removeWhatsAppSender('sender-missing')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('not found')
  })

  it('returns error when already suspended', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'suspended', suspension_reason: 'admin', phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await removeWhatsAppSender('sender-1')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('already suspended')
  })

  it('suspends an active sender', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'active', phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.update.mockReturnValue(mockSvc)

    const result = await removeWhatsAppSender('sender-1')
    expect(result.ok).toBe(true)
    expect(result.message).toContain('suspended')
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.sender.remove',
      }),
    )
  })

  it('turns an automatic suspension into an explicit revocation', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'suspended', suspension_reason: 'phone_change', phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })

    expect(await removeWhatsAppSender('sender-1')).toMatchObject({ ok: true })
    expect(mockSvc.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'suspended', suspension_reason: 'admin' }))
  })

  it('audit metadata has only last4 phone', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'active', phone_e164: '+15551234567', company_id: 'comp-1' },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.update.mockReturnValue(mockSvc)

    await removeWhatsAppSender('sender-1')

    const auditCall = vi.mocked(logAdminAction).mock.calls[0][0]
    const metadataStr = JSON.stringify(auditCall.metadata)
    expect(metadataStr).toContain('4567')
    expect(metadataStr).not.toContain('+15551234567')
  })
})

describe('audit log completeness', () => {
  it('calls logAdminAction once per successful mutation', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    mockSvc.select.mockReturnValue(mockSvc)
    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: { id: 'cfg-1', company_id: 'comp-1', status: 'pending_review', delivery_format: 'interactive' },
      error: null,
    })

    await saveWhatsAppAccount('comp-1', {})

    expect(logAdminAction).toHaveBeenCalledTimes(1)
  })
})
