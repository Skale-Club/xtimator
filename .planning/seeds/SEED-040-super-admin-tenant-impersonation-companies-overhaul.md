---
id: SEED-040
status: dormant
planted: 2026-07-05
planted_during: v4.14 SEO Readiness (Phase 1001 wrap-up)
trigger_when: Now — next milestone. Live tenants (18+ companies) already need support, and the current Companies list doesn't scale.
scope: Large
---

# SEED-040: Super-Admin Tenant Impersonation + Companies Admin Screen Overhaul

## Why This Matters

Real tenants are on the platform now (18 companies in `admin/companies` today). Support and
troubleshooting currently requires querying the database directly or asking the tenant to
share their screen — there's no in-app way for the super admin to see and act on a tenant's
actual app view. Separately, the Companies admin list is a flat, unpaginated table with no
search or filtering — it already feels thin at 18 rows and won't scale as the tenant base
grows.

## When to Surface

**Trigger:** Now — next milestone. Live tenants (18+ companies) already need support, and
the current Companies list doesn't scale.

This seed should be presented during `/gsd:new-milestone` when the milestone scope matches
any of these conditions:
- Any milestone touching `/admin` tooling, support workflows, or tenant operations
- When the Companies list becomes hard to scan or manage (already true today)

## Scope Estimate

**Large** — two related but separable pieces:

### Part 1 — Super-Admin Tenant Impersonation ("Support Mode")

- From `app/admin/companies/[id]/page.tsx` (or the list row), add a "Support Mode" / "View
  as tenant" action that lets the super admin enter the normal app (`/dashboard`,
  `/projects`, etc.) scoped to that company, **without** needing the tenant's credentials.
- Must be clearly bannered while active — e.g. "Super Admin Mode — viewing {company}" —
  reusing the visual pattern of the existing "Super Admin Mode - skale.club@gmail.com"
  banner already shown across `/admin`, so there is never ambiguity about whose data is
  on screen.
- Every impersonated session **must** be audit-logged (who, which company, when, how long) —
  reuse [`lib/admin/audit-log.ts`](lib/admin/audit-log.ts).
- Needs a careful auth design: most likely a signed, time-boxed "acting-as company" claim/
  cookie layered on top of the admin's real session, rather than actually switching the
  Supabase auth identity — must stay RLS-safe, easily revocable, and never persisted beyond
  the session.
- **Not** the same as the existing [`HandoffButton`](app/admin/companies/handoff-button.tsx) —
  that sends a real owner-invite email to transfer a **demo** account to a prospect (a sales
  flow, backed by `lib/actions/admin-handoff.ts`). Support-mode impersonation is a distinct,
  audited, admin-eyes-only capability and must not be conflated with it.

### Part 2 — Companies Admin Screen Overhaul

- [`app/admin/companies/page.tsx`](app/admin/companies/page.tsx) today: one flat table, every
  company loaded at once, sorted by name only — no search, no filters, no pagination.
- Add: a search field (name/email), filters (tier, has AI model override, demo vs. real,
  activity/last-login), server-side pagination so the query doesn't load every tenant row
  at once as the base grows, and sortable columns.
- Keep the existing "Demo Accounts" vs. "All Companies" grouping and the
  HandoffButton/"Configure →" row actions — just make the underlying list scalable.

## Breadcrumbs

- [`app/admin/companies/page.tsx`](app/admin/companies/page.tsx) — the flat, unpaginated
  list that gets overhauled.
- [`app/admin/companies/[id]/page.tsx`](app/admin/companies/[id]/page.tsx),
  `company-byok-form.tsx`, `company-model-override-form.tsx`, `company-quota-form.tsx` —
  existing per-tenant admin detail page/forms; the natural home for a "Support Mode" entry
  point.
- [`app/admin/companies/handoff-button.tsx`](app/admin/companies/handoff-button.tsx) +
  `lib/actions/admin-handoff.ts` — the **existing, different** "hand off demo account to
  prospect" feature. Do not conflate with impersonation.
- [`lib/auth/admin-context.ts`](lib/auth/admin-context.ts) — `requireAdmin()` /
  `getAdminContext()`, the `platform_admins` gate this feature extends.
- [`lib/admin/audit-log.ts`](lib/admin/audit-log.ts) — existing audit-log helper to reuse for
  impersonation session logging.
- [`app/admin/companies/actions.ts`](app/admin/companies/actions.ts) — existing server-action
  pattern for the admin Companies surface.

## Related Seeds & Decisions

None directly — this is a net-new admin/ops-tooling capability, orthogonal to the billing
work in [[SEED-035-credit-based-subscription-billing]] and [[SEED-039-usage-progress-bar-dollar-topup]].

## Notes

The two parts are genuinely separable. If only one milestone slot is available, the
Companies list overhaul (search/filter/pagination) is the lower-risk, faster win and could
ship first as its own phase — with impersonation following as a security-sensitive phase
that deserves its own auth/session design review before implementation.
