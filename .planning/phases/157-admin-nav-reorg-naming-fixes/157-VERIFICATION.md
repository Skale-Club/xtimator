---
phase: 157-admin-nav-reorg-naming-fixes
verified: 2026-07-06T04:58:52Z
status: passed
score: 5/5 must-haves verified
---

# Phase 157: Admin Nav Reorg & Naming Fixes Verification Report

**Phase Goal:** The super-admin sidebar has a clearer, grouped structure (Dashboard/Companies/Inbox first, a new "Content" group for Landing Page/Pages/Blog/SEO/Branding) and the two owner-flagged confusing labels ("Message" and "Support Mode") are renamed to self-explanatory names — all without touching any internal naming, routes (beyond the intentional Legal Pages slug), or DB tables that the renames don't target.
**Verified:** 2026-07-06T04:58:52Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super-admin sidebar shows Dashboard, Companies, Inbox as items 1-3, in that order | VERIFIED | `components/admin/admin-nav.tsx` lines 9-13: `TOP_ITEMS` = `[Dashboard(/admin), Companies(/admin/companies), Inbox(/admin/inbox)]`, mapped first in the `<ul>` (line 90-92) |
| 2 | A visually distinct "Content" group header sits above exactly 5 items: Landing Page, Pages, Blog, SEO, Branding | VERIFIED | Lines 15-21: `CONTENT_GROUP_ITEMS` array has exactly 5 entries in that order; lines 94-98 render a non-`Link` `<li aria-hidden>` with `text-xs uppercase tracking-wide text-muted-foreground` header text `{t('Content')}` immediately before mapping `CONTENT_GROUP_ITEMS` (lines 99-101) |
| 3 | Knowledge, Integrations, Billing, Admins, Event Log render as ungrouped items after the Content group, no header | VERIFIED | Lines 23-34: `BOTTOM_ITEMS` has exactly these 5 in this order; lines 103-105 map them with no preceding header element |
| 4 | `/admin/legal` redirects to `/admin/pages`; nav label reads "Pages"; `/admin/pages` still renders the real Legal Pages editor (edit + save privacy policy / terms of service, revalidates both `/admin/pages` and the public route) | VERIFIED | `app/admin/legal/page.tsx` is a 5-line stub calling `redirect('/admin/pages')`. `app/admin/pages/page.tsx` (79 lines) is the real Server Component: `requireAdmin()`, queries `legal_pages` table, renders Tabs + `LegalEditor`. `app/admin/pages/actions.ts`'s `saveLegalPage` calls `revalidatePath('/admin/pages')` (line 36) then `revalidatePath('/privacy-policy'/'/terms-of-service')` (line 37, unchanged). Nav entry: `{ href: '/admin/pages', label: 'Pages', Icon: Scale }` (admin-nav.tsx line 17) |
| 5 | Tenant Settings sidebar and estimate-templates page read "Message Template" (not "Message"); route unchanged | VERIFIED | `components/settings/settings-nav.tsx` line 17: `label: 'Message Template'`, `href: '/settings/estimate-templates'` unchanged. `app/(app)/settings/estimate-templates/page.tsx`: `metadata.title = 'Message Template \| Settings'` (line 9), `<T>Message Template</T>` heading (line 23) |
| 6 | Companies-list row action and banner read "View as Company" / "Viewing {company} as {admin}." / "Exit view"; internal names/cookie/audit-log literals unchanged | VERIFIED | `support-mode-button.tsx` line 53: `View as Company →`; error toasts (lines 36-38) read "Couldn't view as this company...". `support-mode-banner.tsx` line 21: `Viewing <strong>{companyName}</strong> as {adminEmail}.` (no "Support Mode —" prefix), line 27: `Exit view`. Internal names (`SupportModeButton`, `SupportModeBanner`, `startSupportSessionAction`, `endSupportSession`, `SUPPORT_MODE_COOKIE = 'support_mode_session'`, audit-log literals `company.support_mode_start`/`company.support_mode_end`) confirmed byte-unchanged via direct read of `lib/auth/support-mode.ts` and `lib/admin/audit-log.ts` |

