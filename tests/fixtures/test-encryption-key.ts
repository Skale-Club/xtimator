// Deterministic test key (NOT a real secret — safe to commit).
// Produced via: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// 44-char base64 string decoding to exactly 32 bytes (256 bits).
export const TEST_ENCRYPTION_KEY = 'ef0exbvvYVla+w6WJDY9k3H0s8pO5pAbGnTd1g7rGpc='

export function setTestEncryptionKey(): void {
  process.env.APP_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY
}
