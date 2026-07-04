import 'server-only'
/**
 * lib/billing/byok.ts — Billing v2 BYOK (bring-your-own-key) helpers.
 *
 * A BYOK company (companies.byok_enabled, toggled ONLY by super-admin — the
 * hidden "street-sale" plan) runs its AI calls on its OWN OpenRouter key:
 *   - key usage: getAIProvider() resolves the override via getByokOpenRouterKey()
 *   - billing:   checkCredits / recordCreditDebit bypass BYOK companies centrally
 *
 * The key is stored AES-256-GCM encrypted (lib/crypto/aes) in the TEXT column
 * companies.byok_openrouter_key as compact JSON of base64 parts. NEVER stored or
 * logged in plaintext; only the last 4 chars are kept for the admin UI hint.
 */
import { encrypt, decrypt, type EncryptedBlob } from '@/lib/crypto/aes'
import { requireServiceClient } from '@/lib/supabase/service'

/** Serialize an EncryptedBlob for the TEXT column (compact base64 JSON). */
export function serializeEncryptedKey(blob: EncryptedBlob): string {
  return JSON.stringify({
    ciphertext: blob.ciphertext.toString('base64'),
    iv: blob.iv.toString('base64'),
    authTag: blob.authTag.toString('base64'),
  })
}

/** Inverse of serializeEncryptedKey. Throws on malformed input. */
export function deserializeEncryptedKey(text: string): EncryptedBlob {
  const parsed = JSON.parse(text) as {
    ciphertext?: string
    iv?: string
    authTag?: string
  }
  if (!parsed.ciphertext || !parsed.iv || !parsed.authTag) {
    throw new Error('Malformed encrypted BYOK key payload')
  }
  return {
    ciphertext: Buffer.from(parsed.ciphertext, 'base64'),
    iv: Buffer.from(parsed.iv, 'base64'),
    authTag: Buffer.from(parsed.authTag, 'base64'),
  }
}

/** Encrypt a plaintext OpenRouter key for storage. */
export function encryptByokKey(plaintextKey: string): string {
  return serializeEncryptedKey(encrypt(plaintextKey))
}

/**
 * Resolve a company's decrypted BYOK OpenRouter key, or null when BYOK is off,
 * no key is stored, or decryption fails (fail-open to the PLATFORM key so a
 * bad blob degrades to normal billed behavior instead of breaking generation —
 * the credit bypass keys off byok_enabled, so a broken key is surfaced by the
 * owner's calls being billed, which the admin can see and fix).
 */
export async function getByokOpenRouterKey(companyId: string): Promise<string | null> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('companies')
      .select('byok_enabled, byok_openrouter_key')
      .eq('id', companyId)
      .maybeSingle()
    const row = data as {
      byok_enabled?: boolean | null
      byok_openrouter_key?: string | null
    } | null
    if (!row?.byok_enabled || !row.byok_openrouter_key) return null
    return decrypt(deserializeEncryptedKey(row.byok_openrouter_key))
  } catch (err) {
    console.warn('[byok] key resolution failed — falling back to platform key:', err)
    return null
  }
}
