---
phase: 86
plan: "—"
subsystem: oauth
tags: [oauth2, mcp, security, multi-tenancy, claude-connector]
dependency-graph:
  requires:
    - phase-79  # active-company cookie + getActiveCompanyId / getActiveCompany
    - phase-82  # RLS pattern (deny-all on sensitive tables)
  provides:
    - oauth-authorization-server-metadata
    - oauth-protected-resource-metadata
    - dynamic-client-registration
    - authorization-code-grant-with-pkce-s256
    - refresh-token-rotation
    - resolveAccessToken-for-mcp
  affects:
    - .well-known/oauth-authorization-server
    - .well-known/oauth-protected-resource
    - /oauth/register
    - /oauth/authorize
    - /oauth/token
tech-stack:
  added: []
  patterns:
    - "Opaque 32-byte hex tokens; never store plaintext (sha256 hash as PK)"
    - "PKCE S256 mandatory; constant-time challenge compare via timingSafeEqual"
    - "Refresh-token rotation: every refresh issues a new pair and revokes the previous refresh token"
    - "redirect_uri exact-match (no normalization, no prefix matching) per OAuth 2.0 Security BCP"
    - "RLS deny-all + service-role-only access for oauth_* tables"
key-files:
  created:
    - supabase/migrations/20260526000003_phase86_oauth_tables.sql
    - scripts/apply-migration-86-01.mjs
    - lib/oauth/types.ts
    - lib/oauth/pkce.ts
    - lib/oauth/tokens.ts
    - lib/oauth/codes.ts
    - lib/oauth/clients.ts
    - lib/oauth/issuer.ts
    - app/.well-known/oauth-authorization-server/route.ts
    - app/.well-known/oauth-protected-resource/route.ts
    - app/oauth/register/route.ts
    - app/oauth/token/route.ts
    - app/oauth/authorize/page.tsx
    - app/oauth/authorize/actions.ts
    - app/oauth/authorize/error/page.tsx
    - tests/unit/oauth-pkce.test.ts
    - tests/unit/oauth-register.test.ts
    - tests/unit/oauth-token-issuance.test.ts
  modified: []
decisions:
  - "Spec advertised registration_endpoint at /oauth/register (not /api/oauth/register). Moved all three OAuth handler routes under app/oauth/{register,token,authorize}/ so the URLs match the metadata document exactly. Cleaner than maintaining alias routes."
  - "validateRegistrationPayload exported as a pure function (no DB) so unit tests cover all RFC 7591 validation paths without mocking Supabase."
  - "Authorization codes use the same opaque-token + sha256 hashing pattern as access/refresh tokens (code_hash as PK). Single-use enforced by updating consumed_at with a `.is('consumed_at', null)` predicate."
  - "Refresh-token rotation: issue NEW pair before revoking the old refresh token so a transient DB failure cannot lock the user out of their session."
  - "Consent UI is a minimal server component matching the spec's 'don't block on UI polish — Phase 90 will refine' guidance. Tailwind primitives only, no shadcn/ui dependencies."
metrics:
  duration: "~45 minutes"
  completed: "2026-05-26"
  commits: 5
  files_created: 18
  tests_added: 34
---

# Phase 86: v4.1 OAuth 2.0 Authorization Server for MCP Summary

**OAuth 2.0 authorization-server inside the Next.js app — Claude.ai / Desktop / Code can now complete the custom-connector handshake against Xtimator (register → authorize → token → refresh), with tokens scoped to a specific (user_id, company_id) and stored as sha256 hashes.**

## What Shipped

### Endpoints

| Method | Path                                       | Purpose                                                                          |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| GET    | `/.well-known/oauth-authorization-server`  | RFC 8414 AS metadata (issuer, endpoints, supported response/grant/PKCE methods). |
| GET    | `/.well-known/oauth-protected-resource`    | RFC 9728 PR metadata (resource = `${issuer}/api/mcp`, AS = `[issuer]`).          |
| POST   | `/oauth/register`                          | RFC 7591 Dynamic Client Registration. Returns 201 with `client_id`.              |
| GET    | `/oauth/authorize`                         | Server-component consent UI. Auth-gates via Supabase session, shows active company + requested scopes. |
| POST   | `handleAuthorize` server action            | Issues authorization code + 302s to redirect_uri (or denies with `error=access_denied`). |
| POST   | `/oauth/token`                             | `authorization_code` and `refresh_token` grant types. PKCE S256 verified.        |

### Database

