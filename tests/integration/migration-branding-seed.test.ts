/**
 * Integration test (ADMIN-08): platform_branding seeded with app_name='Xtimator'
 */
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE)
const d = hasEnv ? describe : describe.skip

d('platform_branding singleton seed (ADMIN-08)', () => {
  it("has row id=1 with app_name='Xtimator'", async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin
      .from('platform_branding')
      .select('id, app_name')
      .eq('id', 1)
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.id).toBe(1)
    expect(data!.app_name).toBe('Xtimator')
  })
})
