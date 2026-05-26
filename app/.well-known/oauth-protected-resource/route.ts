// Phase 86: RFC 9728 OAuth 2.0 Protected Resource Metadata.
//
// Tells Claude which authorization server protects the MCP endpoint and which
// bearer-token mechanisms are supported.

import { NextResponse } from 'next/server'
import { resolveIssuer } from '@/lib/oauth/issuer'
import { SUPPORTED_SCOPES } from '@/lib/oauth/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const issuer = await resolveIssuer()
  return NextResponse.json(
    {
      // Phase 87 will live-ship /api/mcp; the metadata can advertise it now.
      resource: `${issuer}/api/mcp`,
      authorization_servers: [issuer],
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ['header'],
    },
    {
      headers: { 'cache-control': 'public, max-age=300' },
    },
  )
}