Migration `20260526000003_phase86_oauth_tables.sql` — applied to prod (`prmqgcrnpuvpzruyzvuv`) at 2026-05-26.

- `oauth_clients` — registered client metadata.
- `oauth_authorization_codes` — code_hash PK, expires in 10 min, single-use via `consumed_at`.
- `oauth_access_tokens` — token_hash PK, expires in 1 hour.
- `oauth_refresh_tokens` — token_hash PK, expires in 30 days, rotated on every refresh.

All four tables are **RLS deny-all** (no policies created → no `authenticated`/`anon` access; only the service-role client can read/write). The migration's DO block asserts the invariant at apply time.

### Test Coverage

`npx vitest run tests/unit/oauth-pkce.test.ts tests/unit/oauth-token-issuance.test.ts tests/unit/oauth-register.test.ts` → **34 / 34 passing**.

- `oauth-pkce.test.ts` (9 tests): base64url encoding, S256 challenge equality with the RFC 7636 Appendix B vector, verifier alphabet + length validation, constant-time compare on mismatch.
- `oauth-register.test.ts` (10 tests): every validation branch of `validateRegistrationPayload` — required field, default field, unsupported grant/response/auth method, malformed URI, non-array shapes.
- `oauth-token-issuance.test.ts` (15 tests): token generation collision-resistance, sha256 hashing parity with `node:crypto`, **the "plaintext never persisted" assertion**, refresh-token rotation revoking the previous token, cross-client refresh rejection, expired/revoked rejection.

`npx tsc --noEmit` → clean.

## What Phase 87 (MCP Route) Needs To Do

Phase 87 ships `/api/mcp` and consumes the access tokens issued here. The contract:

1. **Read the bearer token:** `const auth = req.headers.get('authorization'); const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null`.
2. **Resolve to (user_id, company_id, scope):**
   ```ts
   import { resolveAccessToken } from '@/lib/oauth/tokens'
   const resolved = await resolveAccessToken(token)
   if (!resolved) return new Response('Unauthorized', { status: 401 })
   ```
3. **Scope-gate the tool call:** check `resolved.scope.includes('mcp:read')` (or `'mcp:write'` for mutating tools). The MCP tool-grouping decision from SEED-030 maps tool names → required scope.
4. **Inject company_id into every query:** the existing tenant-scoped helpers (Phase 82 RLS via `company_members`) gate by `auth.uid()` — but the MCP route runs **without** a Supabase auth cookie. Either:
   - Mint a per-request impersonation JWT using `resolved.user_id`, OR
   - Use `requireServiceClient()` plus an explicit `.eq('company_id', resolved.company_id)` filter on every query (simpler, mirrors how the Webhook/Inngest routes already work).
5. **WWW-Authenticate on 401:** include `Bearer realm="${issuer}", resource_metadata="${issuer}/.well-known/oauth-protected-resource"` per RFC 9728 so Claude can re-discover the AS automatically when tokens expire.

## Security Notes

- **No plaintext tokens** in DB. The `tests/unit/oauth-token-issuance.test.ts` "plaintext never persisted" assertion JSON-stringifies the persisted row and asserts the plaintext is absent — this is the canary that catches accidental regressions.
- **PKCE S256 mandatory.** The `/authorize` page returns an inline error if `code_challenge_method !== 'S256'`, and `consumeAuthorizationCode` re-verifies the PKCE binding before consuming the code.
- **redirect_uri exact match** on both `/authorize` and `/token`. No normalization, no prefix.
- **Refresh-token rotation:** every successful refresh issues a NEW (access, refresh) pair and marks the old refresh token `revoked_at = now()`. The new pair is issued **before** revocation so a transient DB failure during revocation doesn't lock the user out.
- **Cache-Control: no-store** on every `/oauth/token` response (RFC 6749 §5.1).

## Deviations from Plan

None. Spec executed as written. One minor structural call: moved `register` and `token` routes from `app/api/oauth/*` to `app/oauth/*` (single move, before the first endpoint commit) so the issued URLs match the metadata document literally instead of via an alias.

## Commits

1. `886cfe9` — feat(86-01): OAuth tables migration + applier script (RLS deny-all, hashed PKs, applied to prod).
2. `03ccbb2` — feat(86-02): lib/oauth helpers (types, pkce, tokens, codes, clients, issuer).
3. `a803716` — feat(86-03): five OAuth endpoints + consent UI server component.
4. `eb350ed` — test(86-04): 34 unit tests, all passing.
5. (this commit) — docs(86): SUMMARY + STATE + ROADMAP.

## Self-Check: PASSED
