// tests/unit/support-mode.test.ts
// Phase 151 Plan 01: signed, time-boxed Support Mode session-claim module.
// Covers SUPPORT-01 (requireAdmin-gated mint), SUPPORT-03 (audit logging with
// duration), SUPPORT-04 (tamper/expiry/revocation rejection on every read).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------- mocks ----------
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/admin/audit-log', () => ({ logAdminAction: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { cookies } from 'next/headers'
import { requireServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/auth/admin-context'
import { logAdminAction } from '@/lib/admin/audit-log'
import { redirect } from 'next/navigation'

// ---------- helpers ----------
function makeCookieStore({ value }: { value: string | null }) {
  const setSpy = vi.fn()
  const get = vi.fn().mockReturnValue(value !== null ? { value } : undefined)
  return { store: { get, set: setSpy }, setSpy, get }
}

function makeServiceClient({ isAdmin }: { isAdmin: boolean }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: isAdmin ? { user_id: 'admin-1' } : null })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from, _spies: { from, select, eq, maybeSingle } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.useRealTimers()
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('startSupportSession', () => {
  it('rejects when requireAdmin() rejects/throws — no cookie written, no audit log call', async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error('not admin'))
    const { setSpy } = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue({ get: vi.fn(), set: setSpy } as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')

    await expect(startSupportSession('company-1')).rejects.toThrow()
    expect(setSpy).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it('on success: writes an httpOnly cookie and logs company.support_mode_start with targetId=companyId', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const { store, setSpy } = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')

    await startSupportSession('company-42')

    expect(setSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    )
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'company.support_mode_start',
        targetType: 'company',
        targetId: 'company-42',
      })
    )
  })
})

describe('getSupportModeSession', () => {
  it('valid signature + unexpired + admin still in platform_admins -> returns { adminUserId, companyId }', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const mintStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(mintStore.store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')
    await startSupportSession('company-9')

    const mintedValue = mintStore.setSpy.mock.calls[0][1] as string

    const readStore = makeCookieStore({ value: mintedValue })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)
    const svc = makeServiceClient({ isAdmin: true })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const { getSupportModeSession } = await import('@/lib/auth/support-mode')
    const result = await getSupportModeSession()

    expect(result).toEqual({ adminUserId: 'admin-1', companyId: 'company-9' })
  })

  it('tampered payload (flipped char in signature) -> returns null', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const mintStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(mintStore.store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')
    await startSupportSession('company-9')

    const mintedValue = mintStore.setSpy.mock.calls[0][1] as string
    const [payloadPart, sigPart] = mintedValue.split('.')
    const flippedChar = sigPart[0] === 'a' ? 'b' : 'a'
    const tamperedSig = flippedChar + sigPart.slice(1)
    const tamperedValue = `${payloadPart}.${tamperedSig}`

    const readStore = makeCookieStore({ value: tamperedValue })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)
    const svc = makeServiceClient({ isAdmin: true })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const { getSupportModeSession } = await import('@/lib/auth/support-mode')
    const result = await getSupportModeSession()

    expect(result).toBeNull()
  })

  it('expired expiresAt -> returns null even though signature is valid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const mintStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(mintStore.store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')
    await startSupportSession('company-9')

    const mintedValue = mintStore.setSpy.mock.calls[0][1] as string

    // Advance time past the TTL (2 hours).
    vi.setSystemTime(new Date('2026-01-01T03:00:00.000Z'))

    const readStore = makeCookieStore({ value: mintedValue })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)
    const svc = makeServiceClient({ isAdmin: true })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const { getSupportModeSession } = await import('@/lib/auth/support-mode')
    const result = await getSupportModeSession()

    expect(result).toBeNull()

    vi.useRealTimers()
  })

  it('admin removed from platform_admins mid-session -> returns null despite valid signature and unexpired TTL', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const mintStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(mintStore.store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')
    await startSupportSession('company-9')

    const mintedValue = mintStore.setSpy.mock.calls[0][1] as string

    const readStore = makeCookieStore({ value: mintedValue })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)
    const svc = makeServiceClient({ isAdmin: false })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const { getSupportModeSession } = await import('@/lib/auth/support-mode')
    const result = await getSupportModeSession()

    expect(result).toBeNull()
  })

  it('no cookie present -> returns null without calling requireServiceClient', async () => {
    const readStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)

    const { getSupportModeSession } = await import('@/lib/auth/support-mode')
    const result = await getSupportModeSession()

    expect(result).toBeNull()
    expect(requireServiceClient).not.toHaveBeenCalled()
  })
})

describe('endSupportSession', () => {
  it('reads issuedAt before clearing, computes durationSeconds, logs company.support_mode_end, then clears the cookie, then redirects to /admin/companies', async () => {
    vi.useFakeTimers()
    const start = new Date('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(start)

    vi.mocked(requireAdmin).mockResolvedValue({ userId: 'admin-1', email: 'admin@x.com' })
    const mintStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(mintStore.store as never)

    const { startSupportSession } = await import('@/lib/auth/support-mode')
    await startSupportSession('company-9')
    const mintedValue = mintStore.setSpy.mock.calls[0][1] as string

    // Advance by 1 hour, 1 minute, 1 second (3661s) before ending.
    vi.setSystemTime(new Date(start.getTime() + 3661000))

    const readStore = makeCookieStore({ value: mintedValue })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)
    const svc = makeServiceClient({ isAdmin: true })
    vi.mocked(requireServiceClient).mockReturnValue(svc as never)

    const { endSupportSession } = await import('@/lib/auth/support-mode')
    await endSupportSession()

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'company.support_mode_end',
        metadata: expect.objectContaining({ durationSeconds: expect.any(Number) }),
      })
    )
    const call = vi.mocked(logAdminAction).mock.calls[0][0]
    expect(call.metadata?.durationSeconds).toBeGreaterThanOrEqual(3659)
    expect(call.metadata?.durationSeconds).toBeLessThanOrEqual(3663)

    // Ordering: logAdminAction must be called BEFORE the cookie-clearing call.
    const logCallOrder = vi.mocked(logAdminAction).mock.invocationCallOrder[0]
    const clearCallOrder = readStore.setSpy.mock.invocationCallOrder[0]
    expect(logCallOrder).toBeLessThan(clearCallOrder)

    expect(redirect).toHaveBeenCalledWith('/admin/companies')

    vi.useRealTimers()
  })

  it('no active session -> is a safe no-op (does not throw, does not log, does not redirect)', async () => {
    const readStore = makeCookieStore({ value: null })
    vi.mocked(cookies).mockResolvedValue(readStore.store as never)

    const { endSupportSession } = await import('@/lib/auth/support-mode')

    await expect(endSupportSession()).resolves.not.toThrow()
    expect(logAdminAction).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('AuditAction union — support-mode literals', () => {
  it("lib/admin/audit-log.ts source contains 'company.support_mode_start' and 'company.support_mode_end'", () => {
    let source: string
    try {
      source = readFileSync(resolve(process.cwd(), 'lib/admin/audit-log.ts'), 'utf8')
    } catch {
      expect.fail('Wave 0: lib/admin/audit-log.ts not yet extended')
      return
    }
    expect(source).toMatch(/'company\.support_mode_start'/)
    expect(source).toMatch(/'company\.support_mode_end'/)
  })
})
