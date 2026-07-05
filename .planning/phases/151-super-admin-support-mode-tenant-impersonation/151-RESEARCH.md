# Phase 151: Super-Admin Support Mode (Tenant Impersonation) - Research

**Researched:** 2026-07-05
**Domain:** Signed session claims, cookie-based auth resolution, Next.js App Router server actions/layout integration
**Confidence:** HIGH

## Summary

This phase is almost entirely plumbing, not exploration — 151-CONTEXT.md locks the architecture down to the module/function level, and every primitive it calls for already exists verbatim in this codebase. There is no new library to evaluate: the repo already has a working `createHmac` + `timingSafeEqual` HMAC-verification convention (`lib/whatsapp/verify.ts`), a constant-time secret-comparison convention (`lib/auth/cron-auth.ts`), an AES-GCM key-loading convention (`lib/crypto/aes.ts`), and a `requireAdmin()` re-verification pattern (`lib/auth/admin-context.ts`) that all compose directly into the "signed time-boxed claim" `lib/auth/support-mode.ts` that CONTEXT.md specifies. No JWT library is installed (`package.json` has no `jose`/`jsonwebtoken`/`iron-session`) and none should be added — Node's built-in `crypto.createHmac('sha256', ...)` is the correct, already-idiomatic primitive here, not a new dependency.

The one area requiring care is the exact shape of the signed cookie payload and its verification order (signature → expiry → live `platform_admins` re-check), because this is the phase's actual security boundary. The read path for the impersonated company must go through `requireServiceClient()` directly (service-role bypass), NOT through `getActiveCompanyId()`/`createClient()` — CONTEXT.md is explicit and correct that touching the RLS-bound resolver would open a blast-radius hole across every existing mutating server action in the app. This research confirms that boundary is architecturally sound by tracing exactly how `getActiveCompanyId()` validates ownership (RLS-bound `company_members` row check) and how `app/(app)/layout.tsx` currently threads `company`/`memberships` into `Sidebar`/`Topbar` — both integration points are narrow and well-isolated.

**Primary recommendation:** Build `lib/auth/support-mode.ts` using `crypto.createHmac('sha256', APP_ENCRYPTION_KEY-derived-or-separate-key)` over a JSON payload `{ adminUserId, companyId, issuedAt, expiresAt }`, base64url-encode `payload.signature` into a single cookie string, verify with `timingSafeEqual` mirroring `lib/whatsapp/verify.ts`'s exact pattern, and re-check `platform_admins` on every read exactly like `getAdminContext()` does. Wire into `app/(app)/layout.tsx` as a new branch that runs BEFORE `getActiveCompany()`, resolving the company via `requireServiceClient()` and passing `memberships={[]}` to `Sidebar` to suppress the switcher.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Why `getActiveCompanyId()` must NOT be touched:** That helper validates the `active_company_id` cookie against the CALLER'S OWN `company_members` row via the RLS-bound client (`lib/queries/active-company.ts:57-69`) — a super admin viewing a tenant they don't belong to will correctly fail that check. Making it "support-mode aware" would mean EVERY existing mutating server action in the entire app (all of which resolve company via this helper) suddenly becomes reachable in an impersonated context — a huge, unrequested blast-radius increase. Do not go there.

**The scoped alternative — a separate, view-only resolution path:**

