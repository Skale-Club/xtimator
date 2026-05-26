---
phase: 81-company-switcher-ui-add-company-flow
plan: 04
subsystem: app-shell / multi-tenancy
tags: [ui, integration, multi-tenancy, tdd, phase-close]
dependency-graph:
  requires:
    - 81-01 (getMembershipCompanies query)
    - 81-02 (switchActiveCompany action)
    - 81-03 (CompanySelector component + onboarding ?mode=add)
    - 79 (active-company helpers, layout cutover)
  provides:
    - Visible end-to-end company-switcher slice in the running app shell
    - Sidebar accepts a typed `memberships` prop
  affects:
    - app/(app)/layout.tsx (now fetches memberships in Promise.all)
    - components/app-shell/sidebar.tsx (bottom panel restructured)
tech-stack:
  added: []
  patterns:
    - Parallel data fetch via Promise.all (memberships joined into existing batch)
    - Component-internal collapsed-vs-expanded branching via prop (CompanySelector owns its own visual variants; sidebar mounts twice with explicit `collapsed` to satisfy Pitfall 5 enforcement)
key-files:
  created:
    - tests/unit/layout-membership-companies.test.ts
    - .planning/phases/81-company-switcher-ui-add-company-flow/deferred-items.md
    - .planning/phases/81-company-switcher-ui-add-company-flow/81-04-SUMMARY.md
  modified:
    - app/(app)/layout.tsx
    - components/app-shell/sidebar.tsx
decisions:
  - "getMembershipCompanies() joined the existing layout Promise.all alongside branding/admin/billing — zero added round-trips."
  - "Mounted <CompanySelector> twice (once per render branch) rather than a single mount with internal branching. Trade-off: minor JSX duplication for Pitfall 5 enforceability and per-branch chrome tuning."
  - "User-menu DropdownMenu (Settings / App Tour / Sign Out) kept byte-identical content, but its trigger became an avatar-only button in BOTH collapsed and expanded modes. The wide company-info trigger that previously occupied the expanded bottom panel is gone — CompanySelector owns company identity now."
  - "Mobile-header.tsx intentionally untouched (SWITCH-15 deferred). Verified via `git diff` returning empty."
metrics:
  duration_seconds: 383
  duration_human: "~6m"
  tasks_completed: 5
  files_created: 3
  files_modified: 2
  completed_date: 2026-05-26
requirements: [SWITCH-13, SWITCH-14, SWITCH-15]
---

# Phase 81 Plan 04: Mount CompanySelector in App Shell Summary

**One-liner:** Layout fetches user memberships in parallel and passes them to Sidebar, which mounts the live `<CompanySelector>` in both collapsed and expanded render trees — closing the loop on the v4.0 multi-tenancy switcher UI surface.

## What shipped

1. **`app/(app)/layout.tsx`** — imports `getMembershipCompanies` from `@/lib/queries/active-company` and adds it as a fourth entry in the existing `Promise.all` (alongside `brandingPromise`, the admin lookup, and the billing row). Result is destructured as `memberships` and passed to `<Sidebar memberships={memberships} />`. No other layout logic changed.

2. **`components/app-shell/sidebar.tsx`** — accepts a new `memberships: Array<{ id; name; logo_url }>` prop. The bottom panel (border-t block) was restructured:
   - **Collapsed branch**: `<CompanySelector collapsed={true} />` renders at the top as an avatar-only switcher, followed by the expand chevron, followed by the user-menu avatar trigger.
   - **Expanded branch**: `<CompanySelector collapsed={false} />` renders as a full row (avatar + company name + chevrons-up-down icon), followed by a row containing the user-menu avatar trigger and the collapse chevron.
   - The user-menu DropdownMenu content (Settings / App Tour / Sign Out) is preserved byte-identical between modes.

3. **`tests/unit/layout-membership-companies.test.ts`** — new static-contract test asserting the import wiring, the `Promise.all` call, the `memberships` prop on `<Sidebar>`, the `CompanySelector` import, the typed `memberships` prop on `SidebarProps`, and the Pitfall-5 enforcement that `<CompanySelector` appears at least twice in the sidebar source.

## Requirements satisfied

