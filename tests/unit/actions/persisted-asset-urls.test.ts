// @vitest-environment node
//
// Phase 190 Plan 02 — URL-01: the seven TENANT-SCOPED writers that persist an
// asset URL must persist a SAME-ORIGIN path, never a storage-backend hostname.
//
// Each test asserts BOTH halves:
//   1. the exact value written to the DB (or returned to the caller), and
//   2. that `storage.getPublicUrl` was never called.
// (2) is what makes the suite capable of failing if a single line is reverted —
// without it, a stub that happened to return a relative string would pass.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const CLIENT_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'
const NEW_COMPANY_ID = '55555555-5555-4555-8555-555555555555'
const FIXED_NOW = 1_700_000_000_000

// ---------------------------------------------------------------- storage stub
const storageMocks = vi.hoisted(() => ({
  upload: vi.fn(async (_bucket: string, path: string) => ({ path })),
  // MUST NOT be called by any of the seven sites after this plan.
  getPublicUrl: vi.fn(
    (bucket: string, path: string) =>
      `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
  ),
  remove: vi.fn(async () => undefined),
}))

vi.mock('@/lib/storage/server', () => ({
  serverStorage: () => ({
    upload: storageMocks.upload,
    getPublicUrl: storageMocks.getPublicUrl,
    delete: storageMocks.remove,
  }),
}))

vi.mock('@/lib/image/webp', () => ({
  convertImageToWebp: vi.fn(async () => Buffer.from([0x01, 0x02, 0x03])),
}))

// ---------------------------------------------------------------- infra mocks
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: vi.fn(async () => COMPANY_ID),
  ACTIVE_COMPANY_COOKIE: 'active_company',
  ACTIVE_COMPANY_COOKIE_OPTIONS: {},
  setActiveCompanyCookie: vi.fn(),
  clearActiveCompanyCookie: vi.fn(),
}))

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn(async () => null),
  assertCompanyWritable: vi.fn(async () => null),
}))

vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: vi.fn(async () => ({ userId: USER_ID, email: 'admin@test' })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() })),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

vi.mock('@/lib/email/account-emails', () => ({
  sendProfileUpdatedEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
  diffProfileFields: vi.fn(() => []),
}))

vi.mock('@/lib/price-book-seed', () => ({
  appendIndustryPriceBook: vi.fn(async () => undefined),
  seedIndustryPriceBook: vi.fn(async () => undefined),
}))

vi.mock('@/lib/integrations/xphere/dispatch', () => ({
  dispatchXphereSync: vi.fn(),
}))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantSignupCredits: vi.fn(async () => undefined),
  grantMonthlyCredits: vi.fn(async () => undefined),
}))

vi.mock('@/lib/observability/capture', () => ({ captureBackgroundError: vi.fn() }))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn(async () => undefined) }))
vi.mock('@/lib/tax-rates', () => ({ getDefaultTaxRate: vi.fn(async () => 0) }))

// ---------------------------------------------------------------- supabase stub
type Recorded = { table: string; op: 'insert' | 'update' | 'upsert'; payload: unknown }

const recorded: Recorded[] = []
let tableRows: Record<string, unknown> = {}

function queryNode(table: string): Record<string, unknown> {
  const data = tableRows[table] ?? null
  const result = { data, error: null }
  const node: Record<string, unknown> = {
    select: () => queryNode(table),
    eq: () => queryNode(table),
    order: () => queryNode(table),
    limit: () => queryNode(table),
    single: async () => result,
    maybeSingle: async () => result,
    insert: (payload: unknown) => {
      recorded.push({ table, op: 'insert', payload })
      return queryNode(table)
    },
    update: (payload: unknown) => {
      recorded.push({ table, op: 'update', payload })
      return queryNode(table)
    },
    upsert: (payload: unknown) => {
      recorded.push({ table, op: 'upsert', payload })
      return queryNode(table)
    },
    // Makes the builder awaitable for the `await client.from(t).update(x).eq(y)` form.
    then: (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  }
  return node
}

const supabaseStub = {
  auth: {
    getClaims: async () => ({ data: { claims: { sub: USER_ID, email: 'u@test' } } }),
    getUser: async () => ({ data: { user: { id: USER_ID } } }),
    updateUser: async (payload: { data: Record<string, unknown> }) => {
      recorded.push({ table: 'auth.user', op: 'update', payload: payload.data })
      return { error: null }
    },
  },
  from: (table: string) => queryNode(table),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseStub),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => supabaseStub),
  createServiceClient: vi.fn(() => supabaseStub),
}))

// ---------------------------------------------------------------- helpers
function lastPayload(table: string, op: Recorded['op'] = 'update'): Record<string, unknown> {
  const hits = recorded.filter((r) => r.table === table && r.op === op)
  return (hits.at(-1)?.payload ?? {}) as Record<string, unknown>
}

function pngFile(name = 'logo.png'): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

/**
 * A persisted value must carry no backend identity at all. Substring checks (not
 * equality) so that swapping Supabase for R2 — or any future backend — still
 * trips this rather than silently passing a new hostname through.
 */
function expectSameOrigin(value: unknown): void {
  expect(typeof value).toBe('string')
  const url = value as string
  expect(url.startsWith('/storage/')).toBe(true)
  expect(url).not.toContain('://')
  expect(url).not.toContain('supabase.co')
  expect(url).not.toContain('r2.cloudflarestorage.com')
}

beforeEach(() => {
  recorded.length = 0
  tableRows = {}
  storageMocks.upload.mockClear()
  storageMocks.getPublicUrl.mockClear()
  storageMocks.remove.mockClear()
  vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------- 1 + 2
describe('lib/actions/settings.ts', () => {
  it('site 1 — updateCompanySettings persists a same-origin company logo path', async () => {
    tableRows.companies = { name: 'Old', owner_name: null, phone: null, email: null, website: null }
    const { updateCompanySettings } = await import('@/lib/actions/settings')

    const fd = new FormData()
    fd.set('name', 'Acme')
    fd.set('logo', pngFile())

    const result = await updateCompanySettings(fd)

    expect(result).toEqual({ success: true })
    const payload = lastPayload('companies')
    expect(payload.logo_url).toBe(`/storage/logos/${COMPANY_ID}/logo.webp`)
    expectSameOrigin(payload.logo_url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 1 — an upload failure still returns the existing error string', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('bucket gone'))
    const { updateCompanySettings } = await import('@/lib/actions/settings')

    const fd = new FormData()
    fd.set('name', 'Acme')
    fd.set('logo', pngFile())

    expect(await updateCompanySettings(fd)).toEqual({
      error: 'Failed to upload logo. Please try again.',
    })
  })

  it('site 2 — updateProfile persists a same-origin avatar path', async () => {
    const { updateProfile } = await import('@/lib/actions/settings')

    const fd = new FormData()
    fd.set('fullName', 'Jane')
    fd.set('avatar', pngFile('avatar.png'))

    const result = await updateProfile(fd)

    expect(result).toEqual({ success: true })
    const payload = lastPayload('auth.user')
    expect(payload.avatar_url).toBe(`/storage/logos/user-avatars/${USER_ID}/avatar.webp`)
    expectSameOrigin(payload.avatar_url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 2 — an upload failure still returns the existing error string', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('nope'))
    const { updateProfile } = await import('@/lib/actions/settings')

    const fd = new FormData()
    fd.set('avatar', pngFile('avatar.png'))

    expect(await updateProfile(fd)).toEqual({
      error: 'Failed to upload photo. Please try again.',
    })
  })
})

// ---------------------------------------------------------------- 3
describe('lib/actions/company.ts', () => {
  it('site 3 — uploadOnboardingLogoAction returns a same-origin path', async () => {
    const { uploadOnboardingLogoAction } = await import('@/lib/actions/company')

    const fd = new FormData()
    fd.set('file', pngFile())

    const result = (await uploadOnboardingLogoAction(fd)) as { data: { url: string } }

    expect(result.data.url).toBe(`/storage/logos/${USER_ID}/logo.webp`)
    expectSameOrigin(result.data.url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 3 — an upload failure still returns the existing error string', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('nope'))
    const { uploadOnboardingLogoAction } = await import('@/lib/actions/company')

    const fd = new FormData()
    fd.set('file', pngFile())

    expect(await uploadOnboardingLogoAction(fd)).toEqual({ error: 'Logo upload failed.' })
  })
})

// ---------------------------------------------------------------- 4
describe('lib/actions/client.ts', () => {
  it('site 4 — uploadClientLogoAction persists a same-origin client logo path', async () => {
    const { uploadClientLogoAction } = await import('@/lib/actions/client')

    const fd = new FormData()
    fd.set('file', pngFile())

    const result = (await uploadClientLogoAction(CLIENT_ID, fd)) as { data: { url: string } }

    const expected = `/storage/logos/${COMPANY_ID}/clients/${CLIENT_ID}/logo.webp`
    expect(result.data.url).toBe(expected)
    expect(lastPayload('clients').logo_url).toBe(expected)
    expectSameOrigin(result.data.url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 4 — an upload failure still returns the existing error string', async () => {
    storageMocks.upload.mockRejectedValueOnce(new Error('nope'))
    const { uploadClientLogoAction } = await import('@/lib/actions/client')

    const fd = new FormData()
    fd.set('file', pngFile())

    expect(await uploadClientLogoAction(CLIENT_ID, fd)).toEqual({
      error: 'Failed to upload logo. Please try again.',
    })
  })
})

// ---------------------------------------------------------------- 5
describe('lib/actions/admin-company.ts', () => {
  it('site 5 — createAdminCompany persists a same-origin logo path', async () => {
    tableRows.companies = { id: NEW_COMPANY_ID }
    const { createAdminCompany } = await import('@/lib/actions/admin-company')

    const fd = new FormData()
    fd.set('companyName', 'Admin Co')
    fd.set('logo', pngFile())

    await createAdminCompany(fd)

    const payload = lastPayload('companies')
    expect(payload.logo_url).toBe(`/storage/logos/${NEW_COMPANY_ID}/logo.webp`)
    expectSameOrigin(payload.logo_url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 5 — an upload failure stays NON-FATAL and simply leaves logo_url unset', async () => {
    tableRows.companies = { id: NEW_COMPANY_ID }
    storageMocks.upload.mockRejectedValueOnce(new Error('nope'))
    const { createAdminCompany } = await import('@/lib/actions/admin-company')

    const fd = new FormData()
    fd.set('companyName', 'Admin Co')
    fd.set('logo', pngFile())

    await createAdminCompany(fd)

    // The only `companies` write is the original INSERT — no logo UPDATE ran.
    expect(recorded.filter((r) => r.table === 'companies' && r.op === 'update')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------- 6 + 7
describe('lib/actions/price-book.ts', () => {
  // buildStorageKey emits `{companyId}/{type}/{timestamp}-{sanitizedFilename}` —
  // the millisecond segment is REAL and a literal without it would never match.
  // Date.now() is pinned in beforeEach so the expectation can stay a literal.
  const EXPECTED_KEY = `${COMPANY_ID}/price-book/${FIXED_NOW}-${ITEM_ID}.webp`
  const EXPECTED_URL = `/storage/photos/${EXPECTED_KEY}`

  const form = {
    name: 'Mow lawn',
    unit: 'hr',
    unit_price: 50,
    folder_id: null,
    notes: null,
    image_url: null,
    pricing_type: 'fixed' as const,
  }

  it('site 6 — createPriceBookItem persists a same-origin photos path', async () => {
    tableRows.companies = { id: COMPANY_ID, currency_code: 'USD' }
    tableRows.company_price_book = { id: ITEM_ID }
    const { createPriceBookItem } = await import('@/lib/actions/price-book')

    await createPriceBookItem(form as never, pngFile('item.png'))

    const payload = lastPayload('company_price_book')
    expect(payload.image_url).toBe(EXPECTED_URL)
    expect(payload.image_url).toMatch(
      new RegExp(`^/storage/photos/${COMPANY_ID}/price-book/\\d+-${ITEM_ID}\\.webp$`),
    )
    expectSameOrigin(payload.image_url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('site 7 — updatePriceBookItem persists a same-origin photos path', async () => {
    tableRows.companies = { id: COMPANY_ID, currency_code: 'USD' }
    tableRows.company_price_book = { id: ITEM_ID }
    const { updatePriceBookItem } = await import('@/lib/actions/price-book')

    await updatePriceBookItem(ITEM_ID, form as never, pngFile('item.png'))

    const payload = lastPayload('company_price_book')
    expect(payload.image_url).toBe(EXPECTED_URL)
    expectSameOrigin(payload.image_url)
    expect(storageMocks.getPublicUrl).not.toHaveBeenCalled()
  })

  it('sites 6/7 — an upload failure stays NON-FATAL and leaves the URL unset', async () => {
    tableRows.companies = { id: COMPANY_ID, currency_code: 'USD' }
    tableRows.company_price_book = { id: ITEM_ID }
    storageMocks.upload.mockRejectedValueOnce(new Error('nope'))
    const { createPriceBookItem } = await import('@/lib/actions/price-book')

    const result = await createPriceBookItem(form as never, pngFile('item.png'))

    expect(result).toHaveProperty('data')
    expect(
      recorded.filter((r) => r.table === 'company_price_book' && r.op === 'update'),
    ).toHaveLength(0)
  })
})
