---
phase: 81-company-switcher-ui-add-company-flow
verified: 2026-05-26T00:05:00Z
status: passed
score: 18/19 automated must-haves verified; the remaining composition check (SWITCH-18) is captured in 81-HUMAN-UAT.md and auto-approved per user memory.
human_verification:
  - test: "Dropdown opens → switch to non-active company → cookie write → layout re-renders with new active company"
    expected: "Spinner appears briefly on clicked item, dropdown closes, sidebar/topbar repaint against new company, active_company_id cookie value in DevTools matches clicked id, no console errors"
    why_human: "SWITCH-18 by design — cookie-write + revalidatePath + RSC re-render composition needs a real Next dev server with a real Supabase session; vitest mocks cannot stand in. Auto-approved per user memory (feedback_checkpoints)."
  - test: "Add Company flow end-to-end"
    expected: "Click '+ Add new company' → routed to /onboarding?mode=add → submit creates new company → lands on /dashboard with new company active, cookie updated, old companies still selectable"
    why_human: "Composition spans UI navigation + server action + cookie write — needs a real browser session."
  - test: "Single-company UX"
    expected: "User with one company sees dropdown with only '+ Add new company' item, no switch affordance, no errors"
    why_human: "Branch only visually verifiable in browser; static contracts confirm the code paths exist."
  - test: "Forbidden recovery via stale dropdown"
    expected: "Toast.error('You no longer have access to that company.') + router.refresh purges the orphaned company"
    why_human: "Requires revoking a company_members row mid-session in another tab."
  - test: "Collapsed sidebar dropdown trigger"
    expected: "Collapsed icon-only sidebar still opens the same dropdown content"
    why_human: "Visual + interaction verification."
---

# Phase 81: Company Switcher UI + Add Company Flow — Verification Report

**Phase Goal:** Surface the multi-company plumbing shipped in Phase 79 in the UI — a dropdown lists every `companies` row the signed-in user belongs to, highlights the active one, exposes (1) Switch active company via server action that sets the `active_company_id` cookie and revalidates layout cache, and (2) "+ Add new company" routes to `/onboarding?mode=add` which calls the existing `createOrUpdateCompany(..., 'add')` action.

**Verified:** 2026-05-26
**Status:** human_needed (18/19 automated gates pass; SWITCH-18 composition test deferred to HUMAN-UAT by design, auto-approved per user memory)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (mapped to SWITCH-01..19)

| #   | Truth (SWITCH ref)                                                                                          | Status     | Evidence                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| 01  | CompanySelector visual identity from Phase 71 preserved                                                     | VERIFIED   | `components/app-shell/company-selector.tsx` retains Avatar + DropdownMenu + glassmorphism styling |
| 02  | Cookie constants come from Phase 79 exports — no hardcoded `'active_company_id'`                            | VERIFIED   | grep found constant only in `lib/queries/active-company.ts:27` (definition) and pre-existing tests; CompanySelector + action import `ACTIVE_COMPANY_COOKIE` |
| 03  | `createOrUpdateCompany` NOT called directly from switcher                                                   | VERIFIED   | grep `createOrUpdateCompany` in switcher: 0 hits; switcher routes via `<Link href="/onboarding?mode=add">` |
| 04  | `getMembershipCompanies()` uses request-scoped client, not service-role                                     | VERIFIED   | `lib/queries/active-company.ts:162` uses `await createClient()`; `requireServiceClient` confined to pre-existing `loadCompanyById` |
| 05  | Single-company case still renders dropdown                                                                  | VERIFIED   | `companies.map` runs even with length-1; "+ Add" separator + item always rendered                 |
| 06  | `switchActiveCompany` discriminated union `{ ok:true } \| { error: 'unauthenticated' \| 'forbidden' }`      | VERIFIED   | `lib/actions/active-company.ts:30-56` — exact signature; all three branches implemented           |
| 07  | useTransition + spinner pending UX                                                                          | VERIFIED   | `company-selector.tsx:53` `useTransition`; `pendingId` state + `Loader2` swap on lines 146-150    |
| 08  | Error → toast + router.refresh                                                                              | VERIFIED   | `company-selector.tsx:64-69` — toast.error + router.refresh on `'error' in result`               |
| 09  | Clicking already-active = no-op                                                                             | VERIFIED   | `company-selector.tsx:60` — `if (id === activeCompanyId) return`                                  |
| 10  | "+ Add new company" is `<Link>`, not server action                                                          | VERIFIED   | `company-selector.tsx:157-166` — `<DropdownMenuItem asChild><Link href="/onboarding?mode=add" prefetch>` |
| 11  | Onboarding page reads async `searchParams.mode` and threads to OnboardingSurvey                             | VERIFIED   | `app/onboarding/page.tsx:13-33` — `searchParams: Promise<{mode?: string}>`, `await searchParams`, `mode={addMode}` |
| 12  | Add item uses Building2 icon + "Add new company" copy                                                       | VERIFIED   | `company-selector.tsx:163-164` — `<Building2>` + `<span>Add new company</span>`                  |
| 13  | CompanySelector mounted in sidebar expanded tree                                                            | VERIFIED   | `components/app-shell/sidebar.tsx:360-362` — `<CompanySelector companies={memberships} ...>`     |
| 14  | CompanySelector mounted in sidebar collapsed tree                                                           | VERIFIED   | `components/app-shell/sidebar.tsx:305-307` — `<CompanySelector ... collapsed={true}>`            |
| 15  | mobile-header.tsx UNCHANGED                                                                                 | VERIFIED   | `git diff origin/main -- components/app-shell/mobile-header.tsx` is empty; file not in changed-list |
| 16  | Unit tests for `getMembershipCompanies` + 3 branches of `switchActiveCompany`                               | VERIFIED   | `tests/unit/active-company-helpers.test.ts` + `tests/unit/switch-active-company.test.ts` exist and pass |
| 17  | Static-contract test on CompanySelector import graph                                                        | VERIFIED   | `tests/unit/company-selector-contract.test.ts` asserts no hardcoded literal + useTransition import — passes |
| 18  | Composition test deferred to HUMAN-UAT (by design)                                                          | DEFERRED   | Captured in `human_verification` frontmatter; auto-approved per user memory                       |
| 19  | TypeScript strict, no service-role in browser, no new env / deps                                            | VERIFIED   | `npx tsc --noEmit` exits 0; switcher uses `'use server'` action + request-scoped client only      |

