// tests/unit/oauth-token-issuance.test.ts
// Phase 86: issue, hash, resolve, rotate access + refresh tokens with mocked Supabase.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

// ---------- mocks ----------
const insertedRows: Record<string, Array<Record<string, unknown>>> = {
  oauth_access_tokens: [],
  oauth_refresh_tokens: [],
}

vi.mock('@/lib/supabase/service', () => {
  const fromMock = (table: string) => ({
    insert: vi.fn((row: Record<string, unknown>) => {
      insertedRows[table] ??= []
      insertedRows[table].push(row)
      return Promise.resolve({ error: null })
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      return {
        eq: vi.fn((_col: string, val: string) => {
          const list = insertedRows[table] ?? []
          for (const row of list) {
            if (row.token_hash === val) Object.assign(row, patch)
          }
          return Promise.resolve({ error: null })
        }),
      }
    }),
    select: vi.fn(() => ({
      eq: vi.fn((_col: string, val: string) => ({
        maybeSingle: vi.fn(() => {
          const list = insertedRows[table] ?? []
          const found = list.find((r) => r.token_hash === val)
          return Promise.resolve({ data: found ?? null, error: null })
        }),
      })),
    })),
  })
  return {
    requireServiceClient: () => ({
      from: vi.fn(fromMock),
    }),
  }
})

import {
  generateOpaqueToken,
  hashToken,
  issueTokenPair,
  resolveRefreshToken,
  rotateRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/lib/oauth/tokens'

beforeEach(() => {
  for (const k of Object.keys(insertedRows)) insertedRows[k] = []
})

describe('generateOpaqueToken', () => {
  it('produces a 64-char hex string (32 bytes)', () => {
    const t = generateOpaqueToken()
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not collide across many generations', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(generateOpaqueToken())
    expect(set.size).toBe(1000)
  })
})

describe('hashToken', () => {
  it('returns the sha256 hex digest of the input', () => {
    const expected = createHash('sha256').update('hello', 'utf8').digest('hex')
    expect(hashToken('hello')).toBe(expected)
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
  })
})

describe('issueTokenPair', () => {
  it('persists both access and refresh tokens as hashes (never plaintext)', async () => {
    const pair = await issueTokenPair({
      clientId: 'client-1',
      userId: 'user-1',
      companyId: 'company-1',
      scope: 'mcp:read mcp:write',
    })

    expect(pair.accessToken).toMatch(/^[0-9a-f]{64}$/)
    expect(pair.refreshToken).toMatch(/^[0-9a-f]{64}$/)

    const accessRow = insertedRows.oauth_access_tokens![0]!
    const refreshRow = insertedRows.oauth_refresh_tokens![0]!

    // PLAINTEXT TOKENS MUST NEVER APPEAR IN THE PERSISTED ROW.
    expect(JSON.stringify(accessRow)).not.toContain(pair.accessToken)
    expect(JSON.stringify(refreshRow)).not.toContain(pair.refreshToken)

    // The stored hash must equal sha256(plaintext).
    expect(accessRow.token_hash).toBe(hashToken(pair.accessToken))
    expect(refreshRow.token_hash).toBe(hashToken(pair.refreshToken))

    expect(accessRow.client_id).toBe('client-1')
    expect(accessRow.user_id).toBe('user-1')
    expect(accessRow.company_id).toBe('company-1')
    expect(accessRow.scope).toBe('mcp:read mcp:write')
  })

  it('sets expires_at according to the TTL constants', async () => {
    const before = Date.now()
    const pair = await issueTokenPair({
      clientId: 'c',
      userId: 'u',
      companyId: 'co',
      scope: 'mcp:read',
    })
    const after = Date.now()

    const accessTtlMs = ACCESS_TOKEN_TTL_SECONDS * 1000
    const refreshTtlMs = REFRESH_TOKEN_TTL_SECONDS * 1000

    expect(pair.accessTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + accessTtlMs - 50)
    expect(pair.accessTokenExpiresAt.getTime()).toBeLessThanOrEqual(after + accessTtlMs + 50)
    expect(pair.refreshTokenExpiresAt.getTime()).toBeGreaterThanOrEqual(before + refreshTtlMs - 50)
    expect(pair.refreshTokenExpiresAt.getTime()).toBeLessThanOrEqual(after + refreshTtlMs + 50)
  })
})

describe('resolveRefreshToken', () => {
  it('returns the (client, user, company, scope) for a valid token', async () => {
    const pair = await issueTokenPair({
      clientId: 'c1',
      userId: 'u1',
      companyId: 'co1',
      scope: 'mcp:read',
    })
    const resolved = await resolveRefreshToken(pair.refreshToken)
    expect(resolved).not.toBeNull()
    expect(resolved!.client_id).toBe('c1')
    expect(resolved!.user_id).toBe('u1')
    expect(resolved!.company_id).toBe('co1')
    expect(resolved!.scope).toBe('mcp:read')
  })

  it('returns null for an unknown token', async () => {
    const resolved = await resolveRefreshToken('a'.repeat(64))
    expect(resolved).toBeNull()
  })

  it('returns null for a revoked token', async () => {
    const pair = await issueTokenPair({
      clientId: 'c',
      userId: 'u',
      companyId: 'co',
      scope: 'mcp:read',
    })
    insertedRows.oauth_refresh_tokens![0]!.revoked_at = new Date().toISOString()
    const resolved = await resolveRefreshToken(pair.refreshToken)
    expect(resolved).toBeNull()
  })

  it('returns null for an expired token', async () => {
    const pair = await issueTokenPair({
      clientId: 'c',
      userId: 'u',
      companyId: 'co',
      scope: 'mcp:read',
    })
    insertedRows.oauth_refresh_tokens![0]!.expires_at = new Date(Date.now() - 1000).toISOString()
    const resolved = await resolveRefreshToken(pair.refreshToken)
    expect(resolved).toBeNull()
  })
})

describe('rotateRefreshToken', () => {
  it('issues a new pair and revokes the old refresh token', async () => {
    const original = await issueTokenPair({
      clientId: 'c',
      userId: 'u',
      companyId: 'co',
      scope: 'mcp:read mcp:write',
    })

    const rotated = await rotateRefreshToken(original.refreshToken, 'c')
    expect(rotated).not.toBeNull()
    expect(rotated!.accessToken).not.toBe(original.accessToken)
    expect(rotated!.refreshToken).not.toBe(original.refreshToken)
    expect(rotated!.scope).toBe('mcp:read mcp:write')

    // Old refresh token must now resolve to null (revoked).
    const reResolveOld = await resolveRefreshToken(original.refreshToken)
    expect(reResolveOld).toBeNull()

    // New refresh token still works.
    const reResolveNew = await resolveRefreshToken(rotated!.refreshToken)
    expect(reResolveNew).not.toBeNull()
  })

  it('rejects rotation when client_id does not match', async () => {
    const pair = await issueTokenPair({
      clientId: 'real-client',
      userId: 'u',
      companyId: 'co',
      scope: 'mcp:read',
    })
    const rotated = await rotateRefreshToken(pair.refreshToken, 'attacker-client')
    expect(rotated).toBeNull()
  })

  it('rejects rotation of an unknown refresh token', async () => {
    const rotated = await rotateRefreshToken('b'.repeat(64), 'any-client')
    expect(rotated).toBeNull()
  })
})
