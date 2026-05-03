import { describe, it, vi } from 'vitest'
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
describe('admin dashboard stats (DASH-01)', () => {
  it.todo('returns totalCompanies count from companies table')
  it.todo('returns totalUsers from get_platform_user_count RPC')
  it.todo('returns estimatesLast30d count for estimates within 30 days')
  it.todo('returns zeros when DB errors occur')
})
