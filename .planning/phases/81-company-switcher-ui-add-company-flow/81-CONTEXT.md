# Phase 81: Company Switcher UI + Add Company flow - Context

**Gathered:** 2026-05-26 (via `/gsd:discuss-phase 81 --auto` — recommended defaults locked)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 81 takes the multi-company plumbing shipped in Phase 79 (table + cookie + resolvers + `createOrUpdateCompany('add')` action) and surfaces it in the UI. After Phase 81, an owner of multiple companies can see and switch between them in-app, and add a brand-new company without going through a fresh signup flow.

**In scope:**
1. **Live company list query** — a server-side function `getMembershipCompanies()` that returns `{ id, name, logo_url }[]` for every `companies` row the signed-in user owns (joined via `company_members.user_id = auth.uid()`), sorted by `created_at ASC`.
2. **CompanySelector wired** — the existing stub at [components/app-shell/company-selector.tsx](components/app-shell/company-selector.tsx) (built in Phase 71, currently lists only the active company and has a non-functional "Add company" item) is replaced/extended to render the live list, mark the active one, and dispatch real actions.
3. **Mount CompanySelector in the sidebar** — currently the sidebar header shows static company name/logo via [components/app-shell/sidebar.tsx](components/app-shell/sidebar.tsx) (around lines 85, 350–359). Replace that static block with `<CompanySelector ... />` passing the live list + active id.
4. **Switch active company server action** — new `lib/actions/active-company.ts` exporting `switchActiveCompany(companyId: string)`. Validates the user has a `company_members` row for that id, writes `active_company_id` cookie via `ACTIVE_COMPANY_COOKIE_OPTIONS` from Phase 79, calls `revalidateTag('company')` + `revalidatePath('/', 'layout')`.
5. **"+ Add new company" wiring** — the dropdown's existing "Add company" item becomes a `<Link>` to `/onboarding?mode=add` (route already exists from Phase 79 onboarding work — onboarding flow reads `searchParams.mode` and passes `mode: 'add'` to `createOrUpdateCompany`).