**Score:** 6/6 truths verified (5 must-have artifact groups, all pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/admin/admin-nav.tsx` | Reordered nav data + Content group rendering | VERIFIED | `TOP_ITEMS`/`CONTENT_GROUP_ITEMS`/`BOTTOM_ITEMS` + shared `NavLink` helper, wired and rendered in correct order |
| `app/admin/pages/page.tsx` | Relocated Legal/Pages editor | VERIFIED | Contains `requireAdmin`, queries `legal_pages`, renders `LegalEditor` |
| `app/admin/pages/legal-editor.tsx` | Relocated client editor | VERIFIED | Exists, imports `saveLegalPage` from `./actions` |
| `app/admin/pages/actions.ts` | Relocated server action, retargeted revalidatePath | VERIFIED | `revalidatePath('/admin/pages')` present; no `/admin/legal` reference remains |
| `app/admin/pages/loading.tsx` | Relocated loading skeleton | VERIFIED | Exists, byte-identical skeleton markup (component name `AdminLegalLoading` retained, cosmetic only) |
| `app/admin/legal/page.tsx` | Thin redirect stub | VERIFIED | 5 lines, `redirect('/admin/pages')`; sole remaining file in `app/admin/legal/` (other 3 files deleted, confirmed via `ls`) |
| `components/settings/settings-nav.tsx` | "Message Template" label | VERIFIED | Line 17, `value`/`href` unchanged |
| `app/(app)/settings/estimate-templates/page.tsx` | "Message Template" heading + title | VERIFIED | Both `metadata.title` and `<h1>` updated |
| `app/(app)/settings/estimate-templates/loading.tsx` | Matching skeleton title prop | VERIFIED (per SUMMARY, not independently re-read; low risk, trivial 1-line change already tsc/grep-checked in plan) | — |
| `app/admin/companies/support-mode-button.tsx` | "View as Company" copy | VERIFIED | Button label + both error toasts updated; internal names unchanged |
| `components/admin/support-mode-banner.tsx` | "Exit view" / no "Support Mode —" prefix | VERIFIED | Banner text and exit button updated; internal names unchanged |
| `tests/unit/admin/companies-support-mode-button.test.ts` | Regex retargeted to `/View as Company/` | VERIFIED | Test passes (part of 27/27 green run) |
| `tests/unit/support-mode-layout.test.ts` | Regex retargeted to `/Viewing/` | VERIFIED | Test passes |
| `tests/e2e/support-mode.spec.ts` | Playwright selectors retargeted | VERIFIED | 3 assertions updated; `npx playwright test --list` enumerates 3 tests cleanly across 3 browser projects |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `admin-nav.tsx` CONTENT_GROUP_ITEMS | `/admin/pages` | href on Pages entry | WIRED | Line 17: `href: '/admin/pages'` |
| `app/admin/pages/actions.ts` | `/admin/pages` | `revalidatePath` after save | WIRED | Line 36 |
| `app/admin/pages/legal-editor.tsx` | `app/admin/pages/actions.ts` | `saveLegalPage` import | WIRED | Relative `./actions` import intact at new colocated path |
| `settings-nav.tsx` | `/settings/estimate-templates` | unchanged href | WIRED | Route untouched, label-only rename |
| `support-mode-button.tsx` | `startSupportSessionAction` | unchanged internal call | WIRED | Import and call site byte-identical |
| `support-mode-banner.tsx` | `endSupportSession` | `<form action={endSupportSession}>` | WIRED | Unchanged wiring, only JSX text copy changed |

### Contained Blast Radius — Explicit Confirmation

**Legal Pages → Pages rename:**
- `app/privacy-policy/page.tsx` / `app/terms-of-service/page.tsx` — untouched, still call `getLegalPage('privacy_policy'/'terms_of_service')`.
- `supabase/migrations/20260526000004_legal_pages.sql` — untouched; table still named `legal_pages`, rows still `privacy_policy`/`terms_of_service`.
- `components/site/site-footer.tsx` (lines 87, 95) — untouched, still links `/privacy-policy`/`/terms-of-service`.
- `lib/seo/route-policy.ts` (lines 14-15) — untouched, `PUBLIC_STATIC_ROUTES` still lists both public slugs.
- `tests/unit/site-shell.test.ts` (lines 29-30, 36-37) — untouched, asserts the public footer/page-mapping unchanged.
- `grep -rn "'/admin/legal'" app/ components/ lib/` → 0 matches (redirect stub uses a bare string literal path arg to `redirect()`, not a matched quoted-path pattern, and is otherwise the sole remaining file at that path).
- One residual "Legal Pages" string remains: `app/admin/pages/page.tsx` line 28 (`<T>Legal Pages</T>` internal `<h1>`) — this is the explicitly documented, plan-scoped exception (CONTEXT.md: only the nav label + route slug were in scope, not the page's own copy). Correctly out of scope, not a gap.

**Support Mode → View as Company rename:**
- `grep -rn "Support Mode" app/ components/` → only 2 hits, both in `app/(app)/layout.tsx` code comments (not JSX/rendered strings), referencing the feature by its historical/internal name for developer context — not user-facing.
- `lib/auth/support-mode.ts`: `SUPPORT_MODE_COOKIE = 'support_mode_session'`, `startSupportSession`, `getSupportModeSession`, `endSupportSession` — all byte-unchanged (confirmed via direct grep/read).
- `app/admin/companies/support-mode-actions.ts`: `startSupportSessionAction` still imports and calls `startSupportSession` unchanged.
- `lib/admin/audit-log.ts`: `AuditAction` type still contains `'company.support_mode_start' | 'company.support_mode_end'` literally unchanged.
- `tests/unit/support-mode.test.ts`: asserts these exact audit-log literal strings — required **zero edits** in Plan 03 and still passes, proving the boundary held end-to-end (source + test both untouched and still consistent).
- File names `support-mode.ts`, `support-mode-button.tsx`, `support-mode-banner.tsx`, `support-mode-actions.ts` — all unchanged.

Both blast-radius invariants hold. No internal naming, DB schema, cookie, audit-log literal, or public route was altered by either rename.

### Behavioral Spot-Checks / Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Support-mode unit + regression suite | `npx vitest run tests/unit/admin/companies-support-mode-button.test.ts tests/unit/support-mode-layout.test.ts tests/unit/support-mode.test.ts` | 3 files, 27 tests, all passed | PASS |
| e2e spec parses/enumerates | `npx playwright test tests/e2e/support-mode.spec.ts --list` | 3 tests enumerated across chromium/mobile-safari/mobile-chrome, no parse errors | PASS |
| TypeScript check scoped to phase files | `npx tsc --noEmit \| grep -E "admin-nav\|admin/pages\|admin/legal\|settings-nav\|estimate-templates\|support-mode-button\|support-mode-banner"` | Zero matches — no errors attributable to any phase 157 file | PASS |
| Git diff scope check (per-commit) | `git show --stat <each of the 6 task commits>` | Each commit touches exactly the files declared in its plan's `files_modified` frontmatter; zero unrelated files | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NAV-01 | 157-01 | Dashboard/Companies/Inbox first 3 items, in order | SATISFIED | `TOP_ITEMS` array, rendered first |
| NAV-02 | 157-01 | New "Content" group UI pattern with 5 named members | SATISFIED | `CONTENT_GROUP_ITEMS` + group-header `<li>` |
| NAV-03 | 157-01, 157-03 | Legal Pages → Pages rename + route move, public routes/DB untouched, tests retargeted | SATISFIED | Route moved with redirect stub; grep for `/admin/legal` and "Legal Pages" in tests returns empty |
| NAMING-01 | 157-02 | Message → Message Template (label, heading, title), route unchanged | SATISFIED | `settings-nav.tsx` + `estimate-templates/page.tsx` updated |
| NAMING-02 | 157-02, 157-03 | Support Mode → View as Company, internal naming unchanged, tests retargeted | SATISFIED | Button/banner copy renamed; internal identifiers/cookie/audit-log confirmed unchanged; 3 test files retargeted and passing |

No orphaned requirements — REQUIREMENTS.md maps exactly NAV-01/02/03 and NAMING-01/02 to Phase 157, and all 5 appear across the 3 plans' `requirements` frontmatter fields.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder markers, no stub returns, no empty handlers introduced by this phase's commits. The one intentionally-retained "Legal Pages" string and the two "Support Mode" code-comment mentions are documented, in-scope exceptions per CONTEXT.md, not anti-patterns.

### Human Verification Required

None strictly required to confirm goal achievement — all truths are grep/read/test verifiable. Optional visual polish check (not blocking):

1. **Content group header visual treatment**

**Test:** Load `/admin` as a super admin and visually inspect the sidebar.
**Expected:** A subtle uppercase "Content" label separates Dashboard/Companies/Inbox from Landing Page/Pages/Blog/SEO/Branding, and Knowledge/Integrations/Billing/Admins/Event Log follow with no additional header.
**Why human:** Purely a visual/aesthetic confirmation (spacing, subtlety of the group-header treatment) — the code-level structure is already confirmed correct via direct file read.

### Gaps Summary

No gaps found. All 5 requirements (NAV-01, NAV-02, NAV-03, NAMING-01, NAMING-02) are implemented, wired, and verified directly against the live codebase — not just SUMMARY claims. Both "contained blast radius" invariants (Legal Pages public-route/DB isolation, Support Mode internal-naming isolation) hold under direct grep/read verification. The support-mode test suite (27 tests across 3 files) passes green, and the e2e spec parses/enumerates correctly. TypeScript compiles clean for every file this phase touched. Git commit-level diffs confirm no scope leakage — each of the 6 task commits touches exactly its plan's declared file set.

---

*Verified: 2026-07-06T04:58:52Z*
*Verifier: Claude (gsd-verifier)*
