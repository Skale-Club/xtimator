# Phase 151: Super-Admin Support Mode (Tenant Impersonation) - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended). This phase is security-sensitive, so the decisions below are deliberately locked and specific rather than left to broad discretion — they exist to prevent a well-intentioned implementation from accidentally building a full read-write identity switch when a scoped, audited, view-only capability was asked for.

<domain>
## Phase Boundary

The super admin can enter a normal, tenant-scoped **read/view** of any company directly from the Phase-150 Companies screen, without the tenant's credentials — under a persistent banner, fully audit-logged, via a signed time-boxed session claim. This phase does NOT touch `app/admin/companies/[id]/page.tsx`'s existing forms, does NOT modify `getActiveCompanyId()`/`getActiveCompany()` (lib/queries/active-company.ts) or any existing mutating server action, and does NOT reuse or merge with `HandoffButton`/`admin-handoff.ts` (a different feature — demo-account-to-prospect owner invite).

</domain>

<decisions>
## Locked Architecture (non-negotiable — read before implementing)

### Why `getActiveCompanyId()` must NOT be touched
That helper validates the `active_company_id` cookie against the CALLER'S OWN `company_members` row via the RLS-bound client (`lib/queries/active-company.ts:57-69`) — a super admin viewing a tenant they don't belong to will correctly fail that check. Making it "support-mode aware" would mean EVERY existing mutating server action in the entire app (all of which resolve company via this helper) suddenly becomes reachable in an impersonated context — a huge, unrequested blast-radius increase. Do not go there.