1. **New signed session claim** (NOT a real Supabase sign-in): a dedicated httpOnly cookie (e.g. `support_mode_session`), value = an HMAC-signed payload `{ adminUserId, companyId, issuedAt, expiresAt }` (reuse `lib/crypto/aes.ts`'s key-loading convention or Node's `crypto.createHmac` with `APP_ENCRYPTION_KEY` — Claude's discretion on exact signing primitive, but it MUST be tamper-evident, not just base64). Short TTL (recommend 1-4 hours; Claude's discretion on exact value, but it must be enforced server-side on every read, not just at mint time).
2. **`lib/auth/support-mode.ts`** (new): `startSupportSession(companyId)` — `requireAdmin()`-gated server action, mints the signed cookie, calls `logAdminAction({action: 'company.support_mode_start', targetType:'company', targetId: companyId})`. `getSupportModeSession()` — reads + verifies the cookie signature AND expiry AND re-verifies the `adminUserId` is STILL a real row in `platform_admins` (never trust the cookie's claim alone — mirrors the `getAdminContext()` doc comment's own warning about stale cached admin state). Returns `{ adminUserId, companyId } | null`. `endSupportSession()` — clears the cookie, logs `'company.support_mode_end'` with the session duration in metadata.
3. **`app/(app)/layout.tsx` integration:** check `getSupportModeSession()` FIRST. If present and valid: resolve the viewed company via `requireServiceClient().from('companies').eq('id', session.companyId).single()` (service-role read — the admin has no real membership row, so this must NOT go through the RLS-bound client or `getActiveCompanyId()`). Render `<SupportModeBanner company={...} />` and pass that resolved company through the SAME props the layout already threads to `Sidebar`/`Topbar`/children. **Suppress the company switcher** (`memberships` prop) while in Support Mode — a super admin viewing tenant X must not be offered a dropdown to hop to tenant Y as if they were a real member of either. If no valid session: proceed exactly as today (unchanged).
4. **Scope is READ/VIEW ONLY for v1** (matches SUPPORT-01's literal wording "enter a normal, tenant-scoped app view" and REQUIREMENTS.md's `SUPPORTX-01` v2 deferral of "write actions"). Do NOT wire support-mode awareness into any mutating server action. If a super admin clicks a mutating button while impersonating, the existing code paths behave exactly as they do today (they resolve the ADMIN's OWN real active company via the untouched `getActiveCompanyId()`) — a confusing but SAFE failure mode, never a cross-tenant write. This is intentional and must not be "fixed" by wiring mutations through the support-mode cookie — that is explicitly out of scope (SUPPORTX-01).
5. **Exit:** a visible "Exit Support Mode" action (in the banner) calls `endSupportSession()` and redirects back to `/admin/companies`.
6. **Auto-revocation:** enforced by (a) the cookie's own expiry, (b) the re-verification failing if the admin is ever removed from `platform_admins` mid-session, (c) never writing the cookie with a `maxAge` beyond the signed `expiresAt`. Nothing persists beyond the browser session by design (short-lived httpOnly cookie, no DB row tracking "current" impersonation state beyond the audit log).

**Banner** — mirror `components/demo/demo-banner.tsx` exactly: fixed bar, `border-b border-primary/20 bg-primary/10`, `ShieldCheck` icon (locked by 151-UI-SPEC.md, resolving the earlier "Claude's discretion" — see UI Spec section below), centered text, `<form action={...}><button>` inline exit CTA mirroring `exitDemoToSignup`.

**Entry point (from Phase 150):** On the Companies list, add a "Support Mode →" row action next to "Configure →", calling `startSupportSession(companyId)` then redirecting to `/dashboard`. Must be visually distinct from `HandoffButton` and `Configure →`.

**Audit logging (SUPPORT-03):** Extend `lib/admin/audit-log.ts`'s `AuditAction` union with `'company.support_mode_start'` and `'company.support_mode_end'`. Metadata for start: `{}` (targetId already carries the company). Metadata for end: `{ durationSeconds: number }`. This is the ONLY new audit-log surface this phase needs — reuse `logAdminAction()` verbatim, do not build a parallel logging mechanism.

### Claude's Discretion

- Exact HMAC/signing primitive (CONTEXT.md leaves the choice open between `aes.ts`'s AES-GCM convention and a plain `createHmac` signature; this research recommends `createHmac` — see Architecture Patterns below).
- Exact TTL value in the 1-4 hour range (recommend 2 hours as a middle-ground default).
- Icon choice — **already resolved by 151-UI-SPEC.md**: `ShieldCheck` for the banner (continuity with `/admin`'s existing banner), `Eye` for the Companies-list row action (distinct from banner, from `HandoffButton`'s `Send`, and from `Configure →`'s plain text).
- Exact banner copy — **already resolved by 151-UI-SPEC.md**: `Support Mode — viewing {companyName} as {adminEmail}.` + `Exit Support Mode` button.
- Client-vs-server-component split for the row action — 151-UI-SPEC.md defers to executor discretion (plain server-action form is acceptable; a `'use client'` wrapper with `useTransition`/toast is also acceptable) but locks the visual result.

### Deferred Ideas (OUT OF SCOPE)

- Support Mode WRITE actions (SUPPORTX-01, v2) — deliberately out of scope; must not be silently implemented anyway (see locked decision #4).
- A dedicated "impersonation history" admin view (browsing past Support Mode sessions from the audit log) — not required by SUPPORT-03; the existing audit log storage is sufficient for v1.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUPPORT-01 | Super admin can enter a normal tenant-scoped app view ("Support Mode") for any company directly from the admin Companies screen, without needing the tenant's credentials | `startSupportSession()` server action + Companies-list row action (Code Examples); confirmed `requireAdmin()` gate pattern |
| SUPPORT-02 | Persistent banner identifying acting admin + company on every page, matching existing "Super Admin Mode" banner styling | `DemoBanner` structural precedent traced verbatim; 151-UI-SPEC.md locks exact copy/classes/icon |
| SUPPORT-03 | Every session (entry, company, admin identity, duration, exit) recorded in existing admin audit log | `lib/admin/audit-log.ts` `AuditAction` union extension pattern confirmed; `logAdminAction()` signature traced |
| SUPPORT-04 | Signed, time-boxed session claim — not a full identity switch, respects RLS, auto-revoked, never persists beyond browser session | HMAC-sign/verify pattern traced from `lib/whatsapp/verify.ts` + `lib/auth/cron-auth.ts`; service-role read boundary confirmed via `lib/queries/active-company.ts` trace |

## Project Constraints (from CLAUDE.md)

- **Secret handling (CRITICAL):** Never commit secrets/keys to git, including in planning docs. If this phase introduces a new signing secret (see discretion below), it must live in `.env.local` (gitignored) / Vercel env vars only — never hardcoded, never pasted into `.planning/` docs even as "what was configured." Use placeholders in any documentation.
- **No API keys in env** (user memory `feedback_no_keys_in_env`): this constraint targets *third-party provider* API keys (OpenRouter, etc.) which must go through the encrypted `platform_integrations` admin panel — it does NOT apply to `APP_ENCRYPTION_KEY`-style internal application secrets, which are correctly env-based today (`lib/crypto/aes.ts` already reads `APP_ENCRYPTION_KEY` from `process.env`). The support-mode signing key follows the same internal-secret convention, not the provider-key convention.
- **Security-sensitive change:** all AI-unrelated auth logic still must go through the standard GSD phase pipeline (this phase) — no direct edits outside it.
- **Tech stack:** Next.js 16.2.6 (App Router), TypeScript strict, no middleware layer in this repo (root has no `middleware.ts`) — cookie reads/writes happen inside server components/actions exactly as `active-company.ts` already does.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` (built-in) | Node 24.13.0 (repo runtime) | HMAC-SHA256 signing + `timingSafeEqual` verification of the support-mode cookie payload | Already the exact pattern used for WhatsApp webhook signatures (`lib/whatsapp/verify.ts`) and cron auth (`lib/auth/cron-auth.ts`) — zero new dependency, zero new attack surface to audit |
| `next/headers` `cookies()` | Next 16.2.6 (bundled) | Read/write the `support_mode_session` httpOnly cookie | Identical mechanism to `active_company_id` cookie in `lib/queries/active-company.ts` |
| `next/navigation` `redirect()` | Next 16.2.6 (bundled) | Post-start redirect to `/dashboard`, post-exit redirect to `/admin/companies` | Matches `exitDemoToSignup`'s redirect pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.3.6 (installed) | Optional: validate the decoded JSON payload shape after signature verification, before trusting field types | Use if the planner wants a schema-checked parse rather than a manual type-guard on the decoded JSON; not strictly required since the payload is small and fully controlled by the signing code itself |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `createHmac` signed JSON cookie | `jose` (JWT library) | No JWT library is installed in `package.json` (verified — no `jose`/`jsonwebtoken`/`jsonwebtoken`/`iron-session` entries). Introducing one for a single internal cookie with 4 fields is unjustified complexity — CONTEXT.md explicitly asks Claude to check for an existing lib before suggesting a new dependency, and none exists. A JWT's extra surface (alg confusion, header parsing, external lib CVEs) buys nothing over a fixed-shape HMAC signature here. |
| `createHmac` with `APP_ENCRYPTION_KEY` (shared secret) | A dedicated second secret (e.g. `SUPPORT_MODE_SIGNING_KEY`) | CONTEXT.md leaves this to discretion. Reusing `APP_ENCRYPTION_KEY` avoids provisioning a new env var across all deploy targets (`.env.local`, Vercel/Coolify), but couples cookie-signing key rotation to encryption-key rotation for BYOK secrets. Recommendation: reuse `APP_ENCRYPTION_KEY` via `createHmac('sha256', keyBuffer)` — it's already 256 bits of good entropy, already provisioned everywhere, and HMAC and AES-GCM using the same underlying key material for two different algorithms is a standard, safe pattern (no key-reuse weakness across different primitives/purposes here since one is a MAC and the other is authenticated encryption, and they operate on structurally distinct data). |
| Service-role read for company lookup | RLS-bound client with a temporary policy grant | CONTEXT.md is explicit and correct: the RLS-bound client would need a NEW policy allowing platform_admins to read `companies` rows they don't belong to — an actual RLS surface change with broader implications. The service-role read confined to `lib/auth/support-mode.ts` (a single call site) has a much smaller, auditable footprint and doesn't touch policy files at all. |

**Installation:** None required — no new packages.

**Version verification:**
```bash
node --version         # v24.13.0 (repo runtime, confirmed)
npm view zod version   # 4.4.3 latest; repo pins ^4.3.6, already installed
```
No new dependency is being introduced by this phase, so no `npm install` step applies. Verified `package.json` has no `jose`, `jsonwebtoken`, or `iron-session` entries as of this research date.

## Architecture Patterns

### Recommended Project Structure
```
lib/auth/
├── admin-context.ts       # existing — requireAdmin()/getAdminContext(), gate + re-verify pattern to mirror
└── support-mode.ts        # NEW — startSupportSession, getSupportModeSession, endSupportSession

lib/admin/
└── audit-log.ts           # extend AuditAction union with 2 new actions (no new file)

components/admin/
└── support-mode-banner.tsx  # NEW — per 151-UI-SPEC.md suggested path

app/admin/companies/
├── page.tsx                # extend row actions: add "Support Mode →" next to "Configure →"
└── actions.ts               # OR a new small actions file — add server action wrapping startSupportSession

app/(app)/
└── layout.tsx               # extend: check getSupportModeSession() FIRST, branch resolution + banner + memberships suppression
```

### Pattern 1: HMAC-signed, tamper-evident cookie payload (mirrors `lib/whatsapp/verify.ts`)
**What:** Sign a compact JSON payload with `createHmac('sha256', key)`, verify with `timingSafeEqual`, reject on any mismatch or expiry.
**When to use:** Any time a value must round-trip through an untrusted client (cookie, query param) but the server must be able to prove it wasn't tampered with, without a database round-trip to validate it.
**Example (pattern to compose, not existing code — synthesized from the two real precedents below):**
```typescript
// Signature verification precedent — Source: lib/whatsapp/verify.ts (existing, verbatim)
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signature.slice('sha256='.length)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    return false // timingSafeEqual throws if buffers have different lengths
  }
}

// Constant-time secret comparison precedent — Source: lib/auth/cron-auth.ts (existing, verbatim)
// Demonstrates the length-guard-before-timingSafeEqual convention this codebase already follows.
```
**Composed shape for `lib/auth/support-mode.ts`** (new code, following the above precedents):
```typescript
// Payload: { adminUserId, companyId, issuedAt, expiresAt } as JSON
// Cookie value: `${base64url(payloadJson)}.${hex(hmac)}`
// Sign:   createHmac('sha256', keyBuffer).update(base64urlPayload).digest('hex')
// Verify: recompute hmac over the received base64url segment, timingSafeEqual against
//         the received hex segment (Buffer.from(...) both sides, length-guard first).
// Then: JSON.parse the decoded payload, check expiresAt > Date.now(), check adminUserId
//       still has a live platform_admins row (service-role query, mirrors getAdminContext()).
```

### Pattern 2: Admin re-verification on every read (mirrors `lib/auth/admin-context.ts`)
**What:** Never trust a cached/cookie-carried claim of adminhood — re-check the `platform_admins` table on every read via the SECURITY DEFINER-safe service-role query.
**When to use:** `getSupportModeSession()` MUST repeat this check even though the cookie signature already proves the payload wasn't tampered with — the payload could be genuinely signed by code that ran minutes ago, before the admin was removed from `platform_admins`. Signature validity ≠ current authorization.
**Example:**
```typescript
// Source: lib/auth/admin-context.ts (existing, verbatim) — the pattern to repeat inside
// getSupportModeSession(), not to call directly (that would require a full user session,
// which doesn't exist for the impersonation read path — the check is the same SHAPE,
// applied to the cookie's adminUserId instead of a live auth.getClaims() sub).
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  if (!userId) return null
  const svc = requireServiceClient()
  const { data: row } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return row ? { userId, email } : null
})
```

### Pattern 3: Service-role company read, bypassing RLS deliberately and narrowly
**What:** `requireServiceClient().from('companies').eq('id', companyId).single()` — used ONLY inside `getSupportModeSession()`'s resolution, never generalized.
**When to use:** The admin has no `company_members` row for the viewed company (by design — that's the whole point of Support Mode), so the RLS-bound client (`createClient()`) would correctly return zero rows. This is the one place in the phase where "bypass RLS" is the deliberately correct call, because authorization was already established by (a) the HMAC signature, (b) the expiry check, and (c) the live `platform_admins` re-check — the service-role read is reached only after all three gates pass.
**Example:**
```typescript
// Composition pattern, following the exact client-selection convention from
// lib/queries/active-company.ts's own loadCompanyById (which already does a service-role
// company lookup by id, for a different reason — cache-key isolation, not RLS bypass —
// but demonstrates the identical client call shape):
const supabase = requireServiceClient()
const { data: company } = await supabase
  .from('companies')
  .select('id, name, logo_url, owner_name, theme_preference, industry, currency_code')
  .eq('id', session.companyId)
  .single()
