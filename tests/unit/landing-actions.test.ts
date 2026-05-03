import { describe, it, vi } from 'vitest'
vi.mock('@/lib/auth/admin-context', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
vi.mock('@/lib/platform-config', () => ({ invalidatePlatformConfig: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
describe('saveLandingContent server action (LP-01)', () => {
  it.todo('saves heroHeadline, heroSubheadline, ctaLabel to platform_branding.landing_content JSONB')
  it.todo('saves howItWorksSteps array (3 items) correctly')
  it.todo('saves features array correctly')
  it.todo('calls invalidatePlatformConfig after successful save')
  it.todo('revalidates / path after save')
  it.todo('returns validation error for malformed input')
})
