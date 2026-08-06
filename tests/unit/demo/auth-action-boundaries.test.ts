import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const denied = {
  error: 'This is a read-only demo. Create a free account to make changes.',
} as const

const authSpies = {
  getClaims: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}
const adminDeleteUser = vi.fn()
const requireServiceClient = vi.fn()
const assertWritable = vi.fn()
const serverStorage = vi.fn()
const convertImageToWebp = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: authSpies })),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) => requireServiceClient(...args),
}))
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...args: unknown[]) => assertWritable(...args),
}))
vi.mock('@/lib/auth-logger', () => ({ logAuthEvent: vi.fn() }))
vi.mock('@/lib/utils/site-url', () => ({
  getCanonicalBaseUrl: () => 'https://xtimator.com',
}))
vi.mock('@/lib/storage/server', () => ({
  serverStorage: (...args: unknown[]) => serverStorage(...args),
}))
vi.mock('@/lib/image/webp', () => ({
  convertImageToWebp: (...args: unknown[]) => convertImageToWebp(...args),
}))
vi.mock('@/lib/schemas/admin', () => ({
  imagePositionSchema: { safeParse: vi.fn(() => ({ success: false })) },
}))
vi.mock('@/lib/system-colors', () => ({ SYSTEM_COLORS: { primary: '#406EF1' } }))
vi.mock('@/lib/money/currency', () => ({ normalizeCurrencyCode: () => 'USD' }))
vi.mock('@/lib/industries', () => ({ resolveIndustries: () => [] }))
vi.mock('@/lib/price-book-seed', () => ({ appendIndustryPriceBook: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(async () => 'normal-company'),
}))
vi.mock('@/lib/email/account-emails', () => ({
  sendProfileUpdatedEmail: vi.fn(),
  diffProfileFields: vi.fn(() => []),
}))
vi.mock('@/lib/estimate/templates/registry', () => ({
  isEstimateTemplateId: vi.fn(() => false),
  DEFAULT_ESTIMATE_TEMPLATE_ID: 'classic',
}))

const authActions = await import('@/lib/actions/auth')
const settingsActions = await import('@/lib/actions/settings')

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  if (start < 0) throw new Error(`Missing exported action ${name}`)
  const next = source.indexOf('\nexport async function ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

function expectGuardBefore(body: string, effect: RegExp, actionName: string) {
  const guardIndex = body.search(/assertWritable\s*\(/)
  const effectIndex = body.search(effect)
  expect(guardIndex, `${actionName} must call assertWritable`).toBeGreaterThan(-1)
  expect(effectIndex, `${actionName} must contain the protected effect`).toBeGreaterThan(-1)
  expect(guardIndex, `${actionName} guard must precede its Auth/service/storage effect`).toBeLessThan(
    effectIndex,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  assertWritable.mockResolvedValue(denied)
  authSpies.getClaims.mockResolvedValue({
    data: { claims: { sub: 'demo-user', email: 'demo@xtimator.test' } },
  })
  authSpies.signUp.mockResolvedValue({
    error: { message: 'already registered' },
  })
  authSpies.signInWithPassword.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid login credentials' },
  })
  authSpies.resetPasswordForEmail.mockResolvedValue({ error: null })
  authSpies.updateUser.mockResolvedValue({ error: null })
  authSpies.signOut.mockResolvedValue({ error: null })
  requireServiceClient.mockReturnValue({
    auth: { admin: { deleteUser: adminDeleteUser } },
  })
  serverStorage.mockReturnValue({
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
  })
})

