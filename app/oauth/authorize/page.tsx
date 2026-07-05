// Phase 86: OAuth 2.0 authorization endpoint — consent UI (server component).
//
// GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code
//                   &state=...&code_challenge=...&code_challenge_method=S256
//                   &scope=mcp:read mcp:write
//
// Flow:
//   * Validate client_id + redirect_uri exact match against oauth_clients.
//   * If the user is not signed in → redirect to /?auth=login&next=<this-url>.
//   * Render a consent screen showing the client name, active company, and requested scopes.
//   * Form posts to a server action (./actions.ts) that issues the code + 302s to redirect_uri.

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompany } from '@/lib/queries/active-company'
import { findClientByClientId, isRegisteredRedirectUri } from '@/lib/oauth/clients'
import { parseScope, type Scope } from '@/lib/oauth/types'
import { handleAuthorize } from './actions'
import type { Metadata } from 'next'
import { PRIVATE_ROBOTS } from '@/lib/seo/route-policy'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: PRIVATE_ROBOTS }

interface AuthorizePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function readParam(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key]
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}

const SCOPE_LABELS: Record<Scope, string> = {
  'mcp:read': 'Read your estimates, clients, and projects',
  'mcp:write': 'Create new estimates',
}

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const sp = await searchParams

  const client_id = readParam(sp, 'client_id')
  const redirect_uri = readParam(sp, 'redirect_uri')
  const response_type = readParam(sp, 'response_type')
  const state = readParam(sp, 'state')
  const code_challenge = readParam(sp, 'code_challenge')
  const code_challenge_method = readParam(sp, 'code_challenge_method') || 'S256'
  const rawScope = readParam(sp, 'scope')

  // Validate required params early — bail with an inline error before doing any auth round-trips.
  if (!client_id || !redirect_uri) {
    return <AuthorizeError message="Missing required parameter: client_id or redirect_uri." />
  }
  if (response_type !== 'code') {
    return <AuthorizeError message='Only response_type="code" is supported.' />
  }
  if (code_challenge_method !== 'S256') {
    return <AuthorizeError message="Only PKCE S256 is supported (code_challenge_method=S256)." />
  }
  if (!code_challenge) {
    return <AuthorizeError message="PKCE code_challenge is required." />
  }

  const client = await findClientByClientId(client_id)
  if (!client) {
    return <AuthorizeError message={`Unknown client_id: ${client_id}`} />
  }
  if (!isRegisteredRedirectUri(client, redirect_uri)) {
    return <AuthorizeError message="redirect_uri is not registered for this client." />
  }

  // Auth gate — sign the user in first, then bring them back.
  const claims = await getAuthClaims()
  if (!claims?.sub) {
    const h = await headers()
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:9633'
    const currentUrl = new URL(`${proto}://${host}/oauth/authorize`)
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === 'string') currentUrl.searchParams.set(k, v)
    }
    redirect(`/?auth=login&next=${encodeURIComponent(currentUrl.toString())}`)
  }

  const activeCompany = await getActiveCompany()
  if (!activeCompany) {
    redirect('/onboarding')
  }

  const scopes = parseScope(rawScope)

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Authorize {client.client_name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>{client.client_name}</strong> is requesting access to your Xtimator account.
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Active company</dt>
            <dd className="font-medium">{activeCompany!.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Redirect</dt>
            <dd className="break-all font-mono text-xs">{redirect_uri}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Permissions requested</dt>
            <dd>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {scopes.map((s) => (
                  <li key={s}>{SCOPE_LABELS[s]}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <form action={handleAuthorize} className="mt-8 flex gap-3">
          <input type="hidden" name="client_id" value={client_id} />
          <input type="hidden" name="redirect_uri" value={redirect_uri} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={code_challenge} />
          <input type="hidden" name="code_challenge_method" value={code_challenge_method} />
          <input type="hidden" name="scope" value={scopes.join(' ')} />

          <button
            type="submit"
            name="decision"
            value="deny"
            className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="authorize"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Authorize
          </button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          You can revoke this access any time from{' '}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

function AuthorizeError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-lg border border-destructive/40 bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-destructive">Authorization error</h1>
        <p className="mt-2 text-sm">{message}</p>
      </div>
    </div>
  )
}
