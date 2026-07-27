# Phase 181: Real-Product Cutover & Verification - Research

**Researched:** 2026-07-27
**Domain:** Next.js App Router UI-surface gating (settings-tab presentation), landing-CTA cutover, dead-route removal, and Playwright cross-viewport verification — consuming Phase 180's already-shipped isolation/deny-write mechanism, not extending it
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Demo data readiness (PARITY-02)
- **D-13:** Reuse the existing `scripts/seed-demo-workspace.mjs` against the same `DEMO_COMPANY_ID` (`0000de00-0000-0000-0000-000000000001`) Phase 180's `demo_config` registry already points at — do not build a new seeding mechanism.
- **D-14:** Verification step confirms the demo company already has representative projects/clients/price-book/estimates (it should, since the standalone `/demo` has been live); if any surface is sparse, re-run the seed script (service-role, bypasses RLS by design) rather than hand-inserting rows.

#### Exposed settings surfaces (PARITY-02)
- **D-15:** "Settings surfaces intentionally exposed to the demo" means the tabs that make sense read-only for a prospect exploring the product: Company profile, Team, Notifications, Price Book (already a core nav item, not under Settings). Billing, Stripe Connect/payments, WhatsApp/Telegram admin registry, and integration API-key tabs are NOT exposed (they reference real payment/credential setup that has no meaning for an anonymous demo visitor and would be confusing noise, not a parity gap).
- **D-16:** Hidden settings tabs are hidden from demo nav entirely (not shown-then-blocked) — consistent with the existing `isDemo` conditional pattern already used for `ChatBubble` in `app/(app)/layout.tsx:257`.

#### Cutover mechanism (CUTOVER-01)
- **D-17:** The three landing "See Demo" links (`components/landing/hero-section.tsx`, `final-cta-section.tsx`, `landing-footer.tsx`) change from `href="/demo"` to the apex handoff `href="/demo/entry"`.
- **D-18:** After the verification gate passes, delete the standalone pages under `app/demo/` — `page.tsx`, `layout.tsx`, `dashboard/`, `clients/`, `projects/`, `price-book/` (and their `loading.tsx` siblings). **Do not touch** `app/demo/entry/route.ts` — that is Phase 180's handoff route and stays.
- **D-19:** No redirect shim is added at the old `/demo` path after removal — `/demo` (the old index) simply 404s once its `page.tsx` is deleted, since every real entry point (landing CTAs) is updated in the same change to point at `/demo/entry` instead.

#### Documentation (CUTOVER-02)
- **D-20:** Update the existing `DEMO-WORKSPACE.md` in place (it already documents the demo company/seed script but describes the pre-Phase-180 standalone architecture) rather than creating a parallel doc. Rewrite it to describe: the host-isolated flow (apex `/demo/entry` → `demo.<host>/demo/entry` → `/dashboard`), the `DEMO_APP_ORIGIN` env var, production DNS/Coolify domain setup for `demo.xtimator.com`, the Supabase Auth redirect allow-list entries needed, and local dev setup (`demo.localhost:<port>`) — explicitly noting production is Coolify, not Vercel, per project convention.

### Claude's Discretion
- Exact wording/layout of the updated DEMO-WORKSPACE.md sections.
- Whether hidden-for-demo settings tabs are filtered in the tab list component itself or at the route level (whichever matches the existing `isDemo` wiring pattern with the least code change).
- Order of implementation waves (data verification, settings gating, then cutover+docs is the natural dependency order, but the planner has discretion).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope (auto mode, no interactive scope-creep surfaced).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARITY-01 | A demo visitor sees the same authenticated app layout, navigation, responsive behavior, components, and styling used by a real tenant. | The demo's ONLY current layout divergence is `app/(app)/settings/layout.tsx`, which substitutes a bespoke single-form view instead of the real `SettingsLayoutClient`/`SettingsNav` rail — this must be removed in favor of the real tab layout, filtered. Every other real-product surface (dashboard/projects/clients/price-book, Sidebar/Topbar/BottomNav/MobileHeader) already renders unmodified for `isDemo` sessions. [VERIFIED: `app/(app)/settings/layout.tsx`, `app/(app)/layout.tsx`, `components/app-shell/*`] |
| PARITY-02 | The demo visitor can navigate the core read surfaces — dashboard, projects, clients, price book, estimates, and settings surfaces intentionally exposed to the demo — using the deterministic demo tenant's data. | Dashboard/projects/clients/price-book are already reachable and un-gated (no `demoHidden` flag). "Estimates" is not a separate route — it is the estimate view nested inside `/projects/[id]`; no additional route exists to gate. Settings currently has ZERO reachable entry point for demo sessions (both the desktop and mobile account-menu "Settings" links are wrapped in `{!isDemo && ...}`) — this must be reversed, and the tab list filtered to Company/Team/Notifications. [VERIFIED: `components/app-shell/nav-items.ts`, `components/app-shell/sidebar.tsx:112`, `components/app-shell/mobile-account-menu.tsx:83`, `components/settings/settings-nav.tsx`] |
| PARITY-03 | The shared app shell visibly identifies demo/read-only mode and removes or disables controls that would otherwise initiate a mutation or paid/external side effect. | `DemoBanner` already renders shell-wide. Within the 3 newly-exposed settings tabs, mutation controls need explicit disabling: `CompanyInfoForm` already has a `readOnly` prop (`fieldset disabled={readOnly}`) — reuse directly. `TeamSection` already gates its Invite/Remove/Promote buttons behind an existing `canManage` boolean — passing `canManage={false}` for demo reuses it with zero new UI code. `NotificationsForm` has NO existing read-only affordance — its Switches and Save/Push buttons are unconditionally interactive; a new `readOnly` prop is a genuinely new (small) change. [VERIFIED: `components/settings/company-info-form.tsx:58,61,178`, `components/settings/team-section.tsx:47,132,199,344`, `components/settings/notifications-form.tsx`] |
| CUTOVER-01 | Landing-page demo entry points use the product-native flow after verification, and the obsolete standalone `/demo/*` UI is removed without leaving broken internal links. | Exactly 3 files reference bare `/demo` as a link target (confirmed by full-tree grep, matches CONTEXT's list exactly, no additional landing CTAs found). The deletable file set is 4 route folders + `page.tsx`/`layout.tsx` + their `loading.tsx` siblings, PLUS `components/demo/demo-nav.tsx` (used exclusively by the doomed `app/demo/layout.tsx`, not named in CONTEXT's list — must also be deleted or it becomes dead code). `app/demo/entry/route.ts` imports only `lib/demo/session.ts`, nothing from the deleted tree — safe to keep untouched. `lib/seo/route-policy.ts`'s `/demo` prefix entry still correctly matches `/demo/entry` after deletion (prefix match, no edit needed). [VERIFIED: full-tree grep of `/demo` across `app/`, `components/`, `lib/`] |
| CUTOVER-02 | Environment and deployment documentation specifies the demo host, Supabase redirect allow-list requirements, DNS/Coolify domain setup, and local host setup without treating Vercel as production. | `DEMO-WORKSPACE.md` currently describes the retired Phase-1-4 architecture (single `/demo` route, `app/demo/route.ts` that no longer exists, "redirect demo sessions to `/dashboard`" for Settings — none of which matches current code) — full rewrite needed, not a patch. Phase 180's RESEARCH.md already specifies the exact env var contract (`DEMO_APP_ORIGIN`) and cookie/host rules to describe. `.env.local.example` does not currently list any `DEMO_*` var — worth adding for consistency (optional, not required by D-20's explicit scope). [VERIFIED: `DEMO-WORKSPACE.md` vs current `app/demo/*`, `app/(app)/settings/layout.tsx`; `.env.local.example`] |
| CUTOVER-03 | Browser verification demonstrates that a real apex session remains intact before and after visiting the demo host and that the demo renders the real product at desktop and responsive widths. | `tests/e2e/demo-session-isolation.spec.ts` (Phase 180) already proves the redirect chain, cookie isolation, one blocked write, and bounded re-entry — do not duplicate. New assertions needed: navigate dashboard → projects → clients → price-book → a project's estimate view with demo data visible; settings nav shows exactly Company/Team/Notifications and not Billing/Integrations/etc.; run across the existing `chromium` + `mobile-safari`/`mobile-chrome` Playwright projects (already configured) plus an explicit `page.setViewportSize()` check for an in-between tablet width, matching the codebase's existing viewport-testing idiom. [VERIFIED: `tests/e2e/demo-session-isolation.spec.ts`, `playwright.config.ts`, `tests/e2e/recorder-mobile.spec.ts:27`, `tests/e2e/admin-whatsapp.spec.ts:116`] |
</phase_requirements>