**Out of scope (separate v4.0 phases — DO NOT touch here):**
- RLS rewrite of tenant-scoped tables (projects/clients/estimates/etc. still gate by `companies.user_id IN (...)` — that's a follow-up phase)
- Billing per-company semantics (tier/trial clock still per-user; the `tier_trial_ends_at` inheritance from Phase 79 D-14/D-15 stays in place but isn't exercised yet)
- Server-action sweep (~20 server actions in `lib/actions/*.ts` still derive company_id from `claims.sub` — that's another follow-up phase)
- Inviting other users to existing companies (Admin/Member roles — v5+ scope)
- Switching by URL (e.g. `/c/{slug}/dashboard`) — cookie-only is correct for v4.0
- Multi-region / cross-account onboarding flows

</domain>

<decisions>
## Implementation Decisions

### Existing Assets (Phase 71 + Phase 79)
- **SWITCH-01:** The `<CompanySelector>` component at [components/app-shell/company-selector.tsx](components/app-shell/company-selector.tsx) already has the visual shell — dropdown trigger with avatar + name + chevron, glassmorphism-styled `<DropdownMenuContent>`, "Companies" label, item-with-check pattern, "Add company" item. The Phase 81 work is to make it real, not redesign. Keep the visual identity intact.
- **SWITCH-02:** Phase 79's helpers — `getActiveCompanyId()`, `getActiveCompany()`, `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS` from [lib/queries/active-company.ts](lib/queries/active-company.ts) — are the source of truth for the cookie. Phase 81 server actions read/write via these constants; do NOT redefine the cookie name or options anywhere.
- **SWITCH-03:** `createOrUpdateCompany(input, 'add')` from [lib/actions/company.ts](lib/actions/company.ts) handles new-company creation + member insert + cookie write atomically. Phase 81's "Add company" path routes to `/onboarding?mode=add` which already wires this. Do NOT call `createOrUpdateCompany` directly from the switcher — go through the onboarding flow so all logo upload / validation / industry pickers still apply.

### Live Company List
- **SWITCH-04:** Add `getMembershipCompanies(): Promise<{ id, name, logo_url }[]>` to [lib/queries/active-company.ts](lib/queries/active-company.ts) (same file as Phase 79's helpers — they belong together). Reads `companies` joined to `company_members` on `company_members.user_id = auth.uid()`, ordered by `companies.created_at ASC`. Uses the request-scoped Supabase client (no `requireServiceClient`) — RLS on `company_members` from Phase 79 D-03 already scopes it correctly.
- **SWITCH-05:** When the list has only **one** company, the `CompanySelector` still renders (sidebar always shows it), but the dropdown is rendered as a non-interactive label area + "+ Add new company" item only — no "Switch" affordance (nothing to switch to). The trigger button still opens the dropdown; the only available action is Add. This avoids a different UI for the single-company case (which is the majority pre-launch).

### Switch Action
- **SWITCH-06:** New server action file: `lib/actions/active-company.ts`. Export `switchActiveCompany(companyId: string): Promise<{ ok: true } | { error: string }>`. Steps:
  1. `getClaims()` for current user; reject `unauthenticated` if no session.
  2. Query `company_members` to confirm `(user_id = claims.sub, company_id = input)` exists. If not, return `{ error: 'forbidden' }` (never reveal whether the company exists or not).
  3. `cookies().set(ACTIVE_COMPANY_COOKIE, companyId, ACTIVE_COMPANY_COOKIE_OPTIONS)`.
  4. `revalidateTag('company')` so `unstable_cache` in the layout invalidates.
  5. `revalidatePath('/', 'layout')` so the entire app shell re-renders against the new active company.
  6. Return `{ ok: true }`.
- **SWITCH-07:** The CompanySelector calls `switchActiveCompany` via `useTransition` for pending UX. While pending, the clicked item shows a small spinner replacing its checkmark; the trigger button is disabled. On success, the dropdown closes; the page revalidates and the new active company renders.
- **SWITCH-08:** On `forbidden` error (rare — stale dropdown state), the selector closes the dropdown and shows a `toast.error('You no longer have access to that company.')` via `sonner` (existing app pattern). Local state then refetches via `router.refresh()` so the dropdown reflects current membership.
- **SWITCH-09:** Clicking the **already-active** company is a no-op — the menu closes silently without firing the server action. Detection: the item passes `isActive` as a prop and the click handler short-circuits when true.

### Add Company Flow
- **SWITCH-10:** The "+ Add new company" dropdown item is a `<Link href="/onboarding?mode=add" prefetch>` (NOT a server action). Routing instead of action because:
  1. Onboarding owns logo upload, industry picker, validation — replicating that UI in a dropdown would bloat scope.
  2. The user is leaving the dropdown surface anyway; a route navigation is the right interaction model.
- **SWITCH-11:** The onboarding page at [app/onboarding/page.tsx](app/onboarding/page.tsx) (or equivalent) reads `searchParams.mode` and, when `mode === 'add'`, passes `mode: 'add'` to `createOrUpdateCompany`. If the onboarding page doesn't currently read `searchParams.mode`, that wiring is part of THIS phase (it was scoped to Phase 79 but Phase 79 only added the action signature, not the page-level wiring — confirm during planning).
- **SWITCH-12:** Visual identity of the "Add" item: keep the existing icon (`Building2`) + label "Add new company" (extending the current stub copy "Add company"). When the user has zero companies (shouldn't happen post-onboarding but be defensive), the dropdown shows only this item.

### Mount in Sidebar
- **SWITCH-13:** Replace the static company-header block in [components/app-shell/sidebar.tsx](components/app-shell/sidebar.tsx) (around lines 350–359, where `company.logo_url`/`company.name` currently render) with `<CompanySelector companies={list} activeCompanyId={active.id} />`. The data (`list`, `active.id`) is fetched in the server-side parent (the layout in `app/(app)/layout.tsx` already calls `getActiveCompany()` — extend it to also call `getMembershipCompanies()` and pass both to the sidebar).
- **SWITCH-14:** The collapsed sidebar state (icon-only) shows the active company's avatar as the dropdown trigger (no name, no chevron — just a clickable avatar that opens the same dropdown). This matches the existing collapsed-sidebar pattern (line 350 today renders the avatar in collapsed mode and full info in expanded mode).
- **SWITCH-15:** Mobile: the existing `mobile-header.tsx` does NOT currently show a company switcher. For v4.0 scope, leave mobile unchanged in this phase — the dropdown is desktop/tablet-only (`sm:flex` on the trigger). A follow-up phase can add it to mobile if user feedback warrants. (NOTE: Phase 81 still ships the live list + switch action — only the placement on mobile is deferred.)

### Tests
- **SWITCH-16:** Unit tests are mandatory for:
  - `getMembershipCompanies()` — filters by `user_id`, orders by `created_at ASC`, returns shape `{ id, name, logo_url }[]`.
  - `switchActiveCompany()` — three branches: success (sets cookie + revalidates), forbidden (no membership row), unauthenticated.
- **SWITCH-17:** Static-contract test on the `CompanySelector` import graph (Phase 79 pattern — read source file with `fs` + regex assert): the component must import `useTransition`, `switchActiveCompany`, and reference `ACTIVE_COMPANY_COOKIE` only via Phase 79's exports (never hardcode `'active_company_id'`).
- **SWITCH-18:** No E2E / browser test in this phase. The HUMAN-UAT will cover the cookie write + revalidation composition (same pattern Phase 79 used — exactly the kind of test that unit/contract layers can't assert).

### Project Instructions Compliance
- **SWITCH-19:** TypeScript strict, server-side queries use `getClaims()` + the request-scoped client (no service role exposed to browser). Cookie write happens server-side in the action. No new env vars. No new dependencies — the dropdown, avatar, sonner, and link primitives are all already in the project.

### Claude's Discretion
- Exact placement of `getMembershipCompanies()` in `lib/queries/active-company.ts` (top of file vs bottom — planner can pick).
- Whether `switchActiveCompany` lives in `lib/actions/active-company.ts` or in `lib/actions/company.ts` alongside `createOrUpdateCompany` (planner can pick; the CONTEXT recommends a new file but a single existing file is fine too).
- Whether to extend the existing `<CompanySelector>` in-place (preserving the prop name `company` for backwards-compat) or to break the prop API to `companies + activeCompanyId`. Recommendation: break the API — the orphaned component has zero current callers (verified via grep) so there's no migration cost.
- Loading skeleton shape for the pending-switch state (planner can pick — sonner toast vs inline spinner vs full-shell skeleton).
- Whether the dropdown auto-closes after a successful switch (recommended: yes) or stays open showing the new active highlight (less common UX).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Direction
- `.planning/PROJECT.md` §"Current Milestone: v4.0 Multi-Tenancy" — v4.0 locked decisions and target features
- `.planning/STATE.md` — Phase 81 added 2026-05-26, follows directly on Phase 79's foundation slice
- `.planning/ROADMAP.md` §"Phase 81: Company Switcher UI + Add Company flow" — Goal + out-of-scope items

### Phase 79 Outputs (the foundation this phase builds on — REQUIRED READING)
- `.planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-CONTEXT.md` — D-01..D-16 decisions: schema shape, cookie name, fallback resolution, `mode: 'add'` semantics, tier inheritance
- `.planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-VERIFICATION.md` — verifier's confirmation that the helpers and table are live
- `lib/queries/active-company.ts` — `getActiveCompanyId`, `getActiveCompany`, `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS` (Phase 79 output — DO NOT redefine)
- `lib/actions/company.ts` — `createOrUpdateCompany(input, mode)` with `mode: 'add'` branch (Phase 79 output — Phase 81 routes to this via /onboarding?mode=add, does NOT call directly)
- `supabase/migrations/20260525000001_phase79_company_members.sql` — table shape, RLS policy, idempotent backfill

### Existing UI Surface (Phase 71 — Glassmorphism redesign)
- `components/app-shell/company-selector.tsx` — visual stub from Phase 71; THIS is the component Phase 81 wires up
- `components/app-shell/sidebar.tsx` lines 350–359 — current static company header block that becomes the CompanySelector mount point
- `components/ui/dropdown-menu.tsx`, `components/ui/avatar.tsx` — shadcn primitives the selector already uses

### Database Schema
- `types/database.types.ts` §company_members (~line 319) — Row/Insert/Update shapes (Phase 79 output)
- `supabase/migrations/20260409000001_initial_schema.sql` — original `companies` table; `companies.user_id` retained for now (Phase 79 D-04)

### App Conventions to Follow
- `lib/queries/auth.ts` — `getCachedCompany` (Phase 79 D-10: still exported, not removed; reference for cache key + tag patterns)
- `app/(app)/layout.tsx` — already calls `getActiveCompany()`; Phase 81 extends to also call `getMembershipCompanies()`
- `lib/actions/project.ts` or `lib/actions/client.ts` — reference shape for server actions returning `{ ok }` / `{ error }` discriminated unions
- `sonner` — global `<Toaster />` already mounted; import `toast` from `sonner` for error messages

</canonical_refs>

<deferred>
## Deferred Ideas (for later phases / backlog)

- **Mobile company switcher** — Phase 81 ships desktop/tablet only. A follow-up can add it to `mobile-header.tsx` once user feedback says they're switching companies on the go (rare for the target persona — service business owner at job site is unlikely to be on multiple companies).
- **URL-based company scoping** — e.g. `/c/{slug}/dashboard` for shareable per-company URLs. Out of scope for v4.0; cookie is sufficient. Worth revisiting if owners start sharing links cross-company.
- **Recent-company shortcuts** — keyboard shortcut to switch to "previous company" (like Slack's `Cmd+T`). Nice-to-have but not in v4.0 scope.
- **Inviting other users to a company** — entire Admin/Member tier work. Locked out of v4.0 in PROJECT.md "Locked decisions" section.
- **Cross-company analytics** — admin panel showing aggregated stats across a user's companies. Not on the v4.0 radar.

</deferred>

<auto_mode_log>
## Auto-Mode Selection Log

This CONTEXT was generated with `/gsd:discuss-phase 81 --auto`. The following choices were locked at recommended defaults; revisit any of them via `/gsd:plan-phase 81 --replan-context` if needed.

- **Dropdown placement:** sidebar (replacing existing static company header block) — chosen over topbar because the existing CompanySelector stub from Phase 71 was already designed for that slot.
- **Single-company UX:** dropdown still renders, with only "+ Add new company" — chosen for uniform UI across 1-company vs N-company users.
- **Switch interaction:** instant switch with `useTransition` pending state — chosen over confirm-dialog because the action is reversible (switch back from the same dropdown).
- **Add Company entry:** route to `/onboarding?mode=add` — chosen over inline form because onboarding owns logo upload + industry picker; replicating in a dropdown is scope creep.
- **Cache invalidation:** both `revalidateTag('company')` AND `revalidatePath('/', 'layout')` — belt-and-suspenders for the layout-level swap.
- **Error handling:** toast on forbidden — chosen over redirect-to-error-page because the error is recoverable (refetch and try again).
- **Mobile:** deferred — chosen because the target persona is desktop-first and mobile would expand scope significantly.
- **Tests:** unit + static-contract only, no E2E — matches Phase 79 pattern, defers composition testing to HUMAN-UAT.

</auto_mode_log>