**Score:** 18/19 automated truths verified (SWITCH-18 is a design-deferred HUMAN-UAT item, not a gap).

### Required Artifacts

| Artifact                                              | Expected                                                            | Status   | Details |
| ----------------------------------------------------- | ------------------------------------------------------------------- | -------- | ------- |
| `lib/queries/active-company.ts`                       | exports `getMembershipCompanies()` returning `{id,name,logo_url}[]` | VERIFIED | lines 156-179, request-scoped client, ASC by `companies.created_at` |
| `lib/actions/active-company.ts`                       | exports `switchActiveCompany` 'use server' action                   | VERIFIED | full SWITCH-06 six-step sequence, discriminated union return        |
| `components/app-shell/company-selector.tsx`           | live list, active highlight, switch + add wiring                    | VERIFIED | useTransition, pendingId, no-op on active, Link to onboarding       |
| `components/app-shell/sidebar.tsx`                    | mounts `<CompanySelector>` in collapsed + expanded trees            | VERIFIED | lines 305-307 + 360-362 mount points                                |
| `app/(app)/layout.tsx`                                | calls `getMembershipCompanies()` and passes to `<Sidebar>`          | VERIFIED | line 68 invocation, line 90 prop pass-through                       |
| `app/onboarding/page.tsx`                             | async `searchParams.mode`, threads to OnboardingSurvey              | VERIFIED | Promise-typed searchParams, awaited, `mode` prop                    |
| `components/onboarding/onboarding-survey.tsx`         | accepts `mode?: 'first'\|'add'`, passes to `createOrUpdateCompany`  | VERIFIED | line 42 prop type, line 79 `{ mode }` thread                        |
| 5 test files                                          | active-company-helpers / switch / selector-contract / onboarding-mode-add / layout-membership-companies | VERIFIED | all exist; 31 tests pass across 5 files |

### Key Link Verification

| From                                  | To                                          | Via                                       | Status | Details                                                       |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------- | ------ | ------------------------------------------------------------- |
| layout.tsx                            | getMembershipCompanies                      | direct call inside Promise.all            | WIRED  | line 68; result destructured to `memberships` and passed down |
| layout.tsx                            | <Sidebar memberships>                       | JSX prop                                  | WIRED  | line 90                                                       |
| sidebar.tsx                           | <CompanySelector companies={memberships}>   | JSX prop in BOTH render trees             | WIRED  | lines 305-307 (collapsed) + 360-362 (expanded)                |
| company-selector.tsx                  | switchActiveCompany                         | startTransition → await action            | WIRED  | line 17 import + line 63 call inside startTransition          |
| company-selector.tsx                  | /onboarding?mode=add                        | `<Link href ... prefetch>`                | WIRED  | line 159                                                      |
| active-company.ts (action)            | ACTIVE_COMPANY_COOKIE / OPTIONS             | import from queries                       | WIRED  | lines 6-9 import + line 48 cookieStore.set                    |
| active-company.ts (action)            | revalidateTag + revalidatePath              | direct calls                              | WIRED  | lines 52-53                                                   |
| onboarding/page.tsx                   | OnboardingSurvey mode prop                  | `mode={addMode}`                          | WIRED  | line 33                                                       |
| OnboardingSurvey                      | createOrUpdateCompany(input, { mode })      | direct call with prop forwarding          | WIRED  | line 79                                                       |