```

### Pattern 4: Layout branch ordering in `app/(app)/layout.tsx`
**What:** `getSupportModeSession()` must be checked and resolved BEFORE `getActiveCompany()` runs, because if a valid session exists, the company/memberships/banner values fed into the rest of the layout are entirely different (service-role company object, empty memberships, no `isDemo`/`TrialBanner` checks).
**Current layout shape (traced, existing code, `app/(app)/layout.tsx`):**
```typescript
const claims = await getAuthClaims()
if (!claims) redirect('/?auth=login')
const brandingPromise = getCachedBranding()
const company = await getActiveCompany()          // <-- support-mode branch inserts BEFORE this
if (!company) redirect('/onboarding')
const activeCompanyId = company.id
const isDemo = isDemoCompany(activeCompanyId)
const supabase = await createClient()
const [branding, adminRow, billingRow, memberships, { data: userData }] = await Promise.all([...])
```
**Insertion point:** immediately after `claims` is resolved (Support Mode still requires the admin to be authenticated as themselves — `requireAdmin()` was already called at `startSupportSession` mint time, but `getSupportModeSession()`'s own re-check is what matters here), branch:
```typescript
const supportSession = await getSupportModeSession()
if (supportSession) {
  const company = await resolveSupportModeCompany(supportSession.companyId) // service-role read
  if (company) {
    // render with memberships=[], SupportModeBanner, skip isDemo/TrialBanner branches entirely
  }
  // if company resolution fails (deleted company mid-session), fall through to normal flow
}
// ...existing getActiveCompany() flow, completely unchanged
```
Per 151-UI-SPEC.md: Support Mode takes precedence over `DemoBanner`/`TrialBanner` — render only `SupportModeBanner` when a valid session exists, do not also evaluate `isDemo`/`trialDaysRemaining` in that branch.

### Anti-Patterns to Avoid
- **Wiring `getActiveCompanyId()` to be "support-mode aware":** would make every existing mutating server action reachable in an impersonated context. Explicitly forbidden by CONTEXT.md and confirmed correct by tracing the RLS-bound validation at `lib/queries/active-company.ts:57-69`.
- **Storing impersonation state in a DB row (a "current session" table):** CONTEXT.md requires nothing persists beyond the browser session — a DB-tracked "active impersonation" row would outlive cookie expiry and require its own cleanup/revocation logic. The audit log (already append-only, already exists) is the only persistent trace, by design.
- **Base64-only "signing" (no HMAC):** CONTEXT.md explicitly flags this — base64 is encoding, not authentication; anyone could forge a `{ adminUserId: <any-uuid>, companyId: <any-uuid> }` payload. The signature is the entire security boundary of SUPPORT-04.
- **Trusting the cookie's `adminUserId` without re-checking `platform_admins`:** a validly-signed cookie minted 90 minutes ago is stale evidence if the admin was deprovisioned in minute 89. Re-check on every read, exactly as `getAdminContext()`'s own doc comment warns against stale cached admin state.
- **Reusing/merging with `HandoffButton`/`admin-handoff.ts`:** explicitly a different feature (demo-to-prospect owner invite via real Supabase Auth invite email) — no code-sharing beyond both living under `app/admin/companies/`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tamper-evident payload signing | A custom checksum/encoding scheme | `node:crypto` `createHmac('sha256', ...)` + `timingSafeEqual` | Already the exact pattern proven correct and reviewed in this codebase (`lib/whatsapp/verify.ts`); Node's crypto module is audited, constant-time-safe when paired with `timingSafeEqual` |
| Constant-time string comparison | `signature === expected` | `timingSafeEqual(Buffer.from(a), Buffer.from(b))` with a length guard first | Naive `===` short-circuits on the first differing byte, leaking the secret via response timing (documented rationale already in `lib/auth/cron-auth.ts`'s own comment) |
| Admin re-authorization | Trusting a cookie claim of adminhood | Re-query `platform_admins` via `requireServiceClient()` on every read | Matches `getAdminContext()`'s exact security posture; a cookie can be valid-but-stale if admin status was revoked after signing |
| Cookie read/write plumbing | A middleware layer | `next/headers` `cookies()` inside server components/actions | This repo has zero `middleware.ts` — the established convention (see `active-company.ts`'s own doc comment) is cookie I/O inside RSC/server-action scope with the response's automatic Set-Cookie header |

**Key insight:** Every primitive this phase needs (signing, constant-time comparison, admin re-verification, cookie I/O, audit logging) already has a working, reviewed implementation elsewhere in this codebase. The task is composition and careful ordering, not invention.

## Common Pitfalls

### Pitfall 1: Verifying signature but forgetting to re-check expiry server-side on every read
**What goes wrong:** A cookie minted with `expiresAt` embedded in the signed payload is trusted forever if only the signature is checked and the `maxAge` on the cookie itself is relied upon as the sole expiry enforcement.
**Why it happens:** Cookie `maxAge` is a client-side hint (the browser deletes it, but nothing stops a replay of a captured cookie value after that point, or a browser that ignores expiry).
**How to avoid:** `getSupportModeSession()` must explicitly compare `payload.expiresAt` against `Date.now()` on every call, independent of the cookie's own `maxAge`. CONTEXT.md's decision #6(c) — "never writing the cookie with a maxAge beyond the signed expiresAt" — sets the cookie-level `maxAge` as a redundant courtesy expiry, not the enforcement mechanism.
**Warning signs:** If `getSupportModeSession()`'s implementation only calls the signature-verify function and returns its payload without an explicit `Date.now()` comparison, expiry is not actually enforced server-side.

### Pitfall 2: Rendering `SupportModeBanner` in a branch that still evaluates `isDemo`/`TrialBanner`
**What goes wrong:** If the Support Mode branch in `app/(app)/layout.tsx` still runs `isDemoCompany(activeCompanyId)` or the trial-days calculation against the IMPERSONATED company's data, a super admin could see a `TrialBanner` counting down the TENANT's trial, or (worse) if the impersonated company happens to be the demo company, could see `DemoBanner`'s "Create your account" CTA rendered stacked with or instead of `SupportModeBanner`.
**Why it happens:** Copy-pasting the existing `{isDemo && <DemoBanner />}` / `{trialDaysRemaining !== null && ... && <TrialBanner />}` lines into the new branch without realizing they were written assuming `company` came from `getActiveCompany()` (the viewer's own company).
**How to avoid:** 151-UI-SPEC.md is explicit: "Support Mode takes precedence... render only `SupportModeBanner` when a valid support session exists, skip `DemoBanner`/`TrialBanner` checks entirely in that branch." Structure the layout as a genuine if/else branch, not an accumulation of independent conditionals.
**Warning signs:** Any code path where both `SupportModeBanner` and `DemoBanner`/`TrialBanner` could theoretically render on the same page.

### Pitfall 3: Suppressing the switcher by passing `memberships={[]}` but not verifying `isAdmin`/`isDemo` props are still correct for the ADMIN's context, not the tenant's
**What goes wrong:** `Sidebar`'s `isAdmin` prop currently reflects whether the person viewing IS a platform admin (used to show "Add new company"). In the Support Mode branch this should still be `true` (they are the platform admin, just viewing a tenant) — but `isDemo` must reflect the TENANT's demo status if that's still meaningful, or be suppressed per UI-SPEC. Mixing up which identity (admin vs. tenant) each prop should represent is an easy copy-paste error.
**Why it happens:** The layout currently computes `isDemo`/`isAdmin` from a single identity (the signed-in user is both the auth subject AND the company member). In Support Mode these split: auth subject = admin, viewed company = tenant.
**How to avoid:** Explicitly re-derive each prop in the Support Mode branch rather than reusing variables computed for the normal flow. `isAdmin` should remain `true` (it's still the same admin user). Per CONTEXT.md decision #3, the ONLY explicitly required suppression is `memberships` — `isDemo`/`TrialBanner` are separately handled by the "skip entirely" rule in Pitfall 2, not by feeding them tenant data.
**Warning signs:** Any prop passed to `Sidebar`/`Topbar` in the Support Mode branch that was computed against the wrong identity.

### Pitfall 4: Forgetting `void` on the `logAdminAction()` call, or awaiting it in a way that blocks the redirect
**What goes wrong:** `logAdminAction()` is designed as best-effort/fire-and-forget (it never throws — see its own doc comment). Existing call sites (`app/admin/companies/actions.ts`) use `void logAdminAction({...})` specifically so a logging hiccup never blocks the actual action's success path or the subsequent `redirect()`.
**Why it happens:** It would be natural to `await` it "to be safe," but `redirect()` in a Next.js server action throws internally (via `NEXT_REDIRECT`) — if `logAdminAction` is awaited AFTER a `redirect()` call in the same function, that code never runs; if awaited BEFORE, it adds latency to the entry flow for no benefit given the function already swallows its own errors.
**How to avoid:** Follow the exact call-site convention already used for `company.set_model_override` etc.: `void logAdminAction({...})` immediately before or after the mutating step, then `redirect(...)`.
**Warning signs:** Any `await logAdminAction(...)` in the new code that isn't specifically needed to read a return value (it has none — it returns `Promise<void>`).

### Pitfall 5: Computing `durationSeconds` for the exit log using the wrong timestamp
**What goes wrong:** CONTEXT.md requires the exit log's metadata to include `{ durationSeconds: number }`. This must be `now - issuedAt` (from the signed payload, i.e., when the session actually started), not some other clock (e.g., time since the exit button was rendered, or since the current page load).
**Why it happens:** `endSupportSession()` needs to read the CURRENT cookie's `issuedAt` field before clearing it — if the cookie is cleared first and then duration is computed from a separately-stored value, there's a race/ordering bug.
**How to avoid:** `endSupportSession()` should call `getSupportModeSession()` (or re-verify+decode inline) FIRST to obtain `issuedAt`, compute `durationSeconds = Math.round((Date.now() - issuedAt) / 1000)`, log it, THEN clear the cookie.
**Warning signs:** `endSupportSession()` implementations that clear the cookie before reading its payload.

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new cookie, new module, new audit actions), not a rename/refactor/migration. No existing runtime state (stored data, live service config, OS-registered state, secrets, build artifacts) is being renamed or moved.

## Code Examples

### HMAC signature verification (existing, verified pattern to mirror exactly)
```typescript
// Source: lib/whatsapp/verify.ts (this repo, verbatim)
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = signature.slice('sha256='.length)
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  } catch {
    return false
  }
}
```

### Admin gate + re-verification (existing, verified pattern to mirror exactly)
```typescript
// Source: lib/auth/admin-context.ts (this repo, verbatim)
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims?.sub
  const email = (data?.claims?.email as string | undefined) ?? ''
  if (!userId) return null

  const svc = requireServiceClient()
  const { data: row } = await svc
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return row ? { userId, email } : null
})

