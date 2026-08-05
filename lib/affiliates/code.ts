/**
 * SEED-054 — referral code primitives. PURE module (no `server-only`, no DB, no
 * Stripe) so both the proxy (edge runtime) and unit tests can import it.
 *
 * The code is the entire public surface of the program: it travels in
 * `?ref=CODE`, gets stored in a cookie, and is later matched against
 * `affiliates.code`. Storing it NORMALIZED (lowercase, [a-z0-9] only) is what
 * makes the DB's UNIQUE constraint genuinely case-insensitive — `?ref=Joao` and
 * `?ref=JOAO` must resolve to the same affiliate, and neither may create a
 * second row.
 */

/** Matches the CHECK constraint on `affiliates.code` in the migration. */
export const AFFILIATE_CODE_MIN_LENGTH = 4
export const AFFILIATE_CODE_MAX_LENGTH = 32

/**
 * Generation alphabet. Deliberately EXCLUDES the ambiguous glyph set
 * `0/o`, `1/l/i` — a code gets read off a video, typed from a business card, or
 * dictated over the phone, and a mistyped code silently loses the attribution
 * (there is no error, just an unattributed signup). Digits 2-9 and consonant-
 * heavy letters only.
 */
const GENERATION_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Default generated length — 8 chars of a 31-symbol alphabet ≈ 8×10^11 space. */
const GENERATED_LENGTH = 8

/**
 * Normalize a raw code from an untrusted source (query string, cookie, admin
 * form) into the stored form: lowercase, stripped of everything outside
 * [a-z0-9], truncated to the max length.
 *
 * Returns `null` when nothing usable survives — callers MUST treat null as
 * "no referral" rather than querying with an empty string (which would be a
 * needless DB round-trip on every anonymous landing-page hit).
 */
export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, AFFILIATE_CODE_MAX_LENGTH)
  if (cleaned.length < AFFILIATE_CODE_MIN_LENGTH) return null
  return cleaned
}

/**
 * True when `code` is already in the exact stored form. Use this to validate a
 * value that claims to BE normalized (e.g. a DB row or an admin-supplied custom
 * code); use {@link normalizeAffiliateCode} to coerce untrusted input.
 */
export function isValidAffiliateCode(code: string): boolean {
  return new RegExp(
    `^[a-z0-9]{${AFFILIATE_CODE_MIN_LENGTH},${AFFILIATE_CODE_MAX_LENGTH}}$`
  ).test(code)
}

/**
 * Generate a random referral code. `randomInt` is injected so tests are
 * deterministic and so the caller picks the entropy source appropriate to its
 * runtime (`node:crypto` on the server, `crypto.getRandomValues` at the edge) —
 * this module stays pure and importable from both.
 *
 * Collisions are possible in principle: the caller inserts against the UNIQUE
 * constraint on `affiliates.code` and retries on 23505 rather than pre-checking
 * (check-then-insert would race).
 */
export function generateAffiliateCode(
  randomInt: (maxExclusive: number) => number,
  length: number = GENERATED_LENGTH
): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += GENERATION_ALPHABET[randomInt(GENERATION_ALPHABET.length)]
  }
  return out
}

/**
 * Suggest a code from a human name ("João da Silva" → "joaodasilva"), padded
 * with random characters when the name is too short to satisfy the minimum.
 * Purely a SUGGESTION — the caller still inserts against the UNIQUE constraint,
 * because two affiliates named the same person is entirely ordinary.
 */
export function suggestAffiliateCodeFromName(
  name: string,
  randomInt: (maxExclusive: number) => number
): string {
  const base = normalizeAffiliateCode(
    // Strip combining marks so "João" yields "joao" rather than losing the "ã"
    // entirely to the [^a-z0-9] filter inside normalizeAffiliateCode.
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  )
  if (base) return base
  return generateAffiliateCode(randomInt)
}
