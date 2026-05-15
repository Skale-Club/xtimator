/**
 * Integration test (ADMIN-09): platform-brand Storage bucket RLS
 *
 * - anon client upload → denied by RLS (no auth.uid() → exists() returns false)
 * - service-role client upload → succeeds (bypasses RLS)
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createStorage } from '@/lib/storage'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE && ANON_KEY)
const d = hasEnv ? describe : describe.skip

// 1x1 transparent PNG (smallest valid PNG) — used for upload body
const PNG_1x1 = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C62000000000500010D0A2DB40000000049454E44AE426082',
  'hex',
)

const run = Date.now()
const TEST_PATH = `test-${run}.png`

d('platform-brand Storage bucket RLS (ADMIN-09)', () => {
  const serviceClient = createClient(SUPABASE_URL!, SERVICE_ROLE!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  afterAll(async () => {
    // Cleanup: remove the test file if it landed
    try {
      await createStorage(serviceClient).delete('platform-brand', TEST_PATH)
    } catch {
      // ignore
    }
  }, 10_000)

  it('rejects upload from anon client (no admin session)', async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error } = await anon.storage
      .from('platform-brand')
      .upload(`anon-${run}.png`, PNG_1x1, { contentType: 'image/png', upsert: false })

    expect(error).not.toBeNull()
    // Supabase returns an error whose message typically references RLS / new row
    expect(error!.message).toMatch(/row-level security|new row|not authorized|policy|Unauthorized/i)
  })

  it('allows upload from service-role client (RLS bypass)', async () => {
    const { error } = await serviceClient.storage
      .from('platform-brand')
      .upload(TEST_PATH, PNG_1x1, { contentType: 'image/png', upsert: true })

    expect(error).toBeNull()
  })
})
