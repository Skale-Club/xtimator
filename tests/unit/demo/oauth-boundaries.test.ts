import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const DEMO_COMPANY_ID = '0000de00-0000-0000-0000-000000000001'
const DEMO_EMAIL = 'demo@example.com'

const mocks = vi.hoisted(() => ({
  getAuthClaims: vi.fn(),
  getActiveCompanyId: vi.fn(),
  assertWritable: vi.fn(),
  assertCompanyWritable: vi.fn(),
  requireServiceClient: vi.fn(),
  redirect: vi.fn(),
  insertEffect: vi.fn(),
  updateEffect: vi.fn(),
}))

vi.mock('@/lib/queries/auth', () => ({
  getAuthClaims: (...args: unknown[]) => mocks.getAuthClaims(...args),
}))

vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => mocks.getActiveCompanyId(...args),
}))

vi.mock('@/lib/demo/guard', () => ({
  DEMO_READONLY_MESSAGE:
    'This is a read-only demo. Create a free account to make changes.',
  assertWritable: (...args: unknown[]) => mocks.assertWritable(...args),
  assertCompanyWritable: (...args: unknown[]) =>
    mocks.assertCompanyWritable(...args),
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: (...args: unknown[]) =>
    mocks.requireServiceClient(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}))

type StoredRow = Record<string, unknown>

let rows: Record<string, StoredRow[]>
let ambientDemo = false

function matches(row: StoredRow, filters: Array<[string, unknown]>): boolean {
  return filters.every(([column, value]) => row[column] === value)
}

function makeInsertResult(row: StoredRow) {
  const result = {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: row, error: null })),
    })),
    then<TResult1 = { error: null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { error: null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ error: null }).then(onfulfilled, onrejected)
    },
  }
  return result
}

function makeTableQuery(table: string) {
  return {
    insert: (value: StoredRow) => {
      const row =
        table === 'oauth_clients'
          ? {
              id: `row-${rows[table].length + 1}`,
              created_at: new Date().toISOString(),
              ...value,
            }
          : { ...value }
      rows[table].push(row)
      mocks.insertEffect(table, row)
      return makeInsertResult(row)
    },
    select: (_columns: string) => {
      const filters: Array<[string, unknown]> = []
      const selection = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return selection
        },
        maybeSingle: async () => ({
          data: rows[table].find((row) => matches(row, filters)) ?? null,
          error: null,
        }),
      }
      return selection
    },
    update: (patch: StoredRow) => {
      const filters: Array<[string, unknown]> = []
      let applied = false
      const apply = () => {
        if (applied) return
        applied = true
        mocks.updateEffect(table, patch)
        for (const row of rows[table]) {
          if (matches(row, filters)) Object.assign(row, patch)
        }
      }
      const update = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return update
        },
        is: async (column: string, value: unknown) => {
          filters.push([column, value])
          apply()
          return { error: null }
        },
        then<TResult1 = { error: null }, TResult2 = never>(
          onfulfilled?:
            | ((value: { error: null }) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          apply()
          return Promise.resolve({ error: null }).then(onfulfilled, onrejected)
        },
      }
      return update
    },
  }
}