- **SWITCH-13** — Sidebar mount: confirmed via Task 4.3 + contract test #5 (`<CompanySelector` >= 2 occurrences).
- **SWITCH-14** — Collapsed sidebar avatar trigger: `<CompanySelector collapsed={true} />` is mounted in the `collapsed` branch and renders only the avatar (per Plan 03's component contract).
- **SWITCH-15** — Mobile deferred: `git diff components/app-shell/mobile-header.tsx` returns empty. Zero-diff enforced.

## Key decisions

(a) **`getMembershipCompanies()` joined the existing layout `Promise.all`** rather than running as a separate sequential await. Zero added round-trips; same wall-clock as before.

(b) **Two `<CompanySelector>` mounts (one per branch)** rather than a single mount with internal branching. Makes the Pitfall-5 enforcement trivial (the contract test simply counts JSX occurrences) and lets each branch tune its own surrounding chrome. CompanySelector itself still owns the collapsed-vs-expanded visual variants via its `collapsed` prop.

(c) **User-menu trigger is now avatar-only in BOTH modes.** The wide company-info trigger that previously occupied the expanded bottom panel (lines 348-365 in the old sidebar.tsx) is gone — that surface has been replaced by the CompanySelector. The user-menu DropdownMenu content stays unchanged; only its trigger button was simplified.

(d) **Owner_name shows in the user-menu Tooltip**, not in the sidebar visual hierarchy. Keeps the design clean and gives the company identity surface (CompanySelector) all the screen real estate.

## Files touched

| File                                            | Change                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| app/(app)/layout.tsx                            | +1 import symbol, +1 Promise.all entry, +1 JSX prop. 6 lines net.               |
| components/app-shell/sidebar.tsx                | +1 import, +memberships prop, restructured bottom panel (~100 lines rewritten). |
| tests/unit/layout-membership-companies.test.ts  | NEW — 6 static-contract assertions.                                             |
| components/app-shell/mobile-header.tsx          | UNTOUCHED (SWITCH-15 enforced).                                                 |

## Tests

```bash
npx vitest run tests/unit/active-company-helpers.test.ts \
  tests/unit/switch-active-company.test.ts \
  tests/unit/company-selector-contract.test.ts \
  tests/unit/onboarding-mode-add.test.ts \
  tests/unit/layout-membership-companies.test.ts
# Test Files  5 passed (5)
# Tests       31 passed (31)
```

`npx tsc --noEmit` — exit 0.

`grep -c "<CompanySelector" components/app-shell/sidebar.tsx` — 2.

## Deviations from Plan

None. Plan executed as written. Task 4.4 (`checkpoint:human-verify`) was auto-approved per user memory `feedback_checkpoints.md` and the `auto_approve_per_user_memory: true` frontmatter flag on the plan.

## Deferred Issues (out of scope)

Full-suite vitest run surfaced 16 failing test files / 42 failing tests in completely unrelated areas (admin, blog, dashboard queries, SEO, cron, i18n, brand tokens). These failures predate Phase 81 and are not caused by any Plan-04 change — none of the failing test files import the modules I touched. Tracked in `.planning/phases/81-company-switcher-ui-add-company-flow/deferred-items.md` for a follow-up cleanup phase.

## HUMAN-UAT plan

Per SWITCH-18 and the plan checkpoint description, the verifier should now write `81-HUMAN-UAT.md` covering the 5 scenarios from `81-VALIDATION.md` (switch flow desktop, add-company flow, single-company UX, forbidden recovery, collapsed sidebar). That artifact closes the phase from the user's perspective.

## Phase 81 close-out

With Plans 01-04 shipped, the v4.0 multi-tenancy **switcher UI slice is functionally complete**:

- Plan 01: `getMembershipCompanies()` query
- Plan 02: `switchActiveCompany()` server action + cookie write + `revalidatePath('/', 'layout')`
- Plan 03: `<CompanySelector>` component + `/onboarding?mode=add` flow
- Plan 04 (this): layout fetches + sidebar mounts → switcher visible in the running app

Next v4.0 phases per ROADMAP: RLS rewrite of tenant-scoped tables, server-action sweep to make every write `companies.id`-aware, billing per-company.

## Self-Check: PASSED

- FOUND: tests/unit/layout-membership-companies.test.ts
- FOUND: .planning/phases/81-company-switcher-ui-add-company-flow/deferred-items.md
- FOUND commit: 0d9337b (test RED)
- FOUND commit: c12722b (layout)
- FOUND commit: 23c06dd (sidebar)
- FOUND: <CompanySelector mount count = 2 in sidebar.tsx
- FOUND: mobile-header.tsx unchanged (zero diff)
