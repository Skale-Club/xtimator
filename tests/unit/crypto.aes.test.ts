import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { setTestEncryptionKey } from '../fixtures/test-encryption-key'

describe('lib/crypto/aes (ADMIN-04)', () => {
  beforeEach(() => {
    setTestEncryptionKey()
  })

  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY
  })

  it('encrypt() returns ciphertext, 12-byte IV, and 16-byte auth tag', async () => {
    const { encrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('sk-ant-01ABC')
    expect(Buffer.isBuffer(blob.ciphertext)).toBe(true)
    expect(Buffer.isBuffer(blob.iv)).toBe(true)
    expect(Buffer.isBuffer(blob.authTag)).toBe(true)
    expect(blob.iv.length).toBe(12)
    expect(blob.authTag.length).toBe(16)
  })

  it('encrypting the same plaintext twice yields different IVs and ciphertexts (IV randomness, R-02)', async () => {
    const { encrypt } = await import('@/lib/crypto/aes')
    const a = encrypt('same-plaintext-value')
    const b = encrypt('same-plaintext-value')
    expect(a.iv.equals(b.iv)).toBe(false)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false)
  })

  it('roundtrip: decrypt(encrypt(s)) === s for multiple inputs', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto/aes')
    const cases = [
      'sk-ant-01ABC',
      '',
      '🔑 unicode test',
      randomBytes(10_000).toString('hex'),
    ]
    for (const s of cases) {
      expect(decrypt(encrypt(s))).toBe(s)
    }
  })

  it('tampering with ciphertext makes decrypt throw (integrity check)', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('sensitive-api-key-123')
    const tampered = Buffer.from(blob.ciphertext)
    tampered[0] = tampered[0] ^ 0xff
    expect(() => decrypt({ ...blob, ciphertext: tampered })).toThrow()
  })

  it('tampering with auth tag makes decrypt throw', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('sensitive-api-key-123')
    const tampered = Buffer.from(blob.authTag)
    tampered[0] = tampered[0] ^ 0xff
    expect(() => decrypt({ ...blob, authTag: tampered })).toThrow()
  })

  it('invalid IV length (11 or 16 bytes) throws with /iv/i message', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('some plaintext')
    expect(() => decrypt({ ...blob, iv: randomBytes(11) })).toThrow(/iv/i)
    expect(() => decrypt({ ...blob, iv: randomBytes(16) })).toThrow(/iv/i)
  })

  it('invalid auth tag length (15 bytes) throws with /auth/i message', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto/aes')
    const blob = encrypt('some plaintext')
    expect(() => decrypt({ ...blob, authTag: randomBytes(15) })).toThrow(/auth/i)
  })

  it('invalid key length (16-byte base64) throws with "32 bytes" and "openssl rand -base64 32"', async () => {
    // 16-byte base64 — e.g. 16 zero bytes
    process.env.APP_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    const { encrypt } = await import('@/lib/crypto/aes')
    expect(() => encrypt('any')).toThrow(/32 bytes/)
    expect(() => encrypt('any')).toThrow(/openssl rand -base64 32/)
  })

  it('missing APP_ENCRYPTION_KEY throws "APP_ENCRYPTION_KEY is not set"', async () => {
    delete process.env.APP_ENCRYPTION_KEY
    const { encrypt } = await import('@/lib/crypto/aes')
    expect(() => encrypt('any')).toThrow('APP_ENCRYPTION_KEY is not set')
  })
})