function seedClient() {
  rows.oauth_clients.push({
    id: 'client-row',
    client_id: 'client-1',
    client_name: 'Test Client',
    redirect_uris: ['https://client.example/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    created_at: new Date().toISOString(),
  })
}

function authorizeForm() {
  const form = new FormData()
  form.set('decision', 'authorize')
  form.set('client_id', 'client-1')
  form.set('redirect_uri', 'https://client.example/callback')
  form.set('state', 'state-1')
  form.set('code_challenge', 'challenge')
  form.set('code_challenge_method', 'S256')
  form.set('scope', 'mcp:read mcp:write')
  return form
}

function formRequest(values: Record<string, string>) {
  return new Request('http://localhost/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  })
}

function registrationRequest() {
  return new Request('http://localhost/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/callback/test'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  ambientDemo = false
  rows = {
    oauth_clients: [],
    oauth_authorization_codes: [],
    oauth_access_tokens: [],
    oauth_refresh_tokens: [],
  }
  seedClient()

  mocks.getAuthClaims.mockResolvedValue({
    sub: 'normal-user',
    email: 'owner@example.com',
  })
  mocks.getActiveCompanyId.mockResolvedValue('normal-company')
  mocks.assertWritable.mockImplementation(
    async (context?: { email?: string | null; companyId?: string | null }) => {
      const denied =
        ambientDemo ||
        context?.email?.toLowerCase() === DEMO_EMAIL ||
        context?.companyId === DEMO_COMPANY_ID
      return denied
        ? {
            error:
              'This is a read-only demo. Create a free account to make changes.',
          }
        : null
    },
  )
  mocks.assertCompanyWritable.mockImplementation(
    async (companyId?: string | null) =>
      companyId === DEMO_COMPANY_ID
        ? {
            error:
              'This is a read-only demo. Create a free account to make changes.',
          }
        : null,
  )
  mocks.requireServiceClient.mockReturnValue({
    from: vi.fn((table: string) => makeTableQuery(table)),
  })
  mocks.redirect.mockImplementation((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`)
  })
})

describe('SAFE-01: OAuth authorization and registration denial', () => {
  for (const signal of ['dedicated demo user', 'deterministic demo company']) {
    it(`denies authorization before issuing a code for ${signal}`, async () => {
      if (signal === 'dedicated demo user') {
        mocks.getAuthClaims.mockResolvedValue({
          sub: 'demo-user',
          email: DEMO_EMAIL,
        })
      } else {
        mocks.getActiveCompanyId.mockResolvedValue(DEMO_COMPANY_ID)
      }

      const { handleAuthorize } = await import('@/app/oauth/authorize/actions')

      await expect(handleAuthorize(authorizeForm())).rejects.toThrow(
        /error=access_denied/,
      )
      expect(rows.oauth_authorization_codes).toHaveLength(0)
      expect(mocks.assertWritable).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId:
            signal === 'deterministic demo company'
              ? DEMO_COMPANY_ID
              : 'normal-company',
        }),
      )
    })

    it(`denies dynamic client registration before persistence for ${signal}`, async () => {
      ambientDemo = true
      const { POST } = await import('@/app/oauth/register/route')

      const response = await POST(registrationRequest() as never)

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        error: 'demo_readonly',
      })
      expect(rows.oauth_clients).toHaveLength(1)
    })
  }

  it('preserves normal authorization and registration behavior', async () => {
    const [{ handleAuthorize }, registerRoute] = await Promise.all([
      import('@/app/oauth/authorize/actions'),
      import('@/app/oauth/register/route'),
    ])

    await expect(handleAuthorize(authorizeForm())).rejects.toThrow(/[?&]code=/)
    expect(rows.oauth_authorization_codes).toHaveLength(1)

    const response = await registerRoute.POST(registrationRequest() as never)
    expect(response.status).toBe(201)
    expect(rows.oauth_clients).toHaveLength(2)
  })
})

describe('SAFE-01/SAFE-02: OAuth code and token capability denial', () => {
  it('rejects direct authorization-code issuance for a demo company before service access', async () => {
    const { issueAuthorizationCode } = await import('@/lib/oauth/codes')
    mocks.requireServiceClient.mockClear()

    await expect(
      issueAuthorizationCode({
        clientId: 'client-1',
        userId: 'demo-user',
        companyId: DEMO_COMPANY_ID,
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        redirectUri: 'https://client.example/callback',
        scope: 'mcp:read',
      }),
    ).rejects.toThrow(/read-only demo/i)

    expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    expect(rows.oauth_authorization_codes).toHaveLength(0)
  })

  it('rejects direct token issuance for either demo signal before service access', async () => {
    const { issueTokenPair } = await import('@/lib/oauth/tokens')

    for (const input of [
      {
        clientId: 'client-1',
        userId: 'demo-user',
        userEmail: DEMO_EMAIL,
        companyId: 'normal-company',
        scope: 'mcp:read',
      },
      {
        clientId: 'client-1',
        userId: 'normal-user',
        userEmail: 'owner@example.com',
        companyId: DEMO_COMPANY_ID,
        scope: 'mcp:read',
      },
    ]) {
      mocks.requireServiceClient.mockClear()
      await expect(issueTokenPair(input)).rejects.toThrow(/read-only demo/i)
      expect(mocks.requireServiceClient).not.toHaveBeenCalled()
    }

    expect(rows.oauth_access_tokens).toHaveLength(0)
    expect(rows.oauth_refresh_tokens).toHaveLength(0)
  })

  it('rejects stale demo-company authorization-code exchange without consuming or minting', async () => {
    const verifier = 'test-verifier-with-enough-entropy-0123456789abcdef'
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url')
    const code = 'stale-demo-code'
    rows.oauth_authorization_codes.push({
      code_hash: createHash('sha256').update(code).digest('hex'),
      client_id: 'client-1',
      user_id: 'demo-user',
      company_id: DEMO_COMPANY_ID,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: 'https://client.example/callback',
      scope: 'mcp:read mcp:write',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      consumed_at: null,
    })
    const { POST } = await import('@/app/oauth/token/route')

    const response = await POST(
      formRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://client.example/callback',
        client_id: 'client-1',
        code_verifier: verifier,
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })
    expect(rows.oauth_authorization_codes[0]?.consumed_at).toBeNull()
    expect(mocks.updateEffect).not.toHaveBeenCalled()
    expect(rows.oauth_access_tokens).toHaveLength(0)
    expect(rows.oauth_refresh_tokens).toHaveLength(0)
  })

  it('rejects stale demo-company refresh without minting or revoking', async () => {
    const refreshToken = 'stale-demo-refresh'
    rows.oauth_refresh_tokens.push({
      token_hash: createHash('sha256').update(refreshToken).digest('hex'),
      client_id: 'client-1',
      user_id: 'demo-user',
      company_id: DEMO_COMPANY_ID,
      scope: 'mcp:read mcp:write',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    })
    const { POST } = await import('@/app/oauth/token/route')

    const response = await POST(
      formRequest({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: 'client-1',
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    })
    expect(mocks.insertEffect).not.toHaveBeenCalled()
    expect(mocks.updateEffect).not.toHaveBeenCalled()
    expect(rows.oauth_refresh_tokens[0]?.revoked_at).toBeNull()
  })

  it('rejects stale demo-company bearer tokens without consulting browser context', async () => {
    const accessToken = 'stale-demo-access'
    rows.oauth_access_tokens.push({
      token_hash: createHash('sha256').update(accessToken).digest('hex'),
      client_id: 'client-1',
      user_id: 'demo-user',
      company_id: DEMO_COMPANY_ID,
      scope: 'mcp:read mcp:write',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    })
    const { resolveAccessToken } = await import('@/lib/oauth/tokens')

    await expect(resolveAccessToken(accessToken)).resolves.toBeNull()
    expect(mocks.assertCompanyWritable).toHaveBeenCalledWith(DEMO_COMPANY_ID)
    expect(mocks.assertWritable).not.toHaveBeenCalled()
  })

  it('preserves normal code exchange, refresh rotation, and bearer resolution', async () => {
    const { issueAuthorizationCode } = await import('@/lib/oauth/codes')
    const { POST } = await import('@/app/oauth/token/route')
    const { resolveAccessToken } = await import('@/lib/oauth/tokens')
    const verifier = 'normal-verifier-with-enough-entropy-0123456789abcdef'
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url')
    const issuedCode = await issueAuthorizationCode({
      clientId: 'client-1',
      userId: 'normal-user',
      companyId: 'normal-company',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      redirectUri: 'https://client.example/callback',
      scope: 'mcp:read mcp:write',
    })

    const exchange = await POST(
      formRequest({
        grant_type: 'authorization_code',
        code: issuedCode.code,
        redirect_uri: 'https://client.example/callback',
        client_id: 'client-1',
        code_verifier: verifier,
      }) as never,
    )
    expect(exchange.status).toBe(200)
    const exchanged = (await exchange.json()) as {
      access_token: string
      refresh_token: string
    }
    await expect(resolveAccessToken(exchanged.access_token)).resolves.toMatchObject({
      company_id: 'normal-company',
    })

    const refresh = await POST(
      formRequest({
        grant_type: 'refresh_token',
        refresh_token: exchanged.refresh_token,
        client_id: 'client-1',
      }) as never,
    )
    expect(refresh.status).toBe(200)
    const rotated = (await refresh.json()) as { access_token: string }
    expect(rotated.access_token).not.toBe(exchanged.access_token)
  })
})