## Summary

Phase 181 is almost entirely a UI-presentation and file-deletion phase, not a new-mechanism phase — Phase 180 already shipped and verified in production every piece of the security/session boundary this phase depends on (host isolation, deny-write guards, RLS). The one substantive discovery from this research is that the codebase's **current handling of Settings for demo sessions actively conflicts with this phase's own requirements**: today, the "Settings" link is completely hidden from demo users in both the desktop and mobile account menus (`{!isDemo && <Link href="/settings">}`), and even if a demo user manually navigated to `/settings/*`, `app/(app)/settings/layout.tsx` intercepts the request and substitutes a bespoke single-form "Company Profile" view that bypasses the real `SettingsLayoutClient`/`SettingsNav` rail entirely — never rendering Team or Notifications, and diverging from PARITY-01's "same ... components, and styling" requirement. This is legacy behavior from a pre-180 "Phase 4" iteration (documented, stale, in `DEMO-WORKSPACE.md`) that predates D-15/D-16's actual exposure decision. Fixing this is the one real engineering task in the phase; everything else (data verification, landing-CTA link swap, dead-file deletion, E2E assertions, doc rewrite) is small and mechanical. [VERIFIED: `app/(app)/settings/layout.tsx`, `components/app-shell/sidebar.tsx`, `components/app-shell/mobile-account-menu.tsx`, `DEMO-WORKSPACE.md`]

The fix pattern is already established in the codebase in three different places and should be extended, not reinvented: (1) `components/app-shell/nav-items.ts` already has a `demoHidden?: boolean` flag filtered by `NAV_ITEMS.filter((item) => !(isDemo && item.demoHidden))` — the same shape belongs on `SettingsNav`'s `ITEMS` array; (2) `CompanyInfoForm` already has a working `readOnly` prop; (3) `TeamSection` already gates its mutation buttons behind an existing `canManage` boolean that can simply be forced `false` for demo, reusing it with zero new markup. Only `NotificationsForm` needs a genuinely new (small) read-only affordance.

**Primary recommendation:** Replace `app/(app)/settings/layout.tsx`'s demo special-case (bespoke collapsed view) with the real `SettingsLayoutClient` rendering path for every demo request; filter `SettingsNav`'s tab list to Company/Team/Notifications via a `demoHidden`-style flag; pass `readOnly`/`canManage=false` into the three exposed tabs' existing props; add a same-shape `isDemo` redirect-to-`/settings/company` guard to each of the ~9 hidden-tab page.tsx files (route-level, matching CONTEXT's named discretion option and the codebase's existing per-page `redirect(...)` idiom); un-hide the Settings entry point in both account-menu components. [VERIFIED: codebase-derived architecture analysis]

## Project Constraints (from CLAUDE.md)

- Tech stack is fixed: Next.js App Router, TypeScript strict, Tailwind/shadcn, Supabase Postgres with RLS. No new dependency is justified or needed for this phase. [VERIFIED: CLAUDE.md, `package.json`]
- Production is GitHub Actions → Docker/GHCR → Coolify (self-hosted `coolify.skale.club`), **not Vercel** — `.vercel/project.json` is a stale artifact. DEMO-WORKSPACE.md's rewrite (D-20/CUTOVER-02) must state this explicitly, matching the existing pattern already used in `README-DEPLOY.md`. [VERIFIED: CLAUDE.md, `README-DEPLOY.md`]
- Secret handling: never commit real values for `DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`/`DEMO_APP_ORIGIN`/Supabase keys into `.planning/`, seeds, or the rewritten `DEMO-WORKSPACE.md` — placeholders only, consistent with `.env.local.example`'s existing convention (`sb_secret_<your-service-role-key>`, etc.). [VERIFIED: CLAUDE.md "Secret Handling"; `.env.local.example`]
- GSD workflow enforcement applies — this phase's planned work must run through `/gsd:execute-phase`, not direct edits. [VERIFIED: CLAUDE.md]
- `app/globals.css` has a pre-existing uncommitted change (`git status`) unrelated to this phase — preserve it, do not revert. [VERIFIED: `git status --short` at research time]

## Existing Code: What This Phase Touches vs. Does Not Touch