export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext()
  if (!ctx) notFound()
  return ctx
}
```

### Best-effort audit logging call-site convention (existing, verified pattern to mirror exactly)
```typescript
// Source: app/admin/companies/actions.ts (this repo, verbatim excerpt)
void logAdminAction({
  actorId: ctx.userId,
  actorEmail: ctx.email,
  action: 'company.set_model_override',
  targetType: 'company',
  targetId: companyId,
  metadata: { model: value, previous },
})
```

### Cookie write inside a server action (existing pattern, `active-company.ts`'s convention)
```typescript
// Source: lib/queries/active-company.ts (this repo, verbatim excerpt — same cookies() API
// the new support-mode cookie will use)
export const ACTIVE_COMPANY_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
}
// ...
try {
  cookieStore.set(ACTIVE_COMPANY_COOKIE, fallback, ACTIVE_COMPANY_COOKIE_OPTIONS)
} catch {
  // Server Components without a writable response cannot set cookies; that's fine.
}
```
**Support-mode-specific adaptation:** `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, but `maxAge` must be derived from the remaining TTL (`expiresAt - issuedAt`), NOT a fixed 30-day constant — per CONTEXT.md decision #6(c).

### SupportModeBanner component (locked shape per 151-UI-SPEC.md, composing from `DemoBanner`'s exact structure)
```typescript
// Structural precedent — Source: components/demo/demo-banner.tsx (this repo, verbatim)
export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
      <Eye className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-center">
        You&apos;re viewing a read-only Xtimator demo with sample data.{' '}
        <form action={exitDemoToSignup} className="inline">
          <button type="submit" className="font-semibold underline underline-offset-2 hover:no-underline">
            Create your account
          </button>
        </form>{' '}
        to build real estimates.
      </span>
    </div>
  )
}
```
**SupportModeBanner target shape** (per 151-UI-SPEC.md Component Inventory, already locked — icon `ShieldCheck` not `Eye`, copy differs, exit action is `endSupportSession` not `exitDemoToSignup`):
```typescript
// components/admin/support-mode-banner.tsx (new)
<div className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
  <span className="text-center">
    Support Mode — viewing <strong>{companyName}</strong> as {adminEmail}.{' '}
    <form action={endSupportSession} className="inline">
      <button type="submit" className="font-semibold underline underline-offset-2 hover:no-underline">
        Exit Support Mode
      </button>
    </form>
  </span>
</div>
```

