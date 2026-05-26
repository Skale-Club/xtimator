// Phase 86: RFC 7591 Dynamic Client Registration endpoint.
//
// POST /api/oauth/register
// Body (JSON):
//   {
//     "client_name": "Claude",
//     "redirect_uris": ["https://claude.ai/api/mcp/callback/..."],
//     "grant_types": ["authorization_code", "refresh_token"],
//     "response_types": ["code"],
//     "token_endpoint_auth_method": "none"
//   }
//
// Response (201):
//   { client_id, client_name, redirect_uris, grant_types, response_types,
//     token_endpoint_auth_method, client_id_issued_at }

import { NextRequest, NextResponse } from 'next/server'
import { registerClient } from '@/lib/oauth/clients'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'request body must be valid JSON' },
      { status: 400 },
    )
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'request body must be a JSON object' },
      { status: 400 },
    )
  }

  const result = await registerClient(body as Record<string, unknown>)
  if (!result.ok) {
    const status = result.error === 'server_error' ? 500 : 400
    return NextResponse.json(
      { error: result.error, error_description: result.error_description },
      { status },
    )
  }

  const client = result.client
  return NextResponse.json(
    {
      client_id: client.client_id,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: client.response_types,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
    },
    { status: 201 },
  )
}