describe('SAFE-02: guard-before-effect source contract', () => {
  const authSource = readFileSync(resolve(process.cwd(), 'lib/actions/auth.ts'), 'utf8')
  const settingsSource = readFileSync(resolve(process.cwd(), 'lib/actions/settings.ts'), 'utf8')

  it('guards authenticated recovery password updates before updateUser', () => {
    expectGuardBefore(
      functionBody(authSource, 'updatePassword'),
      /auth\.updateUser\s*\(/,
      'updatePassword',
    )
  })

  it('guards account settings mutations before their first irreversible effect', () => {
    expectGuardBefore(
      functionBody(settingsSource, 'changePassword'),
      /auth\.signInWithPassword\s*\(/,
      'changePassword',
    )
    expectGuardBefore(
      functionBody(settingsSource, 'changeEmail'),
      /auth\.updateUser\s*\(/,
      'changeEmail',
    )
    expectGuardBefore(
      functionBody(settingsSource, 'updateProfile'),
      /serverStorage\s*\(|auth\.updateUser\s*\(/,
      'updateProfile',
    )
    expectGuardBefore(
      functionBody(settingsSource, 'deleteAccount'),
      /requireServiceClient\s*\(/,
      'deleteAccount',
    )
  })
})

describe('SAFE-02: classified Auth mutations stop before effects', () => {
  it('denies recovery password update before Auth update or session revocation', async () => {
    const form = new FormData()
    form.set('password', 'new-password')

    await expect(authActions.updatePassword(form)).resolves.toEqual(denied)

    expect(authSpies.updateUser).not.toHaveBeenCalled()
    expect(authSpies.signOut).not.toHaveBeenCalled()
  })

  it('denies password change before password verification or update', async () => {
    await expect(
      settingsActions.changePassword({
        currentPassword: 'current-password',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual(denied)

    expect(authSpies.signInWithPassword).not.toHaveBeenCalled()
    expect(authSpies.updateUser).not.toHaveBeenCalled()
  })

  it('denies email change before updateUser', async () => {
    await expect(
      settingsActions.changeEmail({ newEmail: 'new@example.com' }),
    ).resolves.toEqual(denied)

    expect(authSpies.updateUser).not.toHaveBeenCalled()
  })

  it('denies profile change before storage, conversion, or updateUser', async () => {
    const form = new FormData()
    form.set('fullName', 'Demo Owner')
    form.set('avatar', new File(['avatar'], 'avatar.png', { type: 'image/png' }))

    await expect(settingsActions.updateProfile(form)).resolves.toEqual(denied)

    expect(serverStorage).not.toHaveBeenCalled()
    expect(convertImageToWebp).not.toHaveBeenCalled()
    expect(authSpies.updateUser).not.toHaveBeenCalled()
  })

  it('denies account deletion before service-role construction or admin deletion', async () => {
    await expect(settingsActions.deleteAccount()).resolves.toEqual(denied)

    expect(requireServiceClient).not.toHaveBeenCalled()
    expect(adminDeleteUser).not.toHaveBeenCalled()
  })
})

describe('SAFE-02: anonymous authentication remains available', () => {
  it('does not apply an authenticated demo guard to sign-up', async () => {
    const form = new FormData()
    form.set('email', 'new@example.com')
    form.set('password', 'password')

    await authActions.signUp(form)

    expect(authSpies.signUp).toHaveBeenCalledOnce()
    expect(assertWritable).not.toHaveBeenCalled()
  })

  it('does not apply an authenticated demo guard to sign-in', async () => {
    const form = new FormData()
    form.set('email', 'owner@example.com')
    form.set('password', 'password')

    await authActions.signIn(form)

    expect(authSpies.signInWithPassword).toHaveBeenCalledOnce()
    expect(assertWritable).not.toHaveBeenCalled()
  })

  it('does not apply an authenticated demo guard to reset-request initiation', async () => {
    const form = new FormData()
    form.set('email', 'owner@example.com')

    await expect(authActions.resetPassword(form)).resolves.toEqual({
      success: "Check your inbox — we've sent a reset link to owner@example.com.",
    })

    expect(authSpies.resetPasswordForEmail).toHaveBeenCalledOnce()
    expect(assertWritable).not.toHaveBeenCalled()
  })
})