### Companies-list row action (locked shape per 151-UI-SPEC.md)
```typescript
// app/admin/companies/page.tsx — new row action, form-submit (server action), per UI-SPEC:
<form action={startSupportSessionAction}>
  <input type="hidden" name="companyId" value={c.id} />
  <button
    type="submit"
    className="inline-flex items-center gap-1 text-xs text-[hsl(var(--primary))] hover:underline font-medium"
  >
    <Eye className="h-3 w-3" />
    Support Mode →
  </button>
</form>
```
Row order (left to right, per UI-SPEC): `HandoffButton` (demo rows only) → **Support Mode →** (new) → `Configure →`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is a net-new capability | Signed session-claim impersonation (not real sign-in) | This phase (151) | Establishes the pattern for any future "act on behalf of" feature; future write-scoped impersonation (SUPPORTX-01) would extend `lib/auth/support-mode.ts`'s payload shape, not replace it |

**Deprecated/outdated:** Nothing in this codebase is being deprecated by this phase. `HandoffButton`/`admin-handoff.ts` remains a separate, unchanged, active code path.

## Open Questions

1. **Where exactly does the new `AuditAction` extension for support-mode live relative to the file's existing grouping?**
   - What we know: `lib/admin/audit-log.ts`'s `AuditAction` union is a flat list, loosely grouped by feature area (integration.*, ai_provider.*, company.*, tier.*, etc.) with no enforced alphabetical or category ordering.
   - What's unclear: Exact insertion point in the union (cosmetic only, no functional impact).
   - Recommendation: Add `'company.support_mode_start'` and `'company.support_mode_end'` adjacent to the existing `company.*` entries (`company.set_model_override`, `company.set_demo_quota`, `company.byok_enabled`, `company.byok_disabled`, `company.handoff`) for readability. Purely cosmetic — does not block planning.

