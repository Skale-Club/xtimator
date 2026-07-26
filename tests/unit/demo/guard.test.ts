import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/demo/config', () => ({
  getDemoUserEmail: () => 'demo@xtimator.test',
  isDemoCompany: (companyId: string | null | undefined) => companyId === 'demo-company',
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(),
}))

const { createClient } = await import('@/lib/supabase/server')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const guard = await import('@/lib/demo/guard')

const getClaims = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue({
    auth: { getClaims },
  } as never)
  getClaims.mockResolvedValue({
    data: { claims: { sub: 'normal-user', email: 'owner@example.com' } },
  })
  vi.mocked(getActiveCompanyId).mockResolvedValue('normal-company')
})

describe('SAFE-01: explicit demo context classification', () => {
  it.each([
    {
      name: 'demo principal on a normal company',
      context: { userId: 'demo-user', email: 'DEMO@XTIMATOR.TEST', companyId: 'normal-company' },
      expected: true,
    },
    {
      name: 'normal principal on the deterministic demo company',
      context: { userId: 'normal-user', email: 'owner@example.com', companyId: 'demo-company' },
      expected: true,
    },
    {
      name: 'demo principal on the deterministic demo company',
      context: { userId: 'demo-user', email: 'demo@xtimator.test', companyId: 'demo-company' },
      expected: true,
    },
    {
      name: 'normal principal on a normal company',
      context: { userId: 'normal-user', email: 'owner@example.com', companyId: 'normal-company' },
      expected: false,
    },
  ])('$name => $expected', async ({ context, expected }) => {
    await expect(guard.isDemoContext(context)).resolves.toBe(expected)
  })

  it.each(['owner', 'admin', 'provider', 'support'])(
    'does not exempt %s-like metadata from the demo-user OR demo-company rule',
    async (role) => {
      await expect(
        guard.isDemoContext({
          userId: 'privileged-user',
          email: 'owner@example.com',
          companyId: 'demo-company',
          role,
          isCanonicalPrincipal: true,
        } as never),
      ).resolves.toBe(true)
    },
  )

  it('classifies trusted explicit context without reading cookies or ambient auth', async () => {
    await expect(
      guard.isDemoContext({ userId: 'worker-user', companyId: 'demo-company' }),
    ).resolves.toBe(true)

    expect(createClient).not.toHaveBeenCalled()
    expect(getActiveCompanyId).not.toHaveBeenCalled()
  })
})

describe('SAFE-01: ambient demo context classification', () => {
  it('denies a verified normal principal when the membership-validated active company is demo', async () => {
    vi.mocked(getActiveCompanyId).mockResolvedValue('demo-company')

    await expect(guard.isDemoContext()).resolves.toBe(true)

    expect(getClaims).toHaveBeenCalledOnce()
    expect(getActiveCompanyId).toHaveBeenCalledOnce()
  })

  it('denies the verified demo principal even when its validated company is normal', async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'demo-user', email: 'demo@xtimator.test' } },
    })

    await expect(guard.isDemoContext()).resolves.toBe(true)
  })

  it('never treats raw role metadata as a write exemption', async () => {
    getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'demo-user',
          email: 'demo@xtimator.test',
          role: 'owner',
          is_super_admin: true,
          provides_services: true,
        },
      },
    })

    await expect(guard.assertWritable()).resolves.toEqual({
      error: guard.DEMO_READONLY_MESSAGE,
    })
  })
})

describe('SAFE-01: shared denial shapes', () => {
  it('assertCompanyWritable denies the deterministic demo company without ambient state', async () => {
    await expect(guard.assertCompanyWritable('demo-company')).resolves.toEqual({
      error: guard.DEMO_READONLY_MESSAGE,
    })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('demoGuardResponse returns the repository-standard 403 response', async () => {
    vi.mocked(getActiveCompanyId).mockResolvedValue('demo-company')

    const response = await guard.demoGuardResponse()

    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual({
      error: 'demo_readonly',
      message: guard.DEMO_READONLY_MESSAGE,
    })
  })
})
