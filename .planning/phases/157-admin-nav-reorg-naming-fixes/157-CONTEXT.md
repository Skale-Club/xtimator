---
phase: 157
slug: admin-nav-reorg-naming-fixes
milestone: v4.17
requirements: [NAV-01, NAV-02, NAV-03, NAMING-01, NAMING-02]
autonomous: true
created: 2026-07-06
---

# Phase 157 — Context (locked decisions)

## Goal

Reorganize the super-admin sidebar (order + a new grouping pattern), rename "Legal Pages" → "Pages" (including its slug), and fix two names the owner explicitly called "terrible"/"makes no sense": tenant Settings "Message" → "Message Template", and super-admin "Support Mode" → "View as Company". All renames are USER-FACING ONLY — internal code/DB/audit-log naming stays put, mirroring the established WhatsApp→Inbox precedent from v4.16.

**Independent of Phases 156/158/159** — different files, can execute in any order relative to them.

## Current admin nav (exact, confirmed via research)

**File:** `components/admin/admin-nav.tsx`, lines 9-28 (`NAV_ITEMS` array):
```typescript
const NAV_ITEMS = [
  { href: '/admin',              label: 'Dashboard',    Icon: LayoutDashboard },
  { href: '/admin/seo',          label: 'SEO',          Icon: Globe },
  { href: '/admin/landing',      label: 'Landing Page', Icon: Layout },
  { href: '/admin/blog',         label: 'Blog',         Icon: FileText },
  { href: '/admin/knowledge',    label: 'Knowledge',    Icon: BookOpen },
  { href: '/admin/legal',        label: 'Legal Pages',  Icon: Scale },
  { href: '/admin/branding',     label: 'Branding',     Icon: Palette },
  { href: '/admin/integrations/ai', activeBase: '/admin/integrations', label: 'Integrations', Icon: Settings2 },
  { href: '/admin/billing',      label: 'Billing',      Icon: CreditCard },
  { href: '/admin/companies',    label: 'Companies',    Icon: Building2 },
  { href: '/admin/inbox',        label: 'Inbox',        Icon: Inbox },
  { href: '/admin/admins',       label: 'Admins',       Icon: Users },
  { href: '/admin/events',       label: 'Event Log',    Icon: ScrollText },
] as const
```
Rendered as a **flat `<ul>`** (lines 50-74) — no grouping/section-header pattern exists anywhere in `components/admin/` today (confirmed via research: this is the ONLY admin nav component; no sibling grouped-sidebar file exists).

## Target nav structure (locked)

```
Dashboard          (ungrouped, top)
Companies          (ungrouped, top)
Inbox              (ungrouped, top)
── Content ──      (NEW group header)
  Landing Page
  Pages            (renamed from "Legal Pages")
  Blog
  SEO
  Branding
Knowledge          (ungrouped — NOT in the Content group; it's an AI knowledge base, not site content)
Integrations       (ungrouped)
Billing            (ungrouped)
Admins             (ungrouped)
Event Log          (ungrouped)
```