2. **Exact signing key: reuse `APP_ENCRYPTION_KEY` directly, or derive a sub-key via HKDF?**
   - What we know: `APP_ENCRYPTION_KEY` is a 32-byte base64 key already used for AES-256-GCM (BYOK secrets). CONTEXT.md explicitly says "reuse the same env var / key-loading convention... rather than introducing a second secret."
   - What's unclear: Whether using the raw key bytes directly as the HMAC key (vs. deriving a distinct sub-key via HKDF, e.g. `createHmac('sha256', hkdfSync('sha256', key, salt, 'support-mode', 32))`) matters here.
   - Recommendation: Using the raw `APP_ENCRYPTION_KEY` bytes directly as the HMAC-SHA256 key is standard and safe — HMAC and AES-GCM are cryptographically distinct primitive families (MAC vs. AEAD), and using the same key material for both does not create a practical cross-primitive weakness in this threat model (the attacker who could exploit key reuse here would already need to have compromised the key itself, at which point both primitives are broken anyway). HKDF derivation is a defense-in-depth nicety, not a requirement; the planner can choose either without a security regression, but reusing the key directly is simpler and matches CONTEXT.md's explicit preference to avoid new env-var provisioning.

3. **Should `getSupportModeSession()` be wrapped in React `cache()` like `getAdminContext()` is?**
   - What we know: `getAdminContext()` uses React `cache()` specifically because it's called from multiple places within one request render (deliberately per-request memoized, NOT `unstable_cache` which would leak across users).
   - What's unclear: How many times `getSupportModeSession()` will actually be called per request in the final implementation (likely just once, from `app/(app)/layout.tsx`).
   - Recommendation: If `getSupportModeSession()` is only called once per request (from the layout), `cache()` wrapping is unnecessary overhead-avoidance for a call that isn't repeated. If a later plan step also needs to check it elsewhere in the same request (e.g., inside a page component), wrap it in `cache()` using the exact same rationale as `getAdminContext()` — per-request memoization, never `unstable_cache`. Leave this as an implementation-time decision; it does not change the phase's architecture.

