/**
 * Integration test (ADMIN-04): platform_integrations encrypt → persist → decrypt roundtrip.
 *
 * Strategy:
 *   1. Encrypt a known plaintext with lib/crypto/aes.
 *   2. Upsert the resulting ciphertext/iv/auth_tag bytes into platform_integrations
 *      via the service-role client (bypasses RLS).
 *   3. Invalidate the platform-config cache, then call getIntegrationKey('resend')
 *      and assert it returns the original plaintext.
 *
 * Teardown DELETEs the test row from platform_integrations and re-invalidates the cache.
 *
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing
 * (per project convention; integration suite runs against the real dev Supabase project).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { setTestEncryptionKey } from '../fixtures/test-encryption-key'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

const hasEnv = Boolean(SUPABASE_URL && SERVICE_ROLE)
const d = hasEnv ? describe : describe.skip

const TEST_PLAINTEXT = 'sk-test-roundtrip-' + Date.now()
// Reuse 'resend' provider slot — we DELETE in teardown so we don't trample real config.
// Tests assume a clean dev DB or a tolerable transient overwrite; skip if you have a
// production-grade resend key in this DB.
const PROVIDER = 'resend' as const

d('platform_integrations encrypt → persist → getIntegrationKey roundtrip (ADMIN-04)', () => {
  let admin: SupabaseClient
  let originalRow: { ciphertext: unknown; iv: unknown; auth_tag: unknown; updated_by: string | null; updated_at: string } | null = null

  beforeAll(async () => {
    setTestEncryptionKey()
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
    // Snapshot any pre-existing row so we can restore in teardown.
    const { data } = await admin
      .from('platform_integrations')
      .select('ciphertext, iv, auth_tag, updated_by, updated_at')
      .eq('provider', PROVIDER)
      .maybeSingle()
    originalRow = data
  })

  afterAll(async () => {
    if (!hasEnv) return
    // Restore the original row (if any) or delete the test row.
    if (originalRow) {
      await admin
        .from('platform_integrations')
        .upsert(
          {
            provider: PROVIDER,
            ciphertext: originalRow.ciphertext,
            iv: originalRow.iv,
            auth_tag: originalRow.auth_tag,
            updated_by: originalRow.updated_by,
            updated_at: originalRow.updated_at,
          },
          { onConflict: 'provider' }
        )
    } else {
      await admin.from('platform_integrations').delete().eq('provider', PROVIDER)
    }
    const { invalidatePlatformConfig } = await import('@/lib/platform-config')
    invalidatePlatformConfig()
  })

  it('persists ciphertext that decrypts back to the original plaintext', async () => {
    const { encrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt(TEST_PLAINTEXT)

    const { error } = await admin.from('platform_integrations').upsert(
      {
        provider: PROVIDER,
        ciphertext: '\\x' + blob.ciphertext.toString('hex'),
        iv: '\\x' + blob.iv.toString('hex'),
        auth_tag: '\\x' + blob.authTag.toString('hex'),
        updated_at: new Date().toISOString(),
        updated_by: null,
      },
      { onConflict: 'provider' }
    )
    expect(error).toBeNull()

    const { invalidatePlatformConfig, getIntegrationKey } = await import(
      '@/lib/platform-config'
    )
    invalidatePlatformConfig()

    const decrypted = await getIntegrationKey(PROVIDER)
    expect(decrypted).toBe(TEST_PLAINTEXT)
  })
})
