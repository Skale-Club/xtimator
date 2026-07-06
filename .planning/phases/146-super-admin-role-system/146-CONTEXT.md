# Phase 146: Super-Admin Role System - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire up the EXISTING `platform_admins` table + `requireAdmin()` helper to the
CompanySelector/Sidebar so the admin status is available where needed. Audit for
hardcoded email/user-ID auth checks and replace any found with the DB-driven lookup.
No new DB table needed — the infrastructure already exists.

</domain>

<decisions>
## Implementation Decisions

### Role system foundation
- **D-01:** The `platform_admins` table in Supabase ALREADY EXISTS — do NOT create a new `is_super_admin` column on `profiles`. Reuse the existing pattern.
- **D-02:** `requireAdmin()` in `lib/auth/admin-context.ts` ALREADY EXISTS and is the authority. Optionally alias it as `requireSuperAdmin()` for semantic clarity at call sites in v4.14 code, but do not duplicate the implementation.
- **D-03:** `isAdmin` is already computed in `app/(app)/layout.tsx` (line ~79) and passed to `<Topbar>`. It is NOT currently passed to `<Sidebar>`. The key work of this phase is passing `isAdmin` down to `<Sidebar>` → `CompanySelector`.

### Hardcoded email audit
- **D-04:** Run a static grep for hardcoded email addresses or user IDs used in authorization decisions. Replace any found with `requireAdmin()` calls. Expected: likely zero (the codebase already uses `platform_admins`), but verify.

### Admin activation
- **D-05:** Super-admins are activated by a direct Supabase `INSERT INTO platform_admins (user_id) VALUES (...)` from the Supabase dashboard. There is already an `/admin/admins` management page for this. No changes needed here.

### Claude's Discretion
- Whether to create a `requireSuperAdmin` alias or use `requireAdmin` directly — Claude picks the most readable approach for the new v4.14 call sites.
- Exact prop threading path through Sidebar → CompanySelector — Claude follows the existing component API patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing admin infrastructure
- `lib/auth/admin-context.ts` — the `requireAdmin()` / `getAdminContext()` implementation to reuse
- `lib/supabase/admin-gate.ts` — alternate admin gate utility
- `supabase/migrations/20260419000001_platform_admin.sql` — the `platform_admins` table schema + RLS
- `app/admin/admins/actions.ts` — how admins are added/removed via service role

### Layout wiring
- `app/(app)/layout.tsx` — where `isAdmin` is computed (line ~60-79) and passed to `<Topbar>` (line ~112). New: also needs to pass to `<Sidebar>`.
- `components/app-shell/sidebar.tsx` — the Sidebar component (does NOT receive `isAdmin` today)
- `components/app-shell/company-selector.tsx` — the CompanySelector component (has disabled "Add new company" item that needs the `isAdmin` gate)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` — `lib/auth/admin-context.ts`: already does the `platform_admins` lookup. The PRIMARY tool for phase 146.
- `getAdminContext()` — same file, React-cached version for read-only checks.
- `platform_admins` table — already has RLS policies for self-referential access control.

### Established Patterns
- `isAdmin` is computed server-side in `app/(app)/layout.tsx`, then passed as a prop to client components. Follow this same pattern for Sidebar/CompanySelector.
- `<Topbar isAdmin={isAdmin}>` — the reference pattern for how the prop is threaded.

### Integration Points
- `app/(app)/layout.tsx` → `<Sidebar>` prop addition
- `components/app-shell/sidebar.tsx` → `<CompanySelector>` prop addition
- `components/app-shell/company-selector.tsx` → conditional render of "Add new company"

</code_context>

<specifics>
## Specific Ideas

- The "Add new company" item in CompanySelector (line ~165-168) is currently always rendered but `disabled` with muted styling. In Phase 147 it will be removed from the DOM for non-admins. Phase 146 just needs to ensure `isAdmin` reaches CompanySelector so Phase 147 can use it.
- The user explicitly said "hidden for all normal users" — not CSS-hidden, removed from DOM.

</specifics>

<deferred>
## Deferred Ideas

- Future: a full admin management UI to add/remove admins without Supabase dashboard (already exists at `/admin/admins` — not in this phase's scope).
- Future: tiered admin roles (e.g., "sales rep" vs "super-admin") — deferred to v2.

</deferred>

---

*Phase: 146-super-admin-role-system*
*Context gathered: 2026-06-28*
