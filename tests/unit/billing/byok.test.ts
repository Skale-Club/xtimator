// tests/unit/billing/byok.test.ts
// Billing v2 BYOK: encrypted-key serialization round-trip + per-company key
// resolution (enabled → decrypted key; disabled/missing/malformed → null so the
// caller falls back to the PLATFORM key instead of breaking generation).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'

// A real 32-byte key so lib/crypto/aes works for real in the round-trip tests.
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString('base64')

const serviceRows: Record<string, unknown>[] = []
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: serviceRows[0] ?? null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }),
}))

import {
  serializeEncryptedKey,
  deserializeEncryptedKey,
  encryptByokKey,
  getByokOpenRouterKey,
} from '@/lib/billing/byok'
import { encrypt, decrypt } from '@/lib/crypto/aes'

beforeEach(() => {
  serviceRows.length = 0
})

describe('BYOK key serialization', () => {
  it('serialize → deserialize → decrypt round-trips the plaintext key', () => {
    const blob = encrypt('sk-or-test-1234567890abcdef')
    const text = serializeEncryptedKey(blob)
    // Stored form is JSON, never the plaintext.
    expect(text).not.toContain('sk-or-test')
    const back = deserializeEncryptedKey(text)
    expect(decrypt(back)).toBe('sk-or-test-1234567890abcdef')
  })

  it('encryptByokKey output never contains the plaintext', () => {
    const stored = encryptByokKey('sk-or-super-secret-key-000111')
    expect(stored).not.toContain('super-secret')
    expect(decrypt(deserializeEncryptedKey(stored))).toBe('sk-or-super-secret-key-000111')
  })

  it('deserializeEncryptedKey throws on malformed payloads', () => {
    expect(() => deserializeEncryptedKey('{"nope":true}')).toThrow()
  })
})

describe('getByokOpenRouterKey', () => {
  it('returns the decrypted key for an enabled company', async () => {
    serviceRows.push({
      byok_enabled: true,
      byok_openrouter_key: encryptByokKey('sk-or-company-own-key-xyz9'),
    })
    await expect(getByokOpenRouterKey('co-1')).resolves.toBe('sk-or-company-own-key-xyz9')
  })

  it('returns null when BYOK is disabled (even with a stored key)', async () => {
    serviceRows.push({
      byok_enabled: false,
      byok_openrouter_key: encryptByokKey('sk-or-should-not-be-used-1'),
    })
    await expect(getByokOpenRouterKey('co-1')).resolves.toBeNull()
  })

  it('returns null when enabled but no key is stored', async () => {
    serviceRows.push({ byok_enabled: true, byok_openrouter_key: null })
    await expect(getByokOpenRouterKey('co-1')).resolves.toBeNull()
  })

  it('fails OPEN to null (platform key) on a corrupted blob — never throws', async () => {
    serviceRows.push({ byok_enabled: true, byok_openrouter_key: 'not-json-at-all' })
    await expect(getByokOpenRouterKey('co-1')).resolves.toBeNull()
  })

  it('returns null for a missing company row', async () => {
    await expect(getByokOpenRouterKey('co-missing')).resolves.toBeNull()
  })
})
