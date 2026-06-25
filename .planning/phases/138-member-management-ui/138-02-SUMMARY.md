---
phase: 138-member-management-ui
plan: 02
subsystem: settings-team-ui
tags: [seat, team, settings, ui, i18n, mobile, SEAT-05]
requires:
  - "lib/queries/team.ts listCompanyRoster (Plan 138-01)"
  - "lib/actions/team.ts inviteMember/revokeInvite/removeMember/changeMemberRole (SEAT-03 + Plan 138-01)"
  - "lib/auth/require-company-role.ts requireCompanyRole"
  - "lib/queries/active-company.ts getActiveCompanyId"
provides:
  - "Settings → Team surface (app/(app)/settings/(tabs)/team/page.tsx) wired to listCompanyRoster + the SEAT-03/SEAT-05 actions"
  - "TeamSection client component: roster + pending-invites + owner/admin management controls + read-only member view"
  - "Team entry in the settings nav"
affects:
  - "Phase 140 (Seat-Cost Transparency UI) will extend this same Settings → Team surface with seat-count + cost figures"
tech-stack:
  added: []
  patterns:
    - "Server page resolves canManage (owner|admin) only to decide rendering; mutations re-check requireCompanyManager server-side (UI gate is convenience, not the boundary)"
    - "Mirrors staff-section.tsx idiom: useState/useTransition + shadcn Dialog (Invite) + AlertDialog (destructive confirm) + optimistic local state"
    - "Runtime i18n via useTranslation() t() — every visible string routed through t(); no locale JSON authored"
    - "Mobile-safe: min-h-[44px] tap targets, flex-col→sm:flex-row stacking so nothing overflows at 360px"
key-files:
  created:
    - "app/(app)/settings/(tabs)/team/page.tsx"
    - "components/settings/team-section.tsx"
  modified:
    - "components/settings/settings-nav.tsx"
decisions:
  - "Render gate uses requireCompanyRole(...,['owner','admin','member']); non-member → redirect('/settings'); roster-load error → inline empty state (no crash)"
  - "Invite role + change-role Selects expose admin|member only — owner is never a settable/render option (matches the zod boundary in the actions)"
  - "Owner member row renders a read-only role badge (no change-role/remove) mirroring the last-owner guards in Plan 01"
  - "Optimistic local state after each successful mutation so the list reflects changes without a full reload (matches staff-section)"
metrics:
  duration: ~15m
  tasks: 3
  files: 3
  completed: 2026-06-25
---

# Phase 138 Plan 02: Settings → Team UI Summary

Mobile-safe `Settings → Team` surface (SEAT-05 UI half): a server page resolves the active company + viewer role, calls `listCompanyRoster`, and renders `TeamSection` with a `canManage` flag — an owner/admin gets the Invite dialog (email + role → `inviteMember`), per-member change-role + remove, and per-invite revoke; a plain member sees a read-only roster. All labels run through the runtime i18n `t()` path; no seat-cost/billing number is rendered (scope-fenced to Phase 140).

## What Was Built

### Task 1 — Team server page + nav entry (commit `5e552d82`)
- `app/(app)/settings/(tabs)/team/page.tsx`: `getAuthClaims()` → `getActiveCompanyId()` → `requireCompanyRole(companyId, ['owner','admin','member'])` to compute `canManage = role === 'owner' || role === 'admin'`; `listCompanyRoster(companyId)`; renders `<TeamSection companyId members invites canManage />`. Non-member throw → `redirect('/settings')`; roster `{ error }` → inline `<T>`-wrapped empty state.
- `components/settings/settings-nav.tsx`: added `{ value: 'team', label: 'Team', Icon: Users, href: '/settings/team' }` to ITEMS, just before the retained `staff` item (Staff NOT removed).

### Task 2 — TeamSection client component (commit `30844361`)
- `components/settings/team-section.tsx` (`'use client'`): members list (display_name → email fallback / email / role badge), pending-invites list (email / role · Pending). When `canManage`: Invite Dialog (email Input + role Select admin|member → `inviteMember`), per non-owner member a role Select (`changeMemberRole`) + AlertDialog remove (`removeMember`), per invite an AlertDialog revoke (`revokeInvite`); owner row + the `!canManage` path render a read-only badge with no controls.
- Optimistic local state after each success. All strings via `t()`. Mobile: `min-h-[44px]` buttons/selects/icon targets, `flex-col sm:flex-row` stacking + `truncate` so nothing overflows at 360px. No billing import / no seat-cost number.

### Task 3 — Human verification checkpoint
`checkpoint:human-verify` — auto-approved per project memory (no checkpoint interruptions). Headless run: not visually verified in a live browser. Manual mobile verification (iOS Safari / Android Chrome, language toggle to pt/es, 360px width, owner-row has no controls, plain-member read-only roster) is deferred to the operator per the plan's how-to-verify steps.

## Deviations from Plan

None — plan executed exactly as written. No Rule 1–4 deviations were required.

## Verification

- `npx tsc --noEmit` — no type errors in any touched file (team page, settings-nav, team-section; team queries/actions unchanged).
- grep: `team/page.tsx` calls `listCompanyRoster(` and passes `canManage`; `team-section.tsx` references `inviteMember`/`removeMember`/`changeMemberRole`/`revokeInvite` and gates with `canManage &&`; `settings-nav.tsx` contains `/settings/team`.
- Scope fence: grep for `seatPrice|seat-cost|seatCost|billing|monthlyCost|perSeat` across both new files → 0 matches.
- Unit suite: `npx vitest run` — 2501 passing. The 2 reported failures (`tests/unit/actions/team-invite.test.ts`, `tests/unit/mcp-route-contract.test.ts`) were 5s timeouts under full-suite environment contention (env time ~1946s); both PASS in isolation (18/18, 4.5s). No logic regression — this plan touched no action/query code.

## Known Stubs

None. The roster, invite, change-role, remove, and revoke controls are all wired to live Plan-01 / SEAT-03 server actions; the `canManage` flag is resolved from the real viewer role.

## Self-Check: PASSED
- FOUND: app/(app)/settings/(tabs)/team/page.tsx
- FOUND: components/settings/team-section.tsx
- FOUND: components/settings/settings-nav.tsx (modified)
- FOUND commit: 5e552d82 (feat 138-02 team page + nav)
- FOUND commit: 30844361 (feat 138-02 TeamSection)