## Environment Availability

This phase has no external service dependencies beyond what's already running in every other phase (Supabase, Node runtime). No new CLI tools, runtimes, or services are introduced.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `crypto` module | HMAC signing/verification | Yes (built-in) | Node 24.13.0 | — |
| Supabase service-role client | `platform_admins` re-check, service-role company read | Yes (already configured, `requireServiceClient()`) | — | — |
| `APP_ENCRYPTION_KEY` env var | Signing key material (if reused per recommendation) | Yes (already set — `lib/crypto/aes.ts` depends on it, `.env.example` documents it) | — | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (unit/integration), Playwright (e2e) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run tests/unit/admin --reporter=dot` (or a new targeted file, e.g. `tests/unit/support-mode.test.ts`) |
| Full suite command | `npm run test` (vitest run, all `tests/unit/**` + `tests/integration/**`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUPPORT-04 | Signed cookie: valid signature + unexpired + admin-still-in-platform_admins → returns session; any single failure → returns null | unit | `npx vitest run tests/unit/support-mode.test.ts` | ❌ Wave 0 |
| SUPPORT-04 | Tampered payload (flipped byte, wrong signature) is rejected | unit | `npx vitest run tests/unit/support-mode.test.ts -t "tamper"` | ❌ Wave 0 (same file) |
| SUPPORT-04 | Expired `expiresAt` is rejected even with a valid signature | unit | `npx vitest run tests/unit/support-mode.test.ts -t "expir"` | ❌ Wave 0 (same file) |
| SUPPORT-04 | Admin removed from `platform_admins` mid-session → session invalid on next read | unit | `npx vitest run tests/unit/support-mode.test.ts -t "revoked"` | ❌ Wave 0 (same file) |
| SUPPORT-03 | `startSupportSession` logs `company.support_mode_start`; `endSupportSession` logs `company.support_mode_end` with `durationSeconds` | unit | `npx vitest run tests/unit/support-mode.test.ts -t "audit"` | ❌ Wave 0 (same file) |
| SUPPORT-01 | `requireAdmin()` gate: non-admin caller cannot mint a support session | unit | `npx vitest run tests/unit/support-mode.test.ts -t "requireAdmin"` | ❌ Wave 0 (same file) |
| SUPPORT-01/02 | Non-admin visiting `/dashboard` with a forged/absent support cookie sees normal (unimpersonated) flow, unaffected | integration/e2e | `npx playwright test tests/e2e/admin-gate.spec.ts` (extend) or a new `tests/e2e/support-mode.spec.ts` | ❌ Wave 0 (new e2e file recommended, env-gated like `admin-gate.spec.ts`'s admin-positive test) |
| SUPPORT-02 | Banner renders with correct company/admin identity while impersonating; switcher (`memberships`) is suppressed | e2e (env-gated, mirrors `admin-gate.spec.ts`'s `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` pattern) | `npx playwright test tests/e2e/support-mode.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/support-mode.test.ts`
- **Per wave merge:** `npm run test` (full unit/integration suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`; e2e support-mode spec run manually or in CI if `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` are configured (mirrors existing `admin-gate.spec.ts` env-gating — the positive admin-path e2e test already skips gracefully when those env vars are absent).

### Wave 0 Gaps
- [ ] `tests/unit/support-mode.test.ts` — covers SUPPORT-01, SUPPORT-03, SUPPORT-04 (signature tamper/expiry/revocation, requireAdmin gate, audit log calls). Mock `next/headers` (`cookies`), `@/lib/supabase/service` (`requireServiceClient`), and `@/lib/admin/audit-log` (`logAdminAction`) exactly following the mocking convention already established in `tests/unit/active-company-helpers.test.ts` (see that file's `vi.mock('next/headers', ...)` + `makeCookieStore()` helper pattern — reuse the shape, not the specific assertions).
- [ ] `tests/e2e/support-mode.spec.ts` — covers SUPPORT-02 (banner visible + correct identity), switcher suppression, and exit flow. Mirror `tests/e2e/admin-gate.spec.ts`'s env-gating pattern (`test.skip(!adminEmail || !adminPassword, ...)`) since a real admin session is needed to exercise the entry point.
- No framework install needed — Vitest 4.1.4 and Playwright are already configured and used by sibling admin features (`tests/unit/admin/*.test.ts`, `tests/e2e/admin-*.spec.ts`).

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `lib/queries/active-company.ts` — cookie-based active-company resolver; RLS validation pattern traced line-by-line (lines 57-69 specifically, per CONTEXT.md's own citation, confirmed accurate)
- `lib/auth/admin-context.ts` — `requireAdmin()`/`getAdminContext()` gate + re-verification pattern
- `lib/crypto/aes.ts` — `APP_ENCRYPTION_KEY` key-loading convention, AES-256-GCM usage
- `lib/admin/audit-log.ts` — `AuditAction` union, `logAdminAction()` signature, best-effort/non-throwing design
- `lib/whatsapp/verify.ts` — existing `createHmac` + `timingSafeEqual` signature verification (direct precedent for the new signing code)
- `lib/auth/cron-auth.ts` — existing constant-time comparison convention with length-guard
- `app/(app)/layout.tsx` — exact current company/branding/memberships resolution order and prop-threading to `Sidebar`/`Topbar`
- `components/demo/demo-banner.tsx` — banner structural precedent (locked by 151-UI-SPEC.md as the shape to copy)
- `app/admin/layout.tsx` — existing "Super Admin Mode" banner (icon/color precedent)
- `app/admin/companies/handoff-button.tsx` + `app/admin/companies/actions.ts` — Dialog/server-action pattern, `logAdminAction` call-site convention (`void logAdminAction(...)`)
- `app/admin/companies/page.tsx` — current row-action markup/ordering to extend
- `components/app-shell/sidebar.tsx` + `components/app-shell/company-selector.tsx` — confirmed empty `memberships` array degrades gracefully (`active` resolves to `null`, UI shows `'?'`/"Select company" without crashing)
- `package.json` — confirmed no JWT library installed (`jose`/`jsonwebtoken`/`iron-session` absent); confirmed `zod ^4.3.6`, `next 16.2.6`, `react 19.2.4`, `vitest ^4.1.4`
- `supabase/migrations/20260518000001_admin_audit_log.sql` — `admin_audit_log` table schema (append-only, RLS-locked to service-role only)
- `supabase/migrations/20260519100002_fix_platform_admin_rls_recursion.sql` — confirms `platform_admins` RLS uses a SECURITY DEFINER helper (`is_platform_admin()`) to avoid recursion; relevant context for why the admin re-check goes through `requireServiceClient()` rather than the RLS-bound client
- `tests/unit/active-company-helpers.test.ts` — existing test-mocking convention for `next/headers` cookies + Supabase clients, to be mirrored by the new support-mode test file
- `tests/e2e/admin-gate.spec.ts` — existing env-gated admin e2e test pattern (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`)
- `vitest.config.ts` — test include globs, `server-only` aliasing convention
- `.planning/phases/151-super-admin-support-mode-tenant-impersonation/151-CONTEXT.md` — locked decisions (source of truth for architecture)
- `.planning/phases/151-super-admin-support-mode-tenant-impersonation/151-UI-SPEC.md` — locked visual/copy contract
- `.planning/REQUIREMENTS.md` — SUPPORT-01..04 definitions, v2 deferral (SUPPORTX-01), traceability table
- `.planning/config.json` — confirmed `workflow.nyquist_validation: true`

### Secondary (MEDIUM confidence)
None used — all findings were verifiable directly against this repository's own code, which is the highest-trust source for a repo-internal architectural composition task like this one.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; every primitive verified present and already in production use in this exact codebase
- Architecture: HIGH — CONTEXT.md's locked decisions were independently verified against the actual source files they reference (line numbers, function signatures, prop shapes all confirmed accurate)
- Pitfalls: HIGH — each pitfall traced to a specific, real interaction between the new code and existing code (e.g., `Sidebar`/`CompanySelector`'s null-handling, `logAdminAction`'s fire-and-forget design, `redirect()`'s throw-based control flow)

**Research date:** 2026-07-05
**Valid until:** 30 days (stable internal architecture; no external API/library version drift risk since no new dependencies are introduced)
