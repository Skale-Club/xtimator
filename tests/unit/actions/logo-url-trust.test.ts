// @vitest-environment node
//
//
// SSRF guard: companies.logo_url is later fetched server-side by the PDF
// renderer, so a logo URL submitted from the browser must be stored only when it
// is empty, the already-stored value, or a proxy path under the caller's own
// prefix. Everything else must be ignored (settings) or dropped (onboarding).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Phase 3a: WhatsApp auto-link is best-effort and tested in whatsapp/sender-link.test.ts.
// Phase 3b: welcome template is best-effort and tested in whatsapp/welcome-template.test.ts.
vi.mock('@/lib/whatsapp/welcome-template', () => ({
  sendWelcomeTemplate: vi.fn().mockResolvedValue('sent'),
  sendWelcomeTemplateForUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/whatsapp/sender-link', () => ({
  ensureWhatsAppSenderForUser: vi.fn().mockResolvedValue({ status: 'linked' }),
  syncWhatsAppSenderAfterPhoneChange: vi.fn().mockResolvedValue(undefined),
  findOwnerCandidateByVerifiedPhone: vi.fn().mockResolvedValue(null),
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
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

function lastPayload(table: string, op: Recorded['op'] = 'update'): Record<string, unknown> | undefined {
  return recorded.filter((r) => r.table === table && r.op === op).at(-1)?.payload as
    | Record<string, unknown>
    | undefined
}

const STORED = `/storage/logos/${COMPANY_ID}/logo.webp`
const EVIL = 'https://169.254.169.254/latest/meta-data/'

beforeEach(() => {
  recorded.length = 0
  tableRows = {}
})

async function save(existingLogoUrl: string | null) {
  const { updateCompanySettings } = await import('@/lib/actions/settings')
  const fd = new FormData()
  fd.set('name', 'Acme')
  if (existingLogoUrl !== null) fd.set('existingLogoUrl', existingLogoUrl)
  return updateCompanySettings(fd)
}

describe('updateCompanySettings — existingLogoUrl is not trusted blindly', () => {
  it('keeps the stored logo when the browser sends an arbitrary external URL', async () => {
    tableRows.companies = { name: 'Old', logo_url: STORED }
    await save(EVIL)
    expect(lastPayload('companies')?.logo_url).toBe(STORED)
  })

  it('does not store an external URL when the company has no logo yet', async () => {
    tableRows.companies = { name: 'Old', logo_url: null }
    await save(EVIL)
    expect(lastPayload('companies')?.logo_url).toBeNull()
  })

  it('does not accept a proxy path that belongs to another company', async () => {
    tableRows.companies = { name: 'Old', logo_url: STORED }
    await save('/storage/logos/99999999-9999-4999-8999-999999999999/logo.webp')
    expect(lastPayload('companies')?.logo_url).toBe(STORED)
  })

  it('accepts the exact stored value (a legacy absolute URL survives a re-save)', async () => {
    const legacy = 'https://prmqgcrnpuvpzruyzvuv.supabase.co/storage/v1/object/public/logos/co/logo.webp'
    tableRows.companies = { name: 'Old', logo_url: legacy }
    await save(legacy)
    expect(lastPayload('companies')?.logo_url).toBe(legacy)
  })

  it('accepts a proxy path under this company', async () => {
    tableRows.companies = { name: 'Old', logo_url: null }
    await save(STORED)
    expect(lastPayload('companies')?.logo_url).toBe(STORED)
  })

  it('an empty value removes the logo', async () => {
    tableRows.companies = { name: 'Old', logo_url: STORED }
    await save('')
    expect(lastPayload('companies')?.logo_url).toBeNull()
  })
})

describe('createOrUpdateCompany — onboarding logoUrl is not trusted blindly', () => {
  async function submit(logoUrl: string) {
    const { createOrUpdateCompany } = await import('@/lib/actions/company')
    return createOrUpdateCompany({ companyName: 'Acme', logoUrl } as never)
  }

  it('leaves the stored logo untouched when an external URL is submitted', async () => {
    tableRows.companies = { id: COMPANY_ID }
    await submit(EVIL)
    const payload = lastPayload('companies')
    expect(payload).toBeDefined()
    expect(payload).not.toHaveProperty('logo_url')
  })

  it('accepts a proxy path under the caller user prefix', async () => {
    tableRows.companies = { id: COMPANY_ID }
    const own = `/storage/logos/${USER_ID}/onboarding/d/x.webp`
    await submit(own)
    expect(lastPayload('companies')?.logo_url).toBe(own)
  })
})