**Locked decisions:**
- Dashboard, Companies, Inbox are the first 3 items, in that exact order (Companies and Inbox move up from their current lower position; Dashboard already stays first).
- The "Content" group (owner-confirmed name) contains exactly: Landing Page, Pages, Blog, SEO, Branding — 5 items. Do not add Knowledge to this group; it's a distinct AI/knowledge-base feature, not public-site content, and the owner's instruction only named these 5.
- Everything NOT in Dashboard/Companies/Inbox or the Content group (Knowledge, Integrations, Billing, Admins, Event Log) stays as ungrouped flat items, in a sensible order after the Content group (exact relative order among these 5 is Claude's Discretion — keep close to current relative order: Knowledge, Integrations, Billing, Admins, Event Log).
- This requires building a NEW sectioned-nav rendering pattern (a group header + its child items, visually distinct from ungrouped items — e.g. an uppercase small-caps label with reduced opacity above the 5 grouped links, similar to common admin-sidebar conventions). Do not use `CommandGroup` (that's a different, unrelated shadcn primitive for command palettes) — build a plain visual grouping using existing Tailwind/glass tokens already in the app (`text-muted-foreground`, `text-xs uppercase tracking-wide` is an existing pattern used elsewhere, e.g. Companies table headers).
- `isActive` detection logic must keep working identically for both grouped and ungrouped items (same `activeBase` fallback mechanism already in place).

## "Legal Pages" → "Pages" rename (NAV-03)

**Route move:** `/admin/legal` → `/admin/pages` (confirmed current directory: `app/admin/legal/` containing `page.tsx`, `legal-editor.tsx`, `actions.ts`, `loading.tsx`).

**Every reference to retarget** (confirmed via research):
| File | Line | Current | New |
|---|---|---|---|
| `components/admin/admin-nav.tsx` | 15 | `href: '/admin/legal', label: 'Legal Pages'` | `href: '/admin/pages', label: 'Pages'` (Icon `Scale` may stay) |
| `app/admin/legal/actions.ts` | 36 | `revalidatePath('/admin/legal')` | `revalidatePath('/admin/pages')` |

**Move the directory:** `app/admin/legal/` → `app/admin/pages/` (all 4 files: `page.tsx`, `legal-editor.tsx`, `actions.ts`, `loading.tsx`) — or add a thin redirect stub at the old path per the established v4.16 pattern (`app/admin/legal/page.tsx` → `redirect('/admin/pages')`) so any existing bookmark doesn't 404. Follow the v4.16 precedent: MOVE the real implementation, leave a redirect stub behind.

**What must NOT change** (contained blast radius, confirmed via research):
- `app/admin/legal/actions.ts` line 37: `revalidatePath('/privacy-policy')` / `revalidatePath('/terms-of-service')` — these target the PUBLIC pages, untouched, just move with the file to the new location.
- Public routes `/privacy-policy` (`app/privacy-policy/page.tsx`) and `/terms-of-service` (`app/terms-of-service/page.tsx`) — untouched, still call `getLegalPage('privacy_policy'/'terms_of_service')` unchanged.
- The `legal_pages` DB table/migration (`20260526000004_legal_pages.sql`) — untouched, still named `legal_pages`, still has `privacy_policy`/`terms_of_service` row IDs.
- `components/site/site-footer.tsx` lines 87, 95 (public footer links to `/privacy-policy`/`/terms-of-service`) — untouched.
- `lib/seo/route-policy.ts` lines 14-15 (`PUBLIC_STATIC_ROUTES` robots/sitemap inclusion for `/privacy-policy`/`/terms-of-service`) — untouched.
- `tests/unit/site-shell.test.ts` lines 29-30 (asserts the public footer links) — untouched, since those assertions are about the public routes, not the admin route.

**Test to update:** any test asserting the OLD admin route `/admin/legal` existence (grep for it) must retarget to `/admin/pages`, mirroring exactly how `tenant-whatsapp-surface.test.ts` was updated in v4.16 Phase 154.

## "Message" → "Message Template" rename (NAMING-01)

**Locked decision (from research + owner instruction):** rename ONLY, do not merge into `/settings/estimates` (a merge was considered and rejected as unnecessary blast radius for what's fundamentally a labeling complaint — see REQUIREMENTS.md's Out of Scope table for the explicit reasoning).

**File:** `components/settings/settings-nav.tsx`, line 17 (confirmed):
```typescript
{ value: 'templates', label: 'Message', Icon: Mail, href: '/settings/estimate-templates' }
```
Change `label: 'Message'` → `label: 'Message Template'`. Keep `value: 'templates'` and `href: '/settings/estimate-templates'` UNCHANGED — the route itself is fine, only the visible label was the complaint.

**File:** `app/(app)/settings/estimate-templates/page.tsx`:
- Line 9: `export const metadata = { title: 'Message | Settings' }` → `{ title: 'Message Template | Settings' }`
- Line 23: `<T>Message</T>` (page `<h1>`) → `<T>Message Template</T>`

**File:** `app/(app)/settings/estimate-templates/loading.tsx`, lines 7-8: update the hardcoded `title="Message"` skeleton prop to `title="Message Template"` to match.

**File:** `lib/actions/estimate-template.ts` line 52 (`revalidatePath('/settings/estimate-templates')`) — UNCHANGED, route doesn't move.

**Test to update:** `tests/e2e/visual/settings.spec.ts` line 26 (`'/settings/estimate-templates'` in `SETTINGS_PATHS`) — path stays the same (route unchanged), but if the test asserts the visible page title/heading text "Message" anywhere, update to "Message Template".

Note the page's OWN card component already correctly says "Message Template" as its card title (`components/settings/estimate-template-form.tsx`, `t('Message Template')`) — this rename makes the sidebar label and page heading consistent with what the card already calls itself. No new copy invented.

## "Support Mode" → "View as Company" rename (NAMING-02)

**Locked replacement name:** "View as Company" (chosen because the feature is NOT a real identity switch — it's a scoped viewing session — and "View as X" is an established SaaS-admin pattern; picked in the owner's absence since they were unreachable, documented here per the milestone's autonomous-execution rule).

**Exact user-facing strings to change** (confirmed via research):

| File | Line | Current | New |
|---|---|---|---|
| `app/admin/companies/support-mode-button.tsx` | 52 | `Support Mode →` | `View as Company →` |
| `app/admin/companies/support-mode-button.tsx` | 36 | `"Couldn't start Support Mode. Please try again."` | `"Couldn't view as this company. Please try again."` |
| `app/admin/companies/support-mode-button.tsx` | 36 | `` Couldn't start Support Mode. ${reason} `` | `` Couldn't view as this company. ${reason} `` |
| `components/admin/support-mode-banner.tsx` | 19 | `Support Mode — viewing <strong>{companyName}</strong> as {adminEmail}.` | `Viewing <strong>{companyName}</strong> as {adminEmail}.` (drop the redundant "Support Mode —" prefix; the banner's icon + styling already signal a special admin view) |
| `components/admin/support-mode-banner.tsx` | 25 | `Exit Support Mode` | `Exit view` |

**What must NOT change** (contained blast radius, confirmed via research — mirrors the WhatsApp→Inbox precedent exactly):
- Function names: `startSupportSession`, `getSupportModeSession`, `endSupportSession`, `startSupportSessionAction` — all in `lib/auth/support-mode.ts` / `app/admin/companies/support-mode-actions.ts`.
- Component export names: `SupportModeButton`, `SupportModeBanner` — file names and export identifiers unchanged (only their rendered JSX copy changes).
- File names: `support-mode.ts`, `support-mode-button.tsx`, `support-mode-banner.tsx`, `support-mode-actions.ts` — unchanged.
- Audit-log action literals: `'company.support_mode_start'`, `'company.support_mode_end'` (in `lib/admin/audit-log.ts`'s `AuditAction` type) — unchanged.
- Cookie name: `'support_mode_session'` (the `SUPPORT_MODE_COOKIE` constant) — unchanged.
- No new route/URL segment is introduced or removed — entry still navigates to `/dashboard`, exit still redirects to `/admin/companies`, both unchanged.

**Tests to update** (confirmed via research — update the STRING assertions, not the structural/import assertions):
- `tests/unit/admin/companies-support-mode-button.test.ts` lines 45-47: `expect(readButton()).toMatch(/Support Mode/)` → update regex to match the new button text (`/View as Company/`). Line 73's `toMatch(/SupportModeButton/)` (component import name) stays unchanged.
- `tests/unit/support-mode-layout.test.ts` lines 87-89: `expect(readBanner()).toMatch(/Support Mode/)` → update to match new banner text. Lines 95-104 (redirect-path structural check) stay unchanged.
- `tests/unit/support-mode.test.ts` lines 58, 192, 251-260: these assert the audit-log literal strings `'company.support_mode_start'`/`'company.support_mode_end'` — UNCHANGED, do not touch (internal naming).
- `tests/e2e/support-mode.spec.ts` lines 33, 42, 44: Playwright selectors/body-text assertions on `/Support Mode/` and `/Exit Support Mode/` regexes — update to `/View as Company/` and `/Exit view/` respectively.

## Verification checklist for this phase

- `grep -rn "Legal Pages" app/ components/` returns zero results outside test fixtures documenting the old name (if any exist, update them too).
- `grep -rn "'/admin/legal'" app/ components/ lib/` returns zero results outside the redirect stub itself.
- `grep -rn "Support Mode" app/ components/` returns zero results in USER-FACING JSX/string literals (function/file names containing "support-mode"/"SupportMode" are expected and correct to remain).
- The sidebar visually shows Dashboard → Companies → Inbox → [Content group: Landing Page, Pages, Blog, SEO, Branding] → Knowledge → Integrations → Billing → Admins → Event Log.

## Claude's Discretion

- Exact visual treatment of the "Content" group header (font size, spacing, whether a subtle divider line is added above/below the group) — use existing admin design tokens, don't invent new ones.
- Whether "View as Company" keeps the trailing "→" arrow glyph (matching the old button's style) — Claude's call, keep visually consistent with other row actions in the same table (e.g. "Configure →").