**Explicitly out of scope (Phase 180's mechanism — already shipped, verified in production, do not re-touch):** `lib/demo/session.ts`, `lib/demo/guard.ts`, `lib/demo/config.ts`, `lib/demo/actions.ts`, the `demo_readonly_foundation` RLS migration, `proxy.ts`'s apex/demo-host classification, `tests/e2e/demo-session-isolation.spec.ts` (extend with new steps in the same file or a sibling file — do not modify its existing assertions).

**In scope:**

| Area | Files | Nature of change |
|------|-------|-------------------|
| Settings entry point | `components/app-shell/sidebar.tsx`, `components/app-shell/mobile-account-menu.tsx` | Remove the `!isDemo &&` gate around the Settings `<Link>` (Trash stays gated — not in the exposed list). |
| Settings layout | `app/(app)/settings/layout.tsx` | Remove the demo-specific collapsed-view branch; always render `SettingsLayoutClient{children}`, threading `isDemo` down. |
| Settings tab list | `components/settings/settings-nav.tsx` | Add a `demoHidden`-style flag (or an explicit allowlist) to `ITEMS`; filter when `isDemo`. |
| Exposed tab pages | `app/(app)/settings/(tabs)/company/page.tsx`, `.../team/page.tsx`, `.../notifications/page.tsx` | Pass `readOnly={isDemo}` / `canManage={isDemo ? false : ...}` / a new `readOnly` prop into their existing form components. |
| Hidden tab pages (route-level guard) | `(tabs)/account`, `(tabs)/estimates`, `(tabs)/appearance`, `(tabs)/delivery`, `settings/billing`, `settings/custom-domain`, `settings/estimate-templates`, `settings/integrations` (+ `mcp`, `stripe`), `settings/knowledge` (+ nested), `settings/payments` | Add a one-line `if (isDemoCompany(companyId)) redirect('/settings/company')` guard, matching each file's existing `redirect(...)` idiom. |
| Data readiness | none (verification only) | Query prod via Supabase MCP (read-only) or run `scripts/seed-demo-workspace.mjs` if sparse. No code change. |
| Landing CTAs | `components/landing/hero-section.tsx`, `final-cta-section.tsx`, `landing-footer.tsx` | `href="/demo"` → `href="/demo/entry"`. |
| Dead-code removal | `app/demo/page.tsx`, `app/demo/layout.tsx`, `app/demo/{dashboard,clients,projects,price-book}/{page,loading}.tsx`, `components/demo/demo-nav.tsx` | Delete. |
| Docs | `DEMO-WORKSPACE.md` | Full rewrite per D-20. |
| Tests | `tests/e2e/demo-session-isolation.spec.ts` (extend) or a new sibling spec; possibly `tests/unit/settings/*` | New assertions per CUTOVER-03/PARITY-01..03. |

[VERIFIED: full codebase inspection during this research pass]

## Architecture Patterns

### Pattern 1: Reuse the `demoHidden` Nav-Item Flag Shape for Settings Tabs

**What:** `components/app-shell/nav-items.ts` already has exactly this pattern for the primary Sidebar/BottomNav:

```typescript
// Source: components/app-shell/nav-items.ts (existing, unmodified)
export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  demoHidden?: boolean   // Hidden from the read-only public demo
  // ...
}
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  // ...
  { label: 'Settings', href: '/settings', icon: Settings, demoHidden: true, userMenu: true },
]
```

```typescript
// Source: components/app-shell/sidebar.tsx:230 (existing, unmodified)
{NAV_ITEMS.filter((item) => !(isDemo && item.demoHidden) && !item.userMenu).map((item) => { /* ... */ })}
```

**When to use:** `components/settings/settings-nav.tsx`'s `ITEMS` array needs the identical shape. Its current `SubNavItem` type (`components/ui/sub-nav.tsx`) has no such flag — extend `settings-nav.tsx`'s own `ITEMS` (not the shared `SubNav` primitive) with a local filter, since `SubNav` is also used elsewhere (workspace tabs) where a `demoHidden` concept does not apply:

```typescript
// Illustrative — not existing code
const ITEMS: (SubNavItem & { demoHidden?: boolean })[] = [
  { value: 'company', label: 'Company', Icon: Building2, href: '/settings/company' },
  { value: 'team', label: 'Team', Icon: Users, href: '/settings/team' },
  { value: 'notifications', label: 'Notifications', Icon: Bell, href: '/settings/notifications' },
  { value: 'account', label: 'Account', Icon: ShieldCheck, href: '/settings/account', demoHidden: true },
  { value: 'estimates', label: 'Estimates', Icon: FileText, href: '/settings/estimates', demoHidden: true },
  { value: 'billing', label: 'Plans', Icon: CreditCard, href: '/settings/billing', demoHidden: true },
  { value: 'templates', label: 'Message Template', Icon: Mail, href: '/settings/estimate-templates', demoHidden: true },
  { value: 'knowledge', label: 'Knowledge', Icon: BookOpen, href: '/settings/knowledge', demoHidden: true },
  { value: 'integrations', label: 'Integrations', Icon: Plug, href: '/settings/integrations', demoHidden: true },
]
```

`SettingsNav` needs a new `isDemo?: boolean` prop threaded from `SettingsLayoutClient` ← `app/(app)/settings/layout.tsx` (which already computes an equivalent boolean today, just for the wrong purpose). [VERIFIED: `components/app-shell/nav-items.ts`, `components/settings/settings-nav.tsx`, `components/ui/sub-nav.tsx`]

### Pattern 2: Reuse Existing `readOnly`/`canManage` Props Instead of Inventing New Disable Logic

**Company tab — zero new prop needed, prop already exists:**
```typescript
// Source: components/settings/company-info-form.tsx:58,61,178 (existing)
export function CompanyInfoForm({ company, readOnly = false }: CompanyInfoFormProps) {
  // ...
  <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-8 border-0 p-0">
```
`(tabs)/company/page.tsx` currently calls `<CompanyInfoForm company={company} />` with no `readOnly` — change to `<CompanyInfoForm company={company} readOnly={isDemo} />`.

**Team tab — reuse the existing permission gate, do not add a parallel one:**
```typescript
// Source: app/(app)/settings/(tabs)/team/page.tsx (existing)
const canManage = role === 'owner' || role === 'admin'
```
`TeamSection`'s Invite button (`components/settings/team-section.tsx:132,136`), remove/promote actions (`:250,281,344,347`) are ALL already gated behind `canManage`. Forcing `canManage = isDemo ? false : (role === 'owner' || role === 'admin')` hides every mutation control with a one-line change and zero new component code. [VERIFIED: `components/settings/team-section.tsx`]

**Notifications tab — genuinely new, small change needed:**
```typescript
// Source: components/settings/notifications-form.tsx:75 (existing, no readOnly today)
export interface NotificationsFormProps {
  initial: { /* ... */ }
  defaults: /* ... */
  verifiedPhone: string | null
  smsOptIn: boolean
}
```
No `readOnly` field exists. Every `<Switch onCheckedChange={...}>` (lines 229,264,272,281) and the Save/push buttons (309,317,331,363) are unconditionally interactive. Add a `readOnly?: boolean` prop and either wrap the form body in a `<fieldset disabled={readOnly}>` (matching `CompanyInfoForm`'s pattern exactly) or pass it to each `Switch`/`Button`'s `disabled` prop. `fieldset disabled` is the smaller, more consistent diff. [VERIFIED: `components/settings/notifications-form.tsx`]

### Pattern 3: Route-Level Guard for Hidden Tabs (Matches Existing Per-Page `redirect(...)` Idiom)

**What:** Every settings page.tsx already does auth/company guards this way:
```typescript
// Existing idiom, e.g. app/(app)/settings/(tabs)/team/page.tsx
const claims = await getAuthClaims()
if (!claims) redirect('/?auth=login')
const companyId = await getActiveCompanyId()
if (!companyId) redirect('/onboarding')
```
Add one more line to each hidden-tab page, reusing the already-resolved `companyId` (no extra Supabase round trip):
```typescript
import { isDemoCompany } from '@/lib/demo/config'
// ...
if (isDemoCompany(companyId)) redirect('/settings/company')
```
**Why `isDemoCompany()` and not `isDemoSession()`:** `isDemoSession()` (from `lib/demo/guard.ts`) re-fetches claims + active company independently — a second Supabase round trip when the page has already resolved `companyId`. `isDemoCompany()` is a pure, synchronous check against the already-resolved value and matches what `app/(app)/layout.tsx` already uses for the exact same UX-classification purpose (`const isDemo = isDemoCompany(activeCompanyId)`). This is presentational routing, not a new authorization boundary — the real write-time enforcement (SAFE-01..04, D-08's OR-based signal) is untouched and still runs at the actual mutation boundary regardless of what this UI layer decides to render. [VERIFIED: `lib/demo/config.ts:93`, `lib/demo/guard.ts:32-61`, `app/(app)/layout.tsx`]

**Which files need this guard:** `(tabs)/account/page.tsx`, `(tabs)/estimates/page.tsx`, `(tabs)/appearance/page.tsx` (real page, not in nav, reachable by direct URL), `(tabs)/delivery/page.tsx` (real page, not in nav), `settings/billing/page.tsx`, `settings/custom-domain/page.tsx`, `settings/estimate-templates/page.tsx`, `settings/integrations/page.tsx` + `integrations/mcp/page.tsx` + `integrations/stripe/page.tsx`, `settings/knowledge/page.tsx` + `knowledge/[id]/page.tsx` + `knowledge/new/page.tsx`, `settings/payments/page.tsx`. `(tabs)/defaults/page.tsx` and `(tabs)/staff/page.tsx` are legacy redirect-only stubs to already-exposed tabs (`/settings/estimates`, `/settings/team` respectively) — `defaults` should also redirect to `/settings/company` for demo (since its target, `estimates`, is itself hidden); `staff`'s target (`team`) is exposed, so it needs no change. [VERIFIED: full `find app/(app)/settings -type f` inventory + per-file read]

### Anti-Patterns to Avoid

- **Do not keep the current `app/(app)/settings/layout.tsx` blanket-collapse behavior.** It violates PARITY-01 (must render the same layout/components as a real tenant) and makes Team/Notifications permanently unreachable regardless of D-15's exposure decision. [VERIFIED: current code vs PARITY-01 wording]
- **Do not invent a new `isDemo`-detection helper for settings.** `isDemoCompany(companyId)` (already imported in the app shell layout) is sufficient and cheaper than `isDemoSession()` for this presentational purpose — see Pattern 3.
- **Do not gate the "WhatsApp/Telegram admin registry" inside `/settings`.** It does not exist there — it lives entirely under `app/admin/integrations/*`, already unreachable by the demo user because Phase 180's D-07 guarantees the demo principal is never provisioned in `platform_admins` (verified: `app/(app)/layout.tsx`'s `platform_admins` lookup gates all `/admin` access). CONTEXT.md's D-15 wording is accurate as a *behavioral* statement (that surface is not exposed) but there is no settings-tab file to touch for it — do not add a redundant guard where none is needed. [VERIFIED: `grep -rn "telegram" app/admin`, absence of any WhatsApp/Telegram tab under `app/(app)/settings/`]
- **Do not treat `estimates` as a missing top-level route to build.** There is no `/estimates` route; the estimate view is nested inside `/projects/[id]`. PARITY-02's "estimates" surface is satisfied by Projects navigation reaching a demo project's detail page — no new route or nav entry is needed. [VERIFIED: `find "app/(app)/projects" -maxdepth 2 -type d`]
- **Do not add a redirect shim at `/demo`** after deleting `app/demo/page.tsx` — D-19 explicitly says 404 is correct, since the only 3 internal links are updated in the same change.
- **Do not forget `components/demo/demo-nav.tsx`** when deleting the standalone demo tree — CONTEXT's file list (D-18) omits it, but it is imported exclusively by `app/demo/layout.tsx` and becomes dead code (or a build-time unused-import lint flag) if left behind.
- **Do not edit `lib/seo/route-policy.ts`.** `/demo` is listed as a `PRIVATE_ROUTE_PREFIXES` prefix and `isPrivateRoute()` does a `startsWith` match, so `/demo/entry` already correctly matches after `/demo/page.tsx` is deleted — no edit needed, verify only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Demo-only tab visibility | A new "settings demo mode" component/config system | The existing `demoHidden`-flag-on-array-plus-filter shape already used in `components/app-shell/nav-items.ts` | One filtering idiom across the whole app shell; a second one for settings only creates drift. [VERIFIED: `nav-items.ts`] |
| Read-only Company/Team forms | New disabled-state wrapper components | `CompanyInfoForm`'s existing `readOnly` prop; `TeamSection`'s existing `canManage` prop | Both already fully implement the needed behavior — this is prop-wiring, not new UI. [VERIFIED: component code] |
| Demo data seeding | A new seed script or hand-written SQL inserts | `scripts/seed-demo-workspace.mjs` (`npm run db:seed:demo`) | Already idempotent (deterministic UUIDs derived from `DEMO_COMPANY_ID`), already targets the exact registry Phase 180 wired up, supports `--dry-run`/`--reset`. D-13 locks this. [VERIFIED: script source, `package.json` scripts] |
| Verifying demo data richness | Ad-hoc local script hitting production with a locally-held service-role key | Supabase MCP (`f2b95485` → Xtimator prod `prmqgcrnpuvpzruyzvuv`) read-only `SELECT count(*)` queries scoped to `company_id = DEMO_COMPANY_ID` | Matches the pattern Phase 180 already used for live production verification (disposable rolled-back transaction via MCP) without requiring a production service-role key on the local machine. [VERIFIED: `180-14-SUMMARY.md` "Decisions Made"; `.planning/STATE.md` Supabase MCP mapping] |
| Responsive/viewport E2E coverage | A bespoke device-matrix runner | Existing Playwright `projects: [chromium, mobile-safari, mobile-chrome]` in `playwright.config.ts`, plus `page.setViewportSize()` for one additional in-between width, matching `tests/e2e/recorder-mobile.spec.ts`/`admin-whatsapp.spec.ts`'s existing pattern | Reuses the already-configured device matrix instead of adding new Playwright projects. [VERIFIED: `playwright.config.ts`, both spec files] |

**Key insight:** every mechanism this phase needs (demo detection, read-only rendering, data seeding, cross-viewport testing) already exists somewhere in the codebase in working form. The work is *reuse and wire-through*, not new construction — treat any task that proposes a new abstraction here with suspicion.

## Common Pitfalls

### Pitfall 1: Settings Layout Change Breaks Non-Demo Tenants
**What goes wrong:** Removing the demo special-case from `app/(app)/settings/layout.tsx` incorrectly, or mis-threading the new `isDemo` prop, could regress the real-tenant settings experience (currently untouched by any demo logic).
**Why it happens:** The layout file is a single shared chokepoint for ALL of `/settings/*` traffic, both demo and real.
**How to avoid:** Keep the real-tenant code path (the current `else` branch) byte-for-byte identical; only change what happens inside the `isDemo` branch (render the same `SettingsLayoutClient{children}` instead of the bespoke form).
**Warning signs:** Any snapshot/visual difference for a non-demo settings page after the change.

### Pitfall 2: Hidden-Tab Guard Applied Inconsistently Creates a Confusing UX (Nav Hidden but URL Still Renders)
**What goes wrong:** If the `SettingsNav` filter ships but the individual hidden-tab `page.tsx` guards are skipped (or vice versa), a demo visitor who guesses/bookmarks `/settings/billing` either sees real (if unaffecting) billing UI with no nav trail back, or gets redirected while the nav still doesn't show where they landed.
**How to avoid:** Ship both halves (nav filter + per-page redirect) together in the same task/commit; the redirect target (`/settings/company`) must itself always be in the exposed nav so the visitor isn't stranded.

### Pitfall 3: Data-Verification Step Silently No-Ops Because `DEMO_USER_EMAIL` Isn't Set Locally
**What goes wrong:** `scripts/seed-demo-workspace.mjs` calls `process.exit(1)` immediately if `DEMO_USER_EMAIL` or the Supabase URL/service key are missing (`fail(...)` at the top of the script) — a plan task that assumes `npm run db:seed:demo` "just works" without confirming `.env.local` has these set will fail confusingly in a fresh clone.
**How to avoid:** Before running the seed script (D-14's "if sparse, re-run"), verify env presence first; prefer a read-only Supabase MCP count query against production as the primary verification method (per Don't Hand-Roll above) and treat local seed-script execution as a fallback only if MCP access is unavailable.

### Pitfall 4: `.env.local.example` / DEMO-WORKSPACE.md Drift (Recurrence of the Exact Problem Being Fixed)
**What goes wrong:** DEMO-WORKSPACE.md is being rewritten specifically because it went stale after Phase 180 changed the architecture; if the rewrite references file/route names without re-verifying them against the actual current code (e.g., writing "`app/demo/route.ts`" instead of "`app/demo/entry/route.ts`"), the new doc goes stale on day one.
**How to avoid:** Every file/route path named in the rewritten doc should be re-verified to exist at that exact path before the doc is finalized (the current doc's "`app/demo/route.ts`" and "redirect demo sessions to `/dashboard`" claims are already both wrong against current code — do not copy them forward).

### Pitfall 5: E2E Spec Duplicates Phase 180's Proof Instead of Extending It
**What goes wrong:** Writing a second full apex→demo-host redirect-chain/cookie-isolation test duplicates `tests/e2e/demo-session-isolation.spec.ts` and doubles maintenance burden without adding coverage.
**How to avoid:** New assertions should assume the demo session is already established (reuse the existing `page.goto(demoOrigin + '/demo/entry')` bootstrap as a `test.beforeEach`/shared step, or add new `test.step()`s inside the same spec file) and focus only on what's NOT already proven: page-content assertions per surface (dashboard/projects/clients/price-book/a project's estimate view), settings-nav tab-visibility assertions, and viewport checks.

## Data Readiness (PARITY-02 / D-13 / D-14)

`scripts/seed-demo-workspace.mjs` writes, per run (idempotent via `demoId()` deterministic-hash UUIDs keyed off `DEMO_COMPANY_ID`):
- 1 company row (`Xcleaning Co`, `tier: 'pro'`)
- 4 clients
- 5 price-book folders, 29 price-book items
- 4 projects, each with 1 estimate (varying `status`: sent/approved/draft/sent) with sections + line items

Required env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `DEMO_USER_EMAIL` (script exits with a fatal error if any are missing — it does NOT silently skip). `DEMO_COMPANY_ID` is optional (defaults to `0000de00-0000-0000-0000-000000000001`, matching Phase 180's `demo_config` registry). The script resolves the demo Supabase Auth user by email via `auth.admin.listUsers()` — the demo auth user must already exist (Phase 180's production work already required and confirmed this user exists and logs in successfully, per `180-14-SUMMARY.md`'s CAPTCHA-bug fix narrative). [VERIFIED: script source]

Convenience npm scripts already exist: `npm run db:seed:demo` (upsert, `.env.local`-scoped) and `db:seed:demo:reset` (wipe + reseed). No new script needed. [VERIFIED: `package.json`]

**Recommended verification approach:** query production via Supabase MCP (`SELECT count(*) FROM clients/projects/estimates/company_price_book WHERE company_id = '0000de00-0000-0000-0000-000000000001'`) before deciding whether to re-seed — this avoids needing a production service-role key on the local machine and matches the read-only-first pattern Phase 180 already established for production verification. [VERIFIED: `180-14-SUMMARY.md`, `.planning/STATE.md` Supabase MCP server mapping]

## Landing CTA Cutover (CUTOVER-01 / D-17)

Confirmed by a full-tree grep (`app/`, `components/`, `lib/`) for the literal string `/demo` as a link target — exactly 3 files, matching CONTEXT's list exactly, no additional CTAs found anywhere else in the app:

| File | Current | Change to |
|------|---------|-----------|
| `components/landing/hero-section.tsx:258` | `<Link href="/demo">See Demo</Link>` | `href="/demo/entry"` |
| `components/landing/final-cta-section.tsx:51` | `<Link href="/demo">See Demo</Link>` | `href="/demo/entry"` |
| `components/landing/landing-footer.tsx:62` | `<Link href="/demo" ...>See Demo</Link>` | `href="/demo/entry"` |

`lib/seo/route-policy.ts`'s `PRIVATE_ROUTE_PREFIXES` array includes `/demo` (used by `isPrivateRoute()`, a `startsWith` prefix match) — this already correctly covers `/demo/entry` both before and after this phase's file deletions; no change needed, verify only. [VERIFIED: full-tree grep, `lib/seo/route-policy.ts`]

## Dead-Code Removal Inventory (CUTOVER-01 / D-18)

Confirmed via `find app/demo -type f` (full tree) and an import-graph check of every file inside it:

**Delete:**
```
app/demo/page.tsx                    # redirect('/demo/dashboard') — dead once dashboard/ is gone
app/demo/layout.tsx                  # imports components/demo/demo-nav.tsx (also delete, see below)
app/demo/dashboard/page.tsx
app/demo/dashboard/loading.tsx
app/demo/clients/page.tsx
app/demo/clients/loading.tsx
app/demo/projects/page.tsx
app/demo/projects/loading.tsx
app/demo/price-book/page.tsx
app/demo/price-book/loading.tsx
components/demo/demo-nav.tsx         # NOT in CONTEXT's D-18 list — used exclusively by app/demo/layout.tsx, becomes dead code if not also deleted
```

**Keep (untouched):**
```
app/demo/entry/route.ts              # Phase 180's handoff route; imports only lib/demo/session.ts
```

Every deleted page's imports (`createServiceClient`, `getDemoCompanyId`, `getDashboardStats`, `getProjects`, `getClients`, `getPriceBookItems`, `getFolders`, `PageHeading`, `formatMoney`) are shared utilities used broadly elsewhere in the real app — none become orphaned by this deletion. `components/demo/demo-banner.tsx` (the read-only banner shown in the REAL app shell, `app/(app)/layout.tsx`) is a separate component from `components/demo/demo-nav.tsx` and must NOT be deleted — confirm the two are not conflated. [VERIFIED: `find app/demo -type f`; per-file `import` grep; `grep -rln "demo-nav" app components lib`]

## Documentation Rewrite (CUTOVER-02 / D-20)

`DEMO-WORKSPACE.md` currently describes an architecture that no longer matches the codebase in at least these ways — the rewrite must correct all of them, not just add new sections:

| Stale claim in current doc | Actual current state |
|---|---|
| "`app/demo/route.ts` programmatically signs the visitor in ... forwards to `/dashboard`" | That route doesn't exist; the real flow is apex `/demo/entry` (proxy handoff) → demo-host `/demo/entry` (`app/demo/entry/route.ts`, `lib/demo/session.ts`) → `/dashboard`. |
| "Phase 4 ... redirect Settings/WhatsApp for demo sessions" to `/dashboard` | Current `app/(app)/settings/layout.tsx` does NOT redirect — it renders a bespoke collapsed view (being replaced by this phase with the real filtered tab rail). |
| No mention of `demo.xtimator.com`, `DEMO_APP_ORIGIN`, or host-only cookies | Phase 180 introduced the entire host-isolation model — this is the doc's biggest gap. |
| "deployment env (Coolify / Vercel)" | Production is Coolify only; Vercel must not be implied as a real target (matches CLAUDE.md's explicit correction). |

Required new content per D-20: the 3-hop flow diagram (apex → demo host → `/dashboard`), the `DEMO_APP_ORIGIN` env var (local `http://demo.localhost:9633`, production `https://demo.xtimator.com`, per Phase 180's RESEARCH.md Pattern 1 — verify this value's status is still accurate at execution time), the Supabase Auth redirect allow-list entries required for the demo host, DNS/Coolify custom-domain steps for `demo.xtimator.com` (operator action — document requirements, do not attempt to perform them; matches REQUIREMENTS.md's "Out of Scope" table), and local dev setup (`demo.localhost:<port>`, no hosts-file entry needed per Chromium's reserved-TLD loopback behavior — see `tests/e2e/demo-session-isolation.spec.ts`'s comment on this). [VERIFIED: current `DEMO-WORKSPACE.md` vs. current code; `180-RESEARCH.md` Pattern 1; REQUIREMENTS.md Out of Scope table]

`.env.local.example` does not currently document any `DEMO_*` variable — out of D-20's explicit scope (which names only `DEMO-WORKSPACE.md`), but worth flagging to the planner as a low-cost consistency addition (see Open Questions).

## Browser Verification Design (CUTOVER-03)

### What Phase 180's existing spec already proves (do not duplicate)
`tests/e2e/demo-session-isolation.spec.ts` (single spec, `chromium` project by default) already covers, in one browser context:
1. Apex `/demo/entry` → demo-host `/demo/entry` → real `/dashboard` redirect chain (exact hop URLs/statuses).
2. `DemoBanner` visible on the real dashboard.
3. Host-only cookie scoping (demo cookies never leak to apex; apex cookies unaffected by the demo excursion) — before/after cookie-jar equality.
4. One representative blocked write (`POST /api/notifications/mark-all-read` → 403 `demo_readonly`).
5. Bounded re-entry: valid-session reuse (≤2 hops) and stale-cookie repair (≤2 hops).

### What Phase 181 needs to add
- **PARITY-01/02 page-content assertions:** after reaching `/dashboard`, navigate to `/projects`, `/clients`, `/price-book`, and one project's detail page (the "estimates" surface), asserting each renders with the deterministic demo data (e.g., one of the 4 known client names from the seed script, or a known project name like "Whole-Home Carpet Cleaning") rather than an empty/error state.
- **PARITY-02/D-15/D-16 settings-nav assertions:** navigate to `/settings` (now reachable — the account-menu Settings link is un-hidden by this phase), assert the visible tab list contains exactly Company/Team/Notifications and does NOT contain Billing/Integrations/Knowledge/Estimates/Account/Message Template links; assert a direct `page.goto(demoOrigin + '/settings/billing')` redirects to `/settings/company` rather than rendering billing content.
- **PARITY-03 assertions:** on the Team tab, assert no "Invite" button is present/enabled; on the Notifications tab, assert Switches are disabled.
- **CUTOVER-03 viewport assertions:** run the extended spec (or a sibling `tests/e2e/demo-product-parity.spec.ts`) across the already-configured `chromium`, `mobile-safari`, and `mobile-chrome` Playwright projects (`playwright.config.ts`), and add one explicit `page.setViewportSize({ width, height })` check for a tablet-class width not covered by the 3 fixed device profiles — matching the existing pattern in `tests/e2e/recorder-mobile.spec.ts:27` (`{ width: 320, height: 568 }`) and `tests/e2e/admin-whatsapp.spec.ts:116` (`{ width: 390, height: 844 }`).
- **CUTOVER-03 apex-intact assertion:** this is already proven by the existing spec's "apex: original session/company identity is restored after the demo excursion" step — extending that spec (rather than writing a new standalone one) gets this requirement for free without new code.

### Suggested implementation shape
Extend `tests/e2e/demo-session-isolation.spec.ts` with additional `test.step()`s inside the existing test (cheapest — one demo session bootstrap, many assertions), OR add a new sibling spec that begins with the same `page.goto(apexOrigin + '/demo/entry')` bootstrap Pattern already documented in the existing spec's comments. Either is reasonable; the planner has discretion, but must not re-derive the redirect-chain/cookie-isolation assertions from scratch. [VERIFIED: `tests/e2e/demo-session-isolation.spec.ts`, `playwright.config.ts`, `tests/e2e/recorder-mobile.spec.ts`, `tests/e2e/admin-whatsapp.spec.ts`]

## Code Examples

### Un-hiding the Settings Entry Point (Desktop)
```typescript
// Source: components/app-shell/sidebar.tsx (existing — change shown)
// BEFORE:
{!isDemo && (
  <DropdownMenuItem asChild className="cursor-pointer">
    <Link href="/settings" className="flex items-center gap-2">
      <Settings className="h-4 w-4" />{t('Settings')}
    </Link>
  </DropdownMenuItem>
)}
// AFTER: remove the {!isDemo && ...} wrapper entirely (Settings is now demo-reachable);
// Trash stays wrapped in {!isDemo && ...} — it is not in D-15's exposed list.
```
Identical change needed in `components/app-shell/mobile-account-menu.tsx` (same `{!isDemo && <Link href="/settings">}` shape at line ~83). [VERIFIED: both files]

### Settings Layout — Replacing the Collapse with the Real Rail
```typescript
// Source: app/(app)/settings/layout.tsx (existing — current demo branch shown)
// CURRENT (to be replaced):
if (await isDemoSession()) {
  const claims = await getAuthClaims()
  const supabase = await createClient()
  const company = claims ? await getCompanySettings(supabase, claims.sub as string) : null
  return (
    <div className="flex min-h-full flex-col">
      <div className="p-4 md:p-6">
        {company ? <CompanyInfoForm company={company} readOnly /> : null}
      </div>
    </div>
  )
}
return (
  <div className="flex h-full flex-col">
    <SettingsLayoutClient>{children}</SettingsLayoutClient>
  </div>
)
```
The replacement should render `SettingsLayoutClient{children}` for BOTH branches (threading `isDemo` down to `SettingsLayoutClient` → `SettingsNav` for tab filtering), removing the bespoke duplicate rendering — this is what makes PARITY-01 ("same components, and styling") true. [VERIFIED: `app/(app)/settings/layout.tsx`]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Next.js/Vitest/Playwright | ✓ | matches Phase 180's research (`v24.13.0`) | — |
| Supabase MCP (server `f2b95485` → Xtimator prod `prmqgcrnpuvpzruyzvuv`) | Read-only demo-data-richness verification (D-14) | ✓ | — | `scripts/seed-demo-workspace.mjs` run locally against prod with production env vars if MCP is unavailable |
| `scripts/seed-demo-workspace.mjs` prerequisites (`DEMO_USER_EMAIL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`) | Fallback re-seed path (D-14) | Local `.env.local` presence not verified in this research pass (script fails fast and loudly if missing — see Pitfall 3) | — | Prefer the Supabase MCP read-only path over depending on local env for this phase |
| Playwright (`chromium`, `mobile-safari`, `mobile-chrome` projects) | CUTOVER-03 | ✓ | matches Phase 180's research (`1.59.1`) | — |
| Coolify DNS/domain configuration for `demo.xtimator.com` | Production browser verification of CUTOVER-03 in prod | Not verified — explicitly an operator action per REQUIREMENTS.md's Out of Scope table | — | Local `demo.localhost:<port>` verification is sufficient for the phase's automated gate; production domain configuration is documented (CUTOVER-02) but not performed by this phase |

**Missing dependencies with no fallback:** None — every dependency this phase's automated work needs (Node, Playwright, the seed script, Supabase MCP) is already available or has a documented fallback.

**Missing dependencies with fallback:** Local re-seed env vars (fallback: Supabase MCP verification instead, see above). Production DNS/Coolify domain for `demo.xtimator.com` (fallback: this phase documents the requirement per CUTOVER-02 without performing the mutation, per explicit Out-of-Scope wording in REQUIREMENTS.md).

## Validation Architecture

Nyquist validation is enabled (`.planning/config.json` → `workflow.nyquist_validation: true`, and it is not explicitly `false`).

### Test Framework

| Property | Value |
|----------|-------|
| Unit/static framework | Vitest (per `package.json`/`vitest.config.ts`, same as Phase 180) |
| Browser framework | Playwright, projects `chromium` / `mobile-safari` (iPhone 13) / `mobile-chrome` (Pixel 7), base port 9633 [VERIFIED: `playwright.config.ts`] |
| Config files | `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/test.yml` |
| Quick run | `npx vitest run tests/unit/settings` (existing settings unit tests) + any new demo-settings test file |
| Full CI-equivalent | `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval` [VERIFIED: `.github/workflows/test.yml:50`, `package.json` scripts] |
| Browser verification run | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` and `--project=mobile-safari` (or the new/extended spec file) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARITY-01 | Settings renders the real `SettingsLayoutClient`/`SettingsNav` rail for demo, not a bespoke view | unit | new `tests/unit/settings/demo-tab-visibility.test.ts(x)` (or similar) | ❌ Wave 0 |
| PARITY-02 | Dashboard/projects/clients/price-book/estimate-view/settings(Company,Team,Notifications) reachable with demo data | e2e | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium` (extended) | ⚠️ Extend existing file |
| PARITY-03 | Team invite/manage controls and Notifications switches disabled for demo | unit + e2e | new unit test for `TeamSection`/`NotificationsForm` demo props + e2e visual check | ❌ Wave 0 (unit); ⚠️ extend e2e |
| CUTOVER-01 | Landing CTAs point at `/demo/entry`; old `/demo/*` deleted; no broken internal links | unit/static | grep-based static check (e.g. extend an existing route/link sweep test, or a new one asserting no `href="/demo"` bare reference remains) + manual `next build` link-check | ❌ Wave 0 (if a static sweep test is added) |
| CUTOVER-02 | DEMO-WORKSPACE.md accurately describes current architecture | manual review | N/A (documentation — no automated test) | N/A |
| CUTOVER-03 | Apex session intact before/after demo visit; real product renders at desktop + responsive widths | e2e | `npx playwright test tests/e2e/demo-session-isolation.spec.ts --project=chromium --project=mobile-safari --project=mobile-chrome` (extended) | ⚠️ Extend existing file |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/settings` plus any new demo-specific unit test file created that task.
- **Per settings-gating task:** re-run the extended/new Playwright spec on `chromium` at minimum.
- **Per wave merge:** `npx tsc --noEmit -p tsconfig.ci.json && npx vitest run tests/unit tests/eval`.
- **Phase gate:** Full CI-equivalent suite green, plus the extended Playwright spec green on all 3 configured projects (`chromium`, `mobile-safari`, `mobile-chrome`), before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] A unit test asserting `SettingsNav`'s demo-filtered `ITEMS` output (exactly Company/Team/Notifications visible, others absent) — file does not exist yet.
- [ ] A unit test (or extension of an existing `tests/unit/settings/*` file) asserting `TeamSection`'s `canManage=false` hides Invite/manage controls in the demo context, and `NotificationsForm`'s new `readOnly` prop disables its Switches.
- [ ] Extended assertions in `tests/e2e/demo-session-isolation.spec.ts` (or a new sibling file) for PARITY-01/02/03 page-content and settings-nav-visibility checks, run across all 3 configured Playwright projects.
- [ ] Optional: a static sweep test asserting no remaining bare `href="/demo"` reference exists in `app/`/`components/` after the landing-CTA cutover (cheap regression guard against a future accidental re-introduction).

No new test framework or dependency install is needed — everything reuses Vitest/Playwright/RTL already configured. [VERIFIED: `package.json`, existing test directories]

## Open Questions

1. **Exact tab-hidden set beyond D-15's 3 named tabs.**
   - What we know: D-15 explicitly names Company/Team/Notifications as exposed and explicitly names Billing/Stripe-Connect/integration-API-key tabs as hidden. It does not explicitly classify Account, Estimates (defaults+delivery), Message Template (estimate-templates), or Knowledge.
   - What's unclear: whether these 4 unlisted tabs are hidden-by-default (conservative reading of D-15's closed "the tabs that make sense ... Company profile, Team, Notifications" framing) or were simply not enumerated but intended to also be exposed (e.g., Knowledge/Message-Template could plausibly showcase AI features to a prospect).
   - Recommendation: default to hidden for all 4 (matches D-15's `[auto] recommended` rationale of "expose identity/workspace-shape tabs, hide ... noise"; Account contains real credential-mutation UI even if guarded server-side, which is exactly the "confusing noise" D-15 warns against). This is the conservative, requirement-consistent default; if the user wants Knowledge or Message Template exposed later, that is a small additive change to the same filter list.

2. **Whether `.env.local.example` should also document `DEMO_APP_ORIGIN`/`DEMO_COMPANY_ID`/`DEMO_USER_EMAIL`/`DEMO_USER_PASSWORD`.**
   - What we know: D-20 scopes the documentation task explicitly to `DEMO-WORKSPACE.md`; `.env.local.example` currently has zero `DEMO_*` entries.
   - What's unclear: whether leaving `.env.local.example` unchanged is acceptable given CUTOVER-02's "environment ... documentation" wording could be read to include it.
   - Recommendation: treat as a low-cost optional addition (a few commented lines mirroring the existing style) rather than a blocking requirement — CUTOVER-02's explicit named target is `DEMO-WORKSPACE.md`.

3. **Whether the `DEMO_APP_ORIGIN` production value (`https://demo.xtimator.com`) is already configured in Coolify, or purely aspirational.**
   - What we know: Phase 180's RESEARCH.md specifies this as the intended production value; ENTRY-01..04 are marked complete and were verified in production per `180-14-SUMMARY.md`.
   - What's unclear: whether the actual Coolify domain/DNS records for `demo.xtimator.com` already exist (this research pass did not query Coolify/DNS directly, per the Out-of-Scope constraint on operator actions), and whether `DEMO_APP_ORIGIN` is already set as a Coolify runtime env var.
   - Recommendation: the phase's CUTOVER-03 "browser verification" gate can and should be satisfied primarily via local `demo.localhost:<port>` verification (which is fully within this phase's automated control); production-host verification, if performed, should be treated as a separate manual/operator-confirmed step documented in DEMO-WORKSPACE.md rather than a blocking automated test, consistent with REQUIREMENTS.md's Out-of-Scope table.

## Sources

### Primary (HIGH confidence)
- `C:/Users/Vanildo/Dev/xtimator/CLAUDE.md` — stack, secret handling, deployment, GSD enforcement constraints.
- `.planning/phases/181-real-product-cutover-verification/181-CONTEXT.md` — locked decisions D-13..D-20.
- `.planning/REQUIREMENTS.md` — exact PARITY-01..03/CUTOVER-01..03 wording, Out of Scope table.
- `.planning/phases/180-isolated-demo-session-read-only-foundation/180-14-SUMMARY.md`, `180-RESEARCH.md` — Phase 180's shipped mechanism, production bugs already fixed, env var contract.
- `.planning/config.json` — `workflow.nyquist_validation: true`.
- `app/(app)/settings/layout.tsx`, `components/settings/settings-layout-client.tsx`, `components/settings/settings-nav.tsx`, `components/ui/sub-nav.tsx` — settings tab architecture (research item 1).
- Full `find "app/(app)/settings" -type f` inventory + per-file reads of `(tabs)/company`, `(tabs)/team`, `(tabs)/notifications`, `(tabs)/account`, `(tabs)/estimates`, `(tabs)/appearance`, `(tabs)/defaults`, `(tabs)/delivery`, `(tabs)/staff`, `settings/billing`, `settings/integrations` (+`mcp`,`stripe`), `settings/payments`, `settings/custom-domain` — settings tab classification (research item 2).
- `components/settings/company-info-form.tsx`, `team-section.tsx`, `notifications-form.tsx` — existing readOnly/canManage prop patterns.
- `components/app-shell/nav-items.ts`, `sidebar.tsx`, `bottom-nav.tsx`, `mobile-account-menu.tsx`, `topbar.tsx`, `mobile-header.tsx` — existing `demoHidden`/`isDemo` wiring.
- `scripts/seed-demo-workspace.mjs`, `package.json` (`db:seed:demo` scripts) — seed script mechanics and prerequisites (research item 3).
- Full-tree grep of `/demo` across `app/`, `components/`, `lib/` — landing CTA and dead-file inventory (research items 4, 5).
- `app/demo/*` full file tree + import grep — dead-code deletion inventory (research item 5).
- `lib/seo/route-policy.ts` — confirms no change needed for the `/demo` prefix entry.
- `tests/e2e/demo-session-isolation.spec.ts`, `playwright.config.ts`, `tests/e2e/recorder-mobile.spec.ts`, `tests/e2e/admin-whatsapp.spec.ts` — existing E2E coverage and viewport-testing patterns (research items 6, 7).
- `DEMO-WORKSPACE.md` — current (stale) documentation state, compared against current code.
- `app/admin/integrations/*` — confirms the WhatsApp/Telegram admin registry lives outside `/settings` entirely.
- `.env.local.example`, `README-DEPLOY.md` — env var and Coolify documentation conventions.

### Secondary (MEDIUM confidence)
- None — research was scoped entirely to this local codebase per the phase's explicit boundary (no new external library/framework research needed).

### Tertiary (LOW confidence)
- Whether `demo.xtimator.com` DNS/Coolify domain configuration already exists in production was not verified directly (out of scope per REQUIREMENTS.md); flagged as Open Question 3.

## Metadata

**Confidence breakdown:**
- Settings-tab architecture and required code changes: HIGH — derived from direct reading of every relevant file (layout, nav components, all tab pages, all form components), not inference.
- Landing CTA / dead-file inventory: HIGH — confirmed via exhaustive full-tree grep, not a partial search.
- Seed-script/data-readiness mechanics: HIGH — full script read, prerequisites confirmed from source.
- Playwright/E2E extension design: HIGH — existing spec fully read; viewport patterns confirmed from 2 other spec files; config fully read.
- Documentation rewrite scope: HIGH — current doc fully read and diffed against current code, stale claims identified precisely.
- Production DNS/Coolify domain current state for `demo.xtimator.com`: LOW — not verified in this research pass (explicitly an operator action, out of this phase's automated scope).

**Research date:** 2026-07-27
**Valid until:** 2026-08-26 (30 days; refresh sooner if `app/(app)/settings/*`, `components/app-shell/*`, or the demo mechanism files change before planning executes)
