// Phase 86: OAuth 2.0 token endpoint.
//
// POST /api/oauth/token
// Content-Type: application/x-www-form-urlencoded
//
// Grants supported:
//   grant_type=authorization_code  → code, redirect_uri, client_id, code_verifier
//   grant_type=refresh_token       → refresh_token, client_id
//
// Returns: { access_token, token_type: "Bearer", expires_in, refresh_token, scope }
//
// Per RFC 6749 §5.1 all responses are JSON, must include Cache-Control: no-store.

import { NextRequest, NextResponse } from 'next/server'
import { ACCESS_TOKEN_TTL_SECONDS, issueTokenPair, rotateRefreshToken } from '@/lib/oauth/tokens'
import { consumeAuthorizationCode } from '@/lib/oauth/codes'
import { findClientByClientId, isRegisteredRedirectUri } from '@/lib/oauth/clients'
import type { OAuthErrorCode, OAuthErrorResponse } from '@/lib/oauth/types'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
} as const

function errorResponse(error: OAuthErrorCode, description: string, status = 400) {
  const body: OAuthErrorResponse = { error, error_description: description }
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

async function parseBody(req: NextRequest): Promise<URLSearchParams | null> {
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text()
    return new URLSearchParams(text)
  }
  if (ct.includes('application/json')) {
    // Some MCP clients post JSON — accept it as well.
    try {
      const json = (await req.json()) as Record<string, unknown>
      const usp = new URLSearchParams()
      for (const [k, v] of Object.entries(json)) {
        if (typeof v === 'string') usp.set(k, v)
      }
      return usp
    } catch {
      return null
    }
  }
  // Fall back: try to read as URL-encoded text anyway.
  try {
    const text = await req.text()
    return new URLSearchParams(text)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const body = await parseBody(req)
  if (!body) return errorResponse('invalid_request', 'request body could not be parsed')

  const grantType = body.get('grant_type') ?? ''

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(body)
  }
  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(body)
  }
  return errorResponse('unsupported_grant_type', `grant_type "${grantType}" is not supported`)
}

async function handleAuthorizationCodeGrant(body: URLSearchParams) {
  const code = body.get('code') ?? ''
  const redirectUri = body.get('redirect_uri') ?? ''
  const clientId = body.get('client_id') ?? ''
  const codeVerifier = body.get('code_verifier') ?? ''

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return errorResponse(
      'invalid_request',
      'code, redirect_uri, client_id, and code_verifier are required',
    )
  }

  const client = await findClientByClientId(clientId)
  if (!client) return errorResponse('invalid_client', 'unknown client_id', 401)
  if (!isRegisteredRedirectUri(client, redirectUri)) {
    return errorResponse('invalid_grant', 'redirect_uri does not match the registered URI')
  }

  const consume = await consumeAuthorizationCode({ code, clientId, redirectUri, codeVerifier })
  if (!consume.ok) {
    if (consume.reason === 'demo_readonly') {
      return errorResponse('invalid_grant', 'authorization code is invalid or expired')
    }
    return errorResponse('invalid_grant', `authorization code rejected: ${consume.reason}`)
  }

  const row = consume.row
  const issued = await issueTokenPair({
    clientId: row.client_id,
    userId: row.user_id,
    companyId: row.company_id,
    scope: row.scope,
  })

  return NextResponse.json(
    {
      access_token: issued.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  )
}

async function handleRefreshTokenGrant(body: URLSearchParams) {
  const refreshToken = body.get('refresh_token') ?? ''
  const clientId = body.get('client_id') ?? ''

  if (!refreshToken || !clientId) {
    return errorResponse('invalid_request', 'refresh_token and client_id are required')
  }

  const client = await findClientByClientId(clientId)
  if (!client) return errorResponse('invalid_client', 'unknown client_id', 401)

  const pair = await rotateRefreshToken(refreshToken, clientId)
  if (!pair) return errorResponse('invalid_grant', 'refresh_token is invalid or expired')

  return NextResponse.json(
    {
      access_token: pair.accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: pair.refreshToken,
      scope: pair.scope,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  )
}
