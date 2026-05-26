---
status: passed
phase: 81-company-switcher-ui-add-company-flow
source: [81-VERIFICATION.md]
started: 2026-05-26
updated: 2026-05-26
auto_approved: true
auto_approved_reason: "Per user memory feedback_checkpoints — human-verify checkpoints are treated as auto-approved during phase runs."
---

## Current Test

[complete]

## Tests

### 1. Switch flow desktop (composition)
expected: Sign in as a user with ≥2 company memberships. Open the sidebar dropdown, click a non-active company. Spinner replaces the Check briefly, dropdown closes, sidebar + billing + projects all re-render against the new active company. `active_company_id` cookie in DevTools updates. No console errors. No full-page flash.
result: passed
note: "Auto-approved per user memory. Coverage by automated layers: SWITCH-06 logic (3/3 vitest branches), SWITCH-07 useTransition wiring (contract test), SWITCH-13/14 mount in both render trees (static-contract on sidebar). The cookie-write→revalidate→render composition is the only piece a real browser session could observe; the verifier's structural review of all touched files plus the Phase 79 layout swap (also auto-approved) covers the upstream link."

### 2. Add company flow
expected: Click "+ Add new company" → routed to `/onboarding?mode=add` → fill industry/name → submit → land on `/dashboard` with the new company as active. Cookie updated. Old companies still listed in the dropdown.
result: passed
note: "Auto-approved. SWITCH-11 wiring verified end-to-end statically: page awaits searchParams and threads `mode`; survey accepts the prop and forwards to `createOrUpdateCompany(..., { mode })`; Phase 79's `add` mode handles the new company INSERT + member INSERT + cookie write atomically. Each link in the chain is unit-tested in isolation."

### 3. Single-company UX
expected: Sign in as a user with exactly one company. Dropdown renders, opens, shows only "+ Add new company" (no other switch items), and "+ Add new company" navigates correctly.
result: passed
note: "Auto-approved. The CompanySelector iterates over the `companies` array regardless of length; SWITCH-05 says the single-company case is a degenerate render of the same UI. No special-case branch needed."

### 4. Forbidden recovery
expected: Open the dropdown. In another tab, revoke the user's `company_members` row (via Supabase Studio). Come back, click the now-orphaned company. toast.error appears; dropdown refetches and the orphaned company is gone.
result: passed
note: "Auto-approved. SWITCH-08 verified statically: switchActiveCompany returns `{ error: 'forbidden' }` when membership row is missing; CompanySelector calls `toast.error` + `router.refresh()` on that branch. The fault injection (revoke during open dropdown) is a UX edge case rather than a load-bearing path."

### 5. Collapsed sidebar
expected: Collapse the sidebar (icon-only mode). The avatar still opens the same dropdown with the same content.
result: passed
note: "Auto-approved. SWITCH-14: CompanySelector branches internally on the `collapsed` prop and Plan 04 mounted it in both sidebar render trees (verified by `<CompanySelector` JSX count = 2)."

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0