### Data-Flow Trace (Level 4)

| Artifact                              | Data Variable      | Source                                      | Produces Real Data | Status     |
| ------------------------------------- | ------------------ | ------------------------------------------- | ------------------ | ---------- |
| CompanySelector                       | `companies`        | layout `getMembershipCompanies()` → sidebar prop → component | DB query against `company_members` JOIN `companies` with RLS by `auth.uid()` | FLOWING |
| CompanySelector                       | `activeCompanyId`  | layout `getActiveCompany().id` → sidebar `company.id` (passed as `activeCompanyId`) | Reads cookie + DB validates via `getActiveCompanyId` | FLOWING |
| switchActiveCompany action            | cookie write       | `cookies().set(ACTIVE_COMPANY_COOKIE, ...)` | Live cookie write + revalidate | FLOWING |
| OnboardingSurvey (mode=add)           | `mode` prop        | `searchParams.mode` from URL                | Forwarded into `createOrUpdateCompany` (Phase 79 verified) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                                                | Result   | Status |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------ |
| Phase 81 test suite (5 files)                     | `npx vitest run tests/unit/active-company-helpers.test.ts ... layout-membership-companies.test.ts` | 31/31 passing in 2.30s | PASS |
| TypeScript strict typecheck                       | `npx tsc --noEmit`                                                                     | exits 0, no errors | PASS |
| mobile-header.tsx untouched vs origin/main        | `git diff origin/main -- components/app-shell/mobile-header.tsx`                       | empty diff | PASS |
| No `'active_company_id'` hardcoded literal in Phase 81 surface | grep across `.ts/.tsx` for that string                                     | only constant definition + pre-existing test fixtures | PASS |

### Plan-Checker Acceptance Gates (from 81-VALIDATION.md §90-98)

| Gate                                                                                              | Status |
| ------------------------------------------------------------------------------------------------- | ------ |
| No plan references `'active_company_id'` as a string literal                                       | PASS   |
| No plan calls `createOrUpdateCompany` directly from the switcher                                  | PASS — switcher uses `<Link href="/onboarding?mode=add">` |
| No plan uses `requireServiceClient` in `getMembershipCompanies`                                    | PASS — request-scoped `createClient()` only |
| No plan modifies tenant-scoped RLS outside switcher/onboarding/layout                              | PASS — `git diff origin/main` shows no SQL/migration churn |
| No mobile-header changes                                                                          | PASS — file untouched vs origin/main |

### Anti-Patterns Found

None of significance. The action wraps `revalidateTag` in `(revalidateTag as any)` (line 52) but the inline comment documents this as a project-wide workaround for Next.js canary type signature (consistent with `lib/actions/settings.ts`, `estimate-template.ts`, `custom-domain.ts`), so it is accepted convention rather than a stub.

### Requirements Coverage

All 19 SWITCH decisions from `81-CONTEXT.md` map to verified evidence above (SWITCH-18 deferred by design to HUMAN-UAT).

### Human Verification Required

See `human_verification` frontmatter at top of this file. Five items captured; all auto-approved per user memory `feedback_checkpoints` ("treat all human-verify checkpoints as auto-approved").

### Gaps Summary

No gaps. Every automated must-have is satisfied:
- Live membership query exists and is RLS-scoped.
- Switch action is a discriminated-union 'use server' with the full six-step sequence.
- CompanySelector is wired in both sidebar render trees and uses Phase 79's cookie constants exclusively.
- Layout fetches memberships in parallel and threads them through.
- Onboarding page reads async `searchParams.mode` (Next 16 pattern) and the survey forwards `mode: 'add'` to the existing Phase 79 action.
- mobile-header.tsx is untouched (SWITCH-15).
- 31 tests pass; tsc exits 0.

The single remaining item — the cookie-write → revalidatePath → RSC re-render composition — is a SWITCH-18 design decision to defer to HUMAN-UAT, auto-approved per user memory.

---

_Verified: 2026-05-26_
_Verifier: Claude (gsd-verifier)_
