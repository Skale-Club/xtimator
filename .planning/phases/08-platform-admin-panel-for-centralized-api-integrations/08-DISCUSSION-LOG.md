# Phase 8: Platform admin — integrations & branding — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 08-platform-admin-panel-for-centralized-api-integrations
**Areas discussed:** Secret storage, Super-admin bootstrap, Branding scope, Auth visual pass
**Mode:** User selected "do recommended settings" — Claude applied recommended default for each area and logged inline.

---

## Secret storage

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Vault (pgsodium) | Purpose-built secret vault, separate schema, audit-grade. Requires enabling extension and using `vault.create_secret()` / `vault.decrypted_secrets`. | |
| App-layer AES-256-GCM with `APP_ENCRYPTION_KEY` env | Standard Node crypto, one env var, encrypt at write, decrypt on read in server loader. Rotation = re-encrypt pass then flip env. | ✓ |
| Plaintext DB + super-admin RLS | Simplest, assumes DB-read == full compromise anyway. No defense-in-depth. | |

**User's choice:** Auto-recommended (user said "do recommended settings").
**Rationale:** 3 low-rotation keys don't justify Vault's operational overhead. AES-256-GCM at app layer + RLS + Supabase's native at-rest encryption = defense-in-depth without pgsodium complexity.

---

## Super-admin bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| `is_platform_admin` boolean on `profiles` | Simple. But: project has no `profiles` table (confirmed from migration `20260409000001`). Would require adding one just for this. | |
| Separate `platform_admins` table | Orthogonal to tenant roles, single-purpose. Bootstrap via one-time SQL in Supabase editor. | ✓ |
| Env allowlist (`PLATFORM_ADMIN_EMAILS`) | Zero DB change. But brittle (re-deploy to change admins) and easy to misconfigure. | |
| `auth.users.raw_app_meta_data` flag | No new table. But couples role to Supabase auth internals and makes queries clunky. | |

**User's choice:** Auto-recommended.
**Rationale:** Separate table is forge-proof (requires DB access to seed), keeps role model clean, and scales trivially to `/admin/admins` UI for adding more.

---

## Branding scope

| Option | Description | Selected |
|--------|-------------|----------|
| Platform-global only | Every brand surface (tenant-facing and client-facing) driven by platform_branding. Removes per-company customization. Contradicts existing `companies.brand_primary_color`. | |
| Platform-global for chrome, company-scoped for customer artifacts | Tenant sees platform brand (auth, app shell, platform emails). Client sees company brand (PDFs, share pages, company-originated emails). | ✓ |
| Platform-global + tenant override fallback | Tenants can override platform brand for their own chrome. Complex; blurs the shared-SaaS model. | |

**User's choice:** Auto-recommended.
**Rationale:** Clear boundary rule — "whose eyes see it." Preserves already-shipped per-company brand work (Phase 2), avoids double-rendering logic, matches shared-SaaS platform intent.

---

## Auth visual pass

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (strings only) | Swap "Xtimator" → DB value. No visual change. | |
| Refreshed dark card, auth-only | Dark background + card on `(auth)/*` route group only. Tenant app stays light. Accent uses platform `primary_color`. | ✓ |
| Full platform dark theme | Global dark mode applied app-wide. Contradicts V2-06. | |

**User's choice:** Auto-recommended.
**Rationale:** User requested dark mode specifically for login. Scoping it to auth route group preserves V2-06 (global toggle deferred) and delivers the visual refresh the rebrand deserves without touching the main app.

## Claude's Discretion

- Shadcn dark palette pick (zinc vs slate vs neutral) — planner chooses based on platform `primary_color`.
- "Test" button inline vs toast feedback — either works.
- Branding live preview: iframe vs styled div — planner decides.
- Whether to precompute `vault.decrypted_secrets` view vs Node decrypt — Node decrypt recommended (keeps key material out of postgres logs).
- Migration file naming scheme follows existing pattern (`YYYYMMDDHHMMSS_description.sql`).

## Deferred Ideas

- Per-tenant BYO API keys (v2 enterprise upsell)
- Admin metrics / usage dashboard (own phase)
- Feature flags / kill switches (own phase)
- Multi-role admin (support vs billing admins)
- Global dark-mode toggle for main app (V2-06)
- Audit log (updated_by/updated_at stub already in schema for future hook-up)
