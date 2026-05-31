// Phase 86: RFC 8414 OAuth 2.0 Authorization Server Metadata.
//
// Claude (Claude.ai / Desktop / Code) fetches this document during the custom-connector
// "Add MCP server" flow to discover the authorize / token / register endpoints.

import { NextResponse } from 'next/server'
import { resolveIssuer } from '@/lib/oauth/issuer'
import {
  SUPPORTED_CODE_CHALLENGE_METHODS,
  SUPPORTED_GRANT_TYPES,
  SUPPORTED_RESPONSE_TYPES,
  SUPPORTED_SCOPES,
  SUPPORTED_TOKEN_AUTH_METHODS,
} from '@/lib/oauth/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const issuer = await resolveIssuer()
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      response_types_supported: [...SUPPORTED_RESPONSE_TYPES],
      grant_types_supported: [...SUPPORTED_GRANT_TYPES],
      code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
      token_endpoint_auth_methods_supported: [...SUPPORTED_TOKEN_AUTH_METHODS],
      scopes_supported: [...SUPPORTED_SCOPES],
    },
    {
      headers: {
        // RFC 8414: metadata may be cached by clients; allow a short cache.
        'cache-control': 'public, max-age=300',
      },
    },
  )
}
