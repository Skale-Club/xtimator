import { describe, expect, it, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockRpc = vi.fn()
const mockMaybeSingle = vi.fn()

const chainable = {
  select: mockSelect.mockReturnThis(),
  eq: mockEq.mockReturnThis(),
  maybeSingle: mockMaybeSingle,
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({
    from: vi.fn(() => chainable),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))

import {
  getWhatsAppAccountStatus,
  findActiveWhatsAppSender,
  normalizeWhatsAppPhone,
  revalidateWhatsAppSender,
} from '@/lib/whatsapp/account-registry'

beforeEach(() => {
  vi.clearAllMocks()
  mockSelect.mockReturnValue(chainable)
  mockEq.mockReturnValue(chainable)
  mockRpc.mockResolvedValue({ data: [], error: null })
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
})

// ─── normalizeWhatsAppPhone ──────────────────────────────────────────────────

describe('normalizeWhatsAppPhone', () => {
  it('normalizes a US number with country code', () => {
    expect(normalizeWhatsAppPhone('+15551234567')).toBe('+15551234567')
  })

  it('normalizes a number without leading +', () => {
    expect(normalizeWhatsAppPhone('15551234567')).toBe('+15551234567')
  })

  it('strips non-digit characters', () => {
    expect(normalizeWhatsAppPhone('+1 (555) 123-4567')).toBe('+15551234567')
  })

  it('returns null for null/undefined', () => {
    expect(normalizeWhatsAppPhone(null)).toBeNull()
    expect(normalizeWhatsAppPhone(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeWhatsAppPhone('')).toBeNull()
    expect(normalizeWhatsAppPhone('   ')).toBeNull()
  })

  it('returns null for too-short numbers', () => {
    expect(normalizeWhatsAppPhone('+155512')).toBeNull()
  })

  it('returns null for too-long numbers', () => {
    expect(normalizeWhatsAppPhone('+1555123456789012')).toBeNull()
  })

  it('handles international numbers', () => {
    expect(normalizeWhatsAppPhone('+447911123456')).toBe('+447911123456')
  })

  it('rejects letters, extensions, and a zero country code', () => {
    expect(normalizeWhatsAppPhone('+15551234567 callback')).toBeNull()
    expect(normalizeWhatsAppPhone('+05551234567')).toBeNull()
  })
})

// ─── getWhatsAppAccountStatus ────────────────────────────────────────────────

describe('getWhatsAppAccountStatus', () => {
  it('returns configured=true and active=true for an active config', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'active', delivery_format: 'share_link' },
      error: null,
    })

    const result = await getWhatsAppAccountStatus('company-123')

    expect(result).toEqual({
      configured: true,
      active: true,
      status: 'active',
      deliveryFormat: 'share_link',
    })
    expect(mockEq).toHaveBeenCalledWith('company_id', 'company-123')
  })

  it('returns configured=true and active=false for pending_review', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'pending_review', delivery_format: 'formatted_text' },
      error: null,
    })

    const result = await getWhatsAppAccountStatus('company-123')

    expect(result).toEqual({
      configured: true,
      active: false,
      status: 'pending_review',
      deliveryFormat: 'formatted_text',
    })
  })

  it('returns configured=false for missing config', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await getWhatsAppAccountStatus('company-123')

    expect(result).toEqual({
      configured: false,
      active: false,
      status: null,
      deliveryFormat: null,
    })
  })

  it('returns configured=false on DB error', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    })

    const result = await getWhatsAppAccountStatus('company-123')

    expect(result).toEqual({
      configured: false,
      active: false,
      status: null,
      deliveryFormat: null,
    })
  })

  it('returns suspended status correctly', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'suspended', delivery_format: 'pdf_attachment' },
      error: null,
    })

    const result = await getWhatsAppAccountStatus('company-123')

    expect(result).toEqual({
      configured: true,
      active: false,
      status: 'suspended',
      deliveryFormat: 'pdf_attachment',
    })
  })

  it('never exposes WABA ID, token, phone number, or conversation data', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { status: 'active', delivery_format: 'share_link' },
      error: null,
    })

    const result = await getWhatsAppAccountStatus('company-123')

    // The return type should only have the 4 documented fields
    const keys = Object.keys(result)
    expect(keys).toEqual(
      expect.arrayContaining(['configured', 'active', 'status', 'deliveryFormat']),
    )
    expect(keys).toHaveLength(4)
    expect(result).not.toHaveProperty('wabaId')
    expect(result).not.toHaveProperty('token')
    expect(result).not.toHaveProperty('phoneNumber')
    expect(result).not.toHaveProperty('conversationCount')
  })
})

