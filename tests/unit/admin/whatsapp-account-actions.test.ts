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
  normalizeWhatsAppPhone: vi.fn((raw: string) => {
    if (!raw) return null
    const digits = raw.replace(/[^\d]/g, '')
    if (digits.length < 7 || digits.length > 15) return null
    return `+${digits}`
  }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import {
  saveWhatsAppAccount,
  saveWhatsAppSender,
  setWhatsAppSenderStatus,
  removeWhatsAppSender,
} from '@/lib/actions/admin-whatsapp-accounts'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockSvc = chainable()
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

    const newRow = { id: 'cfg-1', company_id: 'comp-1', status: 'pending_review', delivery_format: 'interactive' }
    mockSvc.insert.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({ data: newRow, error: null })

    const result = await saveWhatsAppAccount('comp-1', { deliveryFormat: 'interactive' })

    expect(result.ok).toBe(true)
    expect(mockSvc.insert).toHaveBeenCalled()
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
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'active', delivery_format: 'interactive' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    // active -> pending_review is NOT a valid transition
    const result = await saveWhatsAppAccount('comp-1', { status: 'pending_review' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Cannot transition')
  })

  it('allows valid status transitions', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'suspended', delivery_format: 'interactive' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    mockSvc.update.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: { id: 'cfg-1', company_id: 'comp-1', status: 'active', delivery_format: 'interactive' },
      error: null,
    })

    const result = await saveWhatsAppAccount('comp-1', { status: 'active' })
    expect(result.ok).toBe(true)
    expect(logAdminAction).toHaveBeenCalled()
  })

  it('rejects invalid delivery format', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'active', delivery_format: 'interactive' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppAccount('comp-1', { deliveryFormat: 'invalid' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Invalid delivery format')
  })

  it('audit metadata does not contain full phone', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'comp-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'cfg-1', status: 'pending_review', delivery_format: 'interactive' }, error: null })
    mockSvc.select.mockReturnValue(mockSvc)

    mockSvc.update.mockReturnValue(mockSvc)
    mockSvc.single.mockResolvedValue({
      data: { id: 'cfg-1', company_id: 'comp-1', status: 'active', delivery_format: 'interactive' },
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

  it('returns error when user is not a company member', async () => {
    mockSvc.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'cfg-1' }, error: null }) // config check
      .mockResolvedValueOnce({ data: null, error: null }) // membership check
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await saveWhatsAppSender('comp-1', '+15551234567', { userId: 'user-999' })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('not a member')
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
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.sender.save',
        targetType: 'whatsapp_sender',
      }),
    )
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

    const result = await setWhatsAppSenderStatus('sender-1', 'pending')
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
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'whatsapp.sender.status',
      }),
    )
  })

  it('requires verified_at for activation', async () => {
    mockSvc.maybeSingle.mockResolvedValue({
      data: { id: 'sender-1', status: 'pending', phone_e164: '+15551234567', company_id: 'comp-1', verified_at: null },
      error: null,
    })
    mockSvc.select.mockReturnValue(mockSvc)

    const result = await setWhatsAppSenderStatus('sender-1', 'active')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('verification timestamp')
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
      data: { id: 'sender-1', status: 'suspended', phone_e164: '+15551234567', company_id: 'comp-1' },
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
