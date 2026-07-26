'use server'

// Phase 86: server action that issues the authorization code (or denies) and redirects
// back to the OAuth client (Claude). Invoked by the consent UI form submission.

import { redirect } from 'next/navigation'
import { getAuthClaims } from '@/lib/queries/auth'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { findClientByClientId, isRegisteredRedirectUri } from '@/lib/oauth/clients'
import { issueAuthorizationCode } from '@/lib/oauth/codes'
import { parseScope, serializeScope } from '@/lib/oauth/types'
import {
  assertWritable,
  DEMO_READONLY_MESSAGE,
} from '@/lib/demo/guard'

interface AuthorizeFormFields {
  decision: 'authorize' | 'deny'
  client_id: string
  redirect_uri: string
  state: string
  code_challenge: string
  code_challenge_method: string
  scope: string
}

function readField(form: FormData, key: keyof AuthorizeFormFields): string {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

function appendQuery(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

export async function handleAuthorize(formData: FormData): Promise<void> {
  const fields: AuthorizeFormFields = {
    decision: readField(formData, 'decision') === 'authorize' ? 'authorize' : 'deny',
    client_id: readField(formData, 'client_id'),
    redirect_uri: readField(formData, 'redirect_uri'),
    state: readField(formData, 'state'),
    code_challenge: readField(formData, 'code_challenge'),
    code_challenge_method: readField(formData, 'code_challenge_method'),
    scope: readField(formData, 'scope'),
  }

  // Re-validate client + redirect_uri server-side (never trust form fields).
  const client = await findClientByClientId(fields.client_id)
  if (!client || !isRegisteredRedirectUri(client, fields.redirect_uri)) {
    // Cannot safely redirect to an unverified URI — render an inline error.
    redirect('/oauth/authorize/error?reason=invalid_client_or_redirect')
  }

  if (fields.decision === 'deny') {
    redirect(
      appendQuery(fields.redirect_uri, {
        error: 'access_denied',
        error_description: 'The user denied the authorization request.',
        ...(fields.state ? { state: fields.state } : {}),
      }),
    )
  }

  if (fields.code_challenge_method !== 'S256' || !fields.code_challenge) {
    redirect(
      appendQuery(fields.redirect_uri, {
        error: 'invalid_request',
        error_description: 'PKCE S256 code_challenge is required.',
        ...(fields.state ? { state: fields.state } : {}),
      }),
    )
  }

  const claims = await getAuthClaims()
  const userId = claims?.sub as string | undefined
  if (!userId) {
    redirect('/?auth=login')
  }

  const companyId = await getActiveCompanyId()
  if (!companyId) {
    redirect('/onboarding')
  }

  const email = claims?.email as string | undefined
  const denied = await assertWritable({ userId, email, companyId })
  if (denied) {
    redirect(
      appendQuery(fields.redirect_uri, {
        error: 'access_denied',
        error_description: DEMO_READONLY_MESSAGE,
        ...(fields.state ? { state: fields.state } : {}),
      }),
    )
  }

  const scopes = parseScope(fields.scope)

  const { code } = await issueAuthorizationCode({
    clientId: fields.client_id,
    userId: userId as string,
    userEmail: email,
    companyId: companyId as string,
    codeChallenge: fields.code_challenge,
    codeChallengeMethod: 'S256',
    redirectUri: fields.redirect_uri,
    scope: serializeScope(scopes),
  })

  redirect(
    appendQuery(fields.redirect_uri, {
      code,
      ...(fields.state ? { state: fields.state } : {}),
    }),
  )
}