// ─── findActiveWhatsAppSender ────────────────────────────────────────────────

describe('findActiveWhatsAppSender', () => {
  it('returns the sender on an exact active match', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          company_id: 'company-abc',
          user_id: 'user-123',
          phone_e164: '+15551234567',
          authorized: true,
        },
      ],
      error: null,
    })

    const result = await findActiveWhatsAppSender('+15551234567')

    expect(result).toEqual({
      companyId: 'company-abc',
      userId: 'user-123',
      phoneE164: '+15551234567',
    })
    expect(mockRpc).toHaveBeenCalledWith('resolve_whatsapp_sender_authority', { p_phone_e164: '+15551234567' })
  })

  it('returns null for zero matches (unknown sender)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await findActiveWhatsAppSender('+15559999999')

    expect(result).toBeNull()
  })

  it('returns null for ambiguous matches (multiple active senders)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { company_id: 'company-1', user_id: 'user-a', phone_e164: '+15551234567', authorized: true },
        { company_id: 'company-2', user_id: 'user-b', phone_e164: '+15551234567', authorized: false },
      ],
      error: null,
    })

    const result = await findActiveWhatsAppSender('+15551234567')

    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'timeout' },
    })

    const result = await findActiveWhatsAppSender('+15551234567')

    expect(result).toBeNull()
  })

  it('throws the authority read failure in strict mode so queued work can retry', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })
    await expect(findActiveWhatsAppSender('+15551234567', { throwOnError: true }))
      .rejects.toThrow('authority lookup failed')
  })

  it('returns null for invalid phone input', async () => {
    const result = await findActiveWhatsAppSender('')

    expect(result).toBeNull()
    // Should not even query the DB
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects the only active row when its underlying authority is invalid', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { company_id: 'company-abc', user_id: 'user-123', phone_e164: '+15551234567', authorized: false },
      ],
      error: null,
    })

    await expect(findActiveWhatsAppSender('+15551234567')).resolves.toBeNull()
  })

  it('only revalidates queued work for the user and company it originally authorized', async () => {
    mockRpc.mockResolvedValue({
      data: [{ company_id: 'company-abc', user_id: 'user-456', phone_e164: '+15551234567', authorized: true }],
      error: null,
    })
    const expected = { companyId: 'company-abc', userId: 'user-123', phoneE164: '+15551234567' }
    await expect(revalidateWhatsAppSender(expected)).resolves.toBe(false)
    await expect(revalidateWhatsAppSender({ ...expected, userId: 'user-456' })).resolves.toBe(true)
    await expect(revalidateWhatsAppSender({ ...expected, userId: 'user-456', companyId: 'other-company' }))
      .resolves.toBe(false)
  })

  it('normalizes phone before querying', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await findActiveWhatsAppSender('15551234567')

    // The first eq should be the normalized phone
    expect(mockRpc).toHaveBeenCalledWith('resolve_whatsapp_sender_authority', { p_phone_e164: '+15551234567' })
  })

  it('does not log the full sender phone on zero matches', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: [], error: null })

    await findActiveWhatsAppSender('+15551234567')

    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]))
    // Should contain only last 4 digits
    expect(warnCalls.some((msg) => msg.includes('...4567'))).toBe(true)
    // Should NOT contain full phone
    expect(warnCalls.some((msg) => msg.includes('5551234567'))).toBe(false)
    warnSpy.mockRestore()
  })

  it('does not log the full sender phone on ambiguity', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: [
        { company_id: 'c1', user_id: 'u1', phone_e164: '+15551234567' },
        { company_id: 'c2', user_id: 'u2', phone_e164: '+15551234567' },
      ],
      error: null,
    })

    await findActiveWhatsAppSender('+15551234567')

    const warnCalls = warnSpy.mock.calls.map((c) => String(c[0]))
    expect(warnCalls.some((msg) => msg.includes('...4567'))).toBe(true)
    expect(warnCalls.some((msg) => msg.includes('5551234567'))).toBe(false)
    warnSpy.mockRestore()
  })
})
