import 'server-only'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGO = 'aes-256-gcm' as const
const IV_LEN = 12
const TAG_LEN = 16

function loadKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must decode to 32 bytes (256 bits); got ${key.length}. Generate with: openssl rand -base64 32`
    )
  }
  return key
}

export type EncryptedBlob = {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

export function encrypt(plaintext: string): EncryptedBlob {
  const key = loadKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN })
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { ciphertext, iv, authTag }
}

export function decrypt(blob: EncryptedBlob): string {
  const key = loadKey()
  if (blob.iv.length !== IV_LEN) throw new Error('invalid iv length')
  if (blob.authTag.length !== TAG_LEN) throw new Error('invalid auth tag length')
  const decipher = createDecipheriv(ALGO, key, blob.iv, { authTagLength: TAG_LEN })
  decipher.setAuthTag(blob.authTag)
  const plaintext = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