### The scoped alternative: a separate, view-only resolution path
1. **New signed session claim** (NOT a real Supabase sign-in): a dedicated httpOnly cookie (e.g. `support_mode_session`), value = an HMAC-signed payload `{ adminUserId, companyId, issuedAt, expiresAt }` (reuse `lib/crypto/aes.ts`'s key-loading convention or Node's `crypto.createHmac` with `APP_ENCRYPTION_KEY` — Claude's discretion on exact signing primitive, but it MUST be tamper-evident, not just base64). Short TTL (recommend 1-4 hours; Claude's discretion on exact value, but it must be enforced server-side on every read, not just at mint time).
2. **`lib/auth/support-mode.ts`** (new): `startSupportSession(companyId)` — `requireAdmin()`-gated server action, mints the signed cookie, calls `logAdminAction({action: 'company.support_mode_start', targetType:'company', targetId: companyId})`. `getSupportModeSession()` — reads + verifies the cookie signature AND expiry AND re-verifies the `adminUserId` is STILL a real row in `platform_admins` (never trust the cookie's claim alone — mirrors the `getAdminContext()` doc comment's own warning about stale cached admin state). Returns `{ adminUserId, companyId } | null`. `endSupportSession()` — clears the cookie, logs `'company.support_mode_end'` with the session duration in metadata.
3. **`app/(app)/layout.tsx` integration:** check `getSupportModeSession()` FIRST. If present and valid: resolve the viewed company via `requireServiceClient().from('companies').eq('id', session.companyId).single()` (service-role read — the admin has no real membership row, so this must NOT go through the RLS-bound client or `getActiveCompanyId()`). Render `<SupportModeBanner company={...} />` (see below) and pass that resolved company through the SAME props the layout already threads to `Sidebar`/`Topbar`/children. **Suppress the company switcher** (`memberships` prop) while in Support Mode — a super admin viewing tenant X must not be offered a dropdown to hop to tenant Y as if they were a real member of either. If no valid session: proceed exactly as today (unchanged).
4. **Scope is READ/VIEW ONLY for v1** (matches SUPPORT-01's literal wording "enter a normal, tenant-scoped app view" and REQUIREMENTS.md's `SUPPORTX-01` v2 deferral of "write actions"). Do NOT wire support-mode awareness into any mutating server action. If a super admin clicks a mutating button while impersonating, the existing code paths behave exactly as they do today (they resolve the ADMIN's OWN real active company via the untouched `getActiveCompanyId()`) — a confusing but SAFE failure mode, never a cross-tenant write. This is intentional and must not be "fixed" by wiring mutations through the support-mode cookie — that is explicitly out of scope (SUPPORTX-01).
5. **Exit:** a visible "Exit Support Mode" action (in the banner, mirroring the pattern below) calls `endSupportSession()` and redirects back to `/admin/companies`.
6. **Auto-revocation:** enforced by (a) the cookie's own expiry, (b) the re-verification in step 2 failing if the admin is ever removed from `platform_admins` mid-session, (c) never writing the cookie with a `maxAge` beyond the signed `expiresAt`. Nothing persists beyond the browser session by design (short-lived httpOnly cookie, no DB row tracking "current" impersonation state beyond the audit log).

### Banner — mirror `components/demo/demo-banner.tsx` exactly
That component is the PRECEDENT: fixed bar, `border-b border-primary/20 bg-primary/10`, an icon (use `ShieldCheck` or `Eye` — Claude's discretion, `ShieldCheck` mirrors the existing `/admin` "Super Admin Mode" banner's icon for visual continuity), centered text, and a `<form action={...}><button>` inline exit CTA (mirrors `exitDemoToSignup`). Copy: something like `"Support Mode — viewing {companyName} as {adminEmail}. "` + an inline "Exit Support Mode" button. Do not build a new banner pattern from scratch.

### Entry point (from Phase 150)
On the Companies list (Phase 150's overhauled table), add a "Support Mode →" (or similar) row action next to the existing "Configure →" link, calling `startSupportSession(companyId)` then redirecting to `/dashboard`. Claude's discretion on exact icon/copy, but it must be visually distinct from `HandoffButton` and `Configure →` so an admin cannot confuse "view as tenant" with "invite this prospect" or "edit AI override".

### Audit logging (SUPPORT-03)
Extend `lib/admin/audit-log.ts`'s `AuditAction` union with `'company.support_mode_start'` and `'company.support_mode_end'`. Metadata for start: `{}`  (targetId already carries the company). Metadata for end: `{ durationSeconds: number }`. This is the ONLY new audit-log surface this phase needs — reuse `logAdminAction()` verbatim, do not build a parallel logging mechanism.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [`app/admin/layout.tsx`](../../../app/admin/layout.tsx) — the EXACT "Super Admin Mode" banner markup/styling to echo (ShieldCheck icon, `bg-[hsl(var(--primary)/0.12)]` bar) for visual family resemblance in the tenant-side `SupportModeBanner`.
- [`components/demo/demo-banner.tsx`](../../../components/demo/demo-banner.tsx) — the PRECEDENT for a fixed, exit-CTA-bearing informational banner in the (app) shell — copy this shape, not the demo copy.
- [`lib/queries/active-company.ts`](../../../lib/queries/active-company.ts) — read-only reference for the cookie-based resolution pattern; explicitly NOT to be modified (see locked decisions above).
- [`lib/admin/audit-log.ts`](../../../lib/admin/audit-log.ts) — `logAdminAction()` + `AuditAction` union to extend.
- [`lib/auth/admin-context.ts`](../../../lib/auth/admin-context.ts) — `requireAdmin()`/`getAdminContext()` — the gate `startSupportSession` must call FIRST, and the `platform_admins` re-check pattern `getSupportModeSession()` must repeat (never trust a cached/cookie claim of adminhood alone).
- [`lib/crypto/aes.ts`](../../../lib/crypto/aes.ts) — existing `APP_ENCRYPTION_KEY`-based crypto primitives; reuse the same env var / key-loading convention for signing the support-mode cookie rather than introducing a second secret.

### Established Patterns
- Cookie writes happen inside server components/actions and rely on Next's `cookies()` + response Set-Cookie — no middleware layer (mirrors `active-company.ts`'s own note).
- Every admin-gated action calls `requireAdmin()`/`requireServiceClient()` — never trusts a client-supplied id.

### Integration Points
- `app/(app)/layout.tsx` — the single insertion point for the support-mode check + banner + switcher suppression.
- Phase 150's Companies list — the entry-point button.

</code_context>

<specifics>
## Specific Ideas

No new UI language — the banner mirrors `DemoBanner`, the admin identity styling mirrors the existing `/admin` "Super Admin Mode" bar. This phase is about correct, safe plumbing more than new visual design.

</specifics>

<deferred>
## Deferred Ideas

- Support Mode WRITE actions (SUPPORTX-01, v2) — deliberately out of scope; see locked decision #4 above for why this must not be silently implemented anyway.
- A dedicated "impersonation history" admin view (browsing past Support Mode sessions from the audit log) — not required by SUPPORT-03 (which only requires the sessions ARE logged, not a dedicated browsing UI); the existing audit log storage is sufficient for v1.

</deferred>
