# Phase 147: Admin Company Creation Modal - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Show the "Add new company" button ONLY to super-admins, and clicking it opens a
compact MODAL (not a new page/route) with 4 fields. Creates the company, assigns
it 3 estimate credits (demo quota), and switches to it immediately — ready for
a live demo estimate. Regular user onboarding flow is UNCHANGED.

</domain>

<decisions>
## Implementation Decisions

### Button visibility
- **D-01:** The "Add new company" item in `CompanySelector` is rendered ONLY when `isAdmin` is `true`. For non-admins, the item is removed from the DOM entirely — not CSS-hidden, not `disabled`. No hint of the feature exists for regular users.

### Modal vs page
- **D-02:** Clicking the button opens a **modal dialog** (Dialog component, same glass-morphism pattern used elsewhere in the app). There is NO new page route (`/onboarding?mode=add` was the prior approach, but that is NOT used here). The existing full onboarding at `/onboarding` is UNCHANGED — only the admin-only quick-create modal is new.

### Form fields (user decision: minimal for speed)
- **D-03:** The admin quick-create modal has exactly 4 fields:
  1. Company name (required)
  2. Industry (required — dropdown matching existing industry options)
  3. Logo (optional — upload or skip)
  4. Brand primary color (optional — color picker or skip, defaults to system primary)
  - NO phone field
  - NO email field
  - NO subdomain, address, license, insurance, etc.
  - Rationale: speed on the street — capture only what makes the estimate look professional.

### Server action
- **D-04:** Use the EXISTING `createOrUpdateCompany` server action (`lib/actions/company.ts`) with `mode: 'add'`. Do NOT build a new server action. The existing action already handles multi-company creation (Phase 80), cookie switching, `company_members` owner row, Xphere sync, etc.

### Post-creation
- **D-05:** After submit: company created → `demo_estimate_quota` set to 3 (Phase 148 handles the column) → active company switched → modal closes → user lands in the new company's dashboard, ready to generate an estimate. No full-page navigation.

### Mobile
- **D-06:** The modal must be usable on iOS Safari and Android Chrome (same mobile-safe constraint as all other UI in this project).

### Claude's Discretion
- Exact modal open/close state management (local state or URL-param) — Claude follows existing patterns in the codebase.
- Whether logo upload uses the existing logo uploader component or a simpler file input.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing company creation
- `lib/actions/company.ts` — `createOrUpdateCompany` server action, `mode: 'add'` branch (lines ~50-210)
- `components/app-shell/company-selector.tsx` — the dropdown where the button lives

### UI patterns to follow
- `components/ui/` — Dialog, sheet, and modal patterns already in the design system
- Existing onboarding form at `app/(app-shell)/onboarding/` — reference for industry dropdown options
- `lib/industries.ts` — the industry list/resolver to reuse in the dropdown

### Phase 146 dependency
- `146-CONTEXT.md` — `isAdmin` prop must reach CompanySelector (Phase 146 adds this)

### Phase 148 dependency
- After creation, `demo_estimate_quota = 3` must be set — Phase 148 adds the column. These two phases should be sequenced so 148 lands before or together with 147's creation logic.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createOrUpdateCompany(data, { mode: 'add' })` — the server action. Already handles the full creation + cookie switch + member row.
- Existing `Dialog` component in `components/ui/` — the modal primitive.
- Industry dropdown — already exists in the onboarding form; extract the same options list.
- Logo uploader — existing component used in Settings and onboarding.
- `SYSTEM_COLORS.primary` — default brand color fallback already in `lib/system-colors.ts`.

### Established Patterns
- Modal state: other modals in the app (e.g., `NewProjectDialog`, `EstimateCreationPopup`) use either local `useState` or URL search params. Follow the existing pattern.
- `router.refresh()` after server action — standard pattern for refreshing layout state after company switch.

### Integration Points
- `CompanySelector` → new "Add company" button → opens `AdminCreateCompanyModal`
- `AdminCreateCompanyModal` → calls `createOrUpdateCompany(data, { mode: 'add' })` → refreshes layout

</code_context>

<specifics>
## Specific Ideas

- The user wants this to feel like a "street sales" tool — 2 minutes from "let me show you" to a working estimate with the prospect's brand on it. Speed is the primary UX constraint.
- Logo + color are in the modal because they make the live-demo estimate look immediately professional (client's logo appears on the estimate header).
- The user said "o onboarding normal, continua igual" — regular user sign-up flow is completely untouched.

</specifics>

<deferred>
## Deferred Ideas

- Logo URL from web (instead of upload) — might be faster on the street; deferred to v2.
- Pre-fill from business card scan / photo — future AI feature.
- Template selection at creation time (e.g., "which estimate template to start with") — deferred.

</deferred>

---

*Phase: 147-admin-company-creation-modal*
*Context gathered: 2026-06-28*
