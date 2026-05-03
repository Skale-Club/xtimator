import { describe, it, vi } from 'vitest'
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ invalidatePlatformConfig: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
describe('saveSeo server action (SEO-01)', () => {
  it.todo('saves site_title, meta_description, og_image_url, canonical_base_url to platform_branding id=1')
  it.todo('calls invalidatePlatformConfig after successful save')
  it.todo('revalidates / layout path after save')
  it.todo('returns ok:false when requireAdmin throws')
  it.todo('returns ok:false when DB upsert fails')
})
