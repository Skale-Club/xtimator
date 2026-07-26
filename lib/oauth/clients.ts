// Phase 86: OAuth dynamic client registration (RFC 7591) + lookup.

import 'server-only'
import { randomUUID } from 'node:crypto'
import { requireServiceClient } from '@/lib/supabase/service'
import { assertWritable } from '@/lib/demo/guard'
import {
  SUPPORTED_GRANT_TYPES,
  SUPPORTED_RESPONSE_TYPES,
  SUPPORTED_TOKEN_AUTH_METHODS,
  type GrantType,
  type OAuthClient,
  type ResponseType,
  type TokenAuthMethod,
} from './types'

export interface RegisterClientInput {
  client_name?: unknown
  redirect_uris?: unknown
  grant_types?: unknown
  response_types?: unknown
  token_endpoint_auth_method?: unknown
}

export interface RegisterClientResult {
  ok: true
  client: OAuthClient
}

export interface RegisterClientError {
  ok: false
  error: string
  error_description: string
}

// Validation -------------------------------------------------------------------

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  if (v.length === 0) return null
  if (!v.every((x) => typeof x === 'string' && x.length > 0)) return null
  return v as string[]
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateRegistrationPayload(
  body: RegisterClientInput,
): { ok: true; data: Required<Pick<OAuthClient, 'client_name' | 'redirect_uris' | 'grant_types' | 'response_types' | 'token_endpoint_auth_method'>> } | RegisterClientError {
  // redirect_uris is the only strictly required field per RFC 7591 §2 for a public client.
  const redirect_uris = asStringArray(body.redirect_uris)
  if (!redirect_uris) {
    return {
      ok: false,
      error: 'invalid_redirect_uri',
      error_description: 'redirect_uris must be a non-empty array of strings',
    }
  }
  for (const uri of redirect_uris) {
    if (!isHttpUrl(uri)) {
      return {
        ok: false,
        error: 'invalid_redirect_uri',
        error_description: `redirect_uri ${uri} must be an http(s) URL`,
      }
    }
  }

  const client_name =
    typeof body.client_name === 'string' && body.client_name.length > 0
      ? body.client_name
      : 'MCP Client'

  // grant_types: default to ["authorization_code", "refresh_token"] when omitted (RFC 7591 §2).
  let grant_types: GrantType[]
  if (body.grant_types === undefined) {
    grant_types = ['authorization_code', 'refresh_token']
  } else {
    const arr = asStringArray(body.grant_types)
    if (!arr) {
      return { ok: false, error: 'invalid_client_metadata', error_description: 'grant_types must be a non-empty array' }
    }
    for (const g of arr) {
      if (!(SUPPORTED_GRANT_TYPES as readonly string[]).includes(g)) {
        return {
          ok: false,
          error: 'invalid_client_metadata',
          error_description: `grant_type ${g} is not supported`,
        }
      }
    }
    grant_types = arr as GrantType[]
  }

  let response_types: ResponseType[]
  if (body.response_types === undefined) {
    response_types = ['code']
  } else {
    const arr = asStringArray(body.response_types)
    if (!arr) {
      return { ok: false, error: 'invalid_client_metadata', error_description: 'response_types must be a non-empty array' }
    }
    for (const r of arr) {
      if (!(SUPPORTED_RESPONSE_TYPES as readonly string[]).includes(r)) {
        return {
          ok: false,
          error: 'invalid_client_metadata',
          error_description: `response_type ${r} is not supported`,
        }
      }
    }
    response_types = arr as ResponseType[]
  }

  // Public clients only — PKCE, no client secret.
  const incomingAuth =
    typeof body.token_endpoint_auth_method === 'string'
      ? body.token_endpoint_auth_method
      : 'none'
  if (!(SUPPORTED_TOKEN_AUTH_METHODS as readonly string[]).includes(incomingAuth)) {
    return {
      ok: false,
      error: 'invalid_client_metadata',
      error_description: 'token_endpoint_auth_method must be "none" (public PKCE client)',
    }
  }
  const token_endpoint_auth_method = incomingAuth as TokenAuthMethod

  return {
    ok: true,
    data: { client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method },
  }
}

export async function registerClient(body: RegisterClientInput): Promise<RegisterClientResult | RegisterClientError> {
  const validated = validateRegistrationPayload(body)
  if (!('data' in validated)) return validated

  const denied = await assertWritable()
  if (denied) {
    return {
      ok: false,
      error: 'demo_readonly',
      error_description: denied.error,
    }
  }

  const { data } = validated
  const supabase = requireServiceClient()
  const client_id = randomUUID()

  const { data: inserted, error } = await supabase
    .from('oauth_clients')
    .insert({
      client_id,
      client_name: data.client_name,
      redirect_uris: data.redirect_uris,
      grant_types: data.grant_types,
      response_types: data.response_types,
      token_endpoint_auth_method: data.token_endpoint_auth_method,
    })
    .select('id, client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_at')
    .single()

  if (error || !inserted) {
    return {
      ok: false,
      error: 'server_error',
      error_description: error?.message ?? 'failed to persist oauth_client',
    }
  }

  return { ok: true, client: inserted as OAuthClient }
}

/**
 * Look up a client by its public client_id. Returns null when missing.
 */
export async function findClientByClientId(clientId: string): Promise<OAuthClient | null> {
  const supabase = requireServiceClient()
  const { data, error } = await supabase
    .from('oauth_clients')
    .select('id, client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, created_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error || !data) return null
  return data as OAuthClient
}

/**
 * Validate that the given redirect_uri exactly matches one of the client's registered URIs.
 * Exact string match — no normalization, no prefix matching (per OAuth 2.0 security BCP).
 */
export function isRegisteredRedirectUri(client: OAuthClient, redirectUri: string): boolean {
  return client.redirect_uris.includes(redirectUri)
}
