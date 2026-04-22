# Roadmap: EstimateBuilder Pro

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Dark-first UX & Modern Redesign** — Phase 9+ (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-04-21</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 1 | Foundation and Auth | 4/4 | 2026-04-10 |
| 2 | Company Onboarding | 3/3 | 2026-04-10 |
| 3 | Dashboard and Client Management | 3/3 | 2026-04-10 |
| 4 | Project Creation and Workspace | 3/3 | 2026-04-10 |
| 5 | Audio Recording and Photo Management | 4/4 | 2026-04-10 |
| 6 | AI Estimate Generation and Editor | 3/3 | 2026-04-10 |
| 7 | PDF Sharing Email and Settings | 4/4 | 2026-04-10 |
| 8 | Platform Admin Panel | 8/8 | 2026-04-21 |

</details>

### v1.1 Dark-first UX & Modern Redesign

**Overview:** v1.1 modernises the product UX on three fronts: (1) dark mode becomes the system-wide default with a user-persisted toggle, (2) onboarding becomes a survey-style one-question-at-a-time flow, and (3) the core UI elements (buttons, inputs, cards, tables, modals, empty states, navigation) get a full visual redesign for a modern, polished feel. Public estimate view (`/estimate/*`) and generated PDFs stay on the light palette for recipient professionalism.

- [ ] **Phase 9: Dark-first UX & Modern Redesign** - Dark mode default with user-persisted toggle, survey-style one-question-at-a-time onboarding, and a complete visual redesign pass on all core UI elements for a modern look

---

## Phase Details (v1.1)

### Phase 9: Dark-first UX & Modern Redesign

**Goal**: The app ships a cohesive, modern UX built on three pillars — (1) dark mode is the default across every authenticated page using only semantic tokens, with a user-persisted toggle (dark/light/system) respected cross-session and cross-device; (2) the company onboarding flow is reborn as a survey-style experience presenting one focused question per screen with smooth transitions, progress indication, and back/forward navigation; (3) all core UI elements (buttons, inputs, selects, cards, tables, modals, empty states, toasts, navigation shells, skeletons) are redesigned for a modern, polished feel — refined spacing, typography, radii, shadows, motion, and icon use — consistent in both themes. The public estimate view (`/estimate/*`) and generated PDFs remain on the light palette regardless of the signed-in user's theme.
**UI hint**: yes
**Dependencies**: Phase 8 (semantic token scaffolding from auth dark pass and admin panel scoped-dark approach)

### Success Criteria
- [ ] A freshly signed-in user lands on a dashboard rendered in dark mode by default without any flash-of-light
- [ ] A user can toggle between dark / light / system from a persistent control in the app shell, and the choice is saved to their profile and respected on next sign-in
- [ ] Every existing page (dashboard, clients, projects, workspace tabs, estimate editor, settings, admin) renders correctly in both dark and light modes with no unreadable text, broken borders, or hardcoded colors
- [ ] New-company onboarding presents one question per screen in survey style with visible progress, smooth forward/back navigation, and per-step validation
- [ ] Core UI elements (buttons, inputs, selects, cards, tables, modals, empty states, toasts, navigation, skeletons) reflect a unified, modern visual language in both themes
- [ ] Forms, modals, dropdowns, tables, toasts, empty states, and loading skeletons use only semantic tokens
- [ ] `/estimate/*` public view and generated PDFs remain on the light palette regardless of the signed-in user's theme preference
- [ ] No regressions in Lighthouse contrast / a11y scores on any migrated page

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Foundation and Auth | v1.0 | 4/4 | Complete | 2026-04-10 |
| 2. Company Onboarding | v1.0 | 3/3 | Complete | 2026-04-10 |
| 3. Dashboard and Client Management | v1.0 | 3/3 | Complete | 2026-04-10 |
| 4. Project Creation and Workspace | v1.0 | 3/3 | Complete | 2026-04-10 |
| 5. Audio Recording and Photo Management | v1.0 | 4/4 | Complete | 2026-04-10 |
| 6. AI Estimate Generation and Editor | v1.0 | 3/3 | Complete | 2026-04-10 |
| 7. PDF Sharing Email and Settings | v1.0 | 4/4 | Complete | 2026-04-10 |
| 8. Platform Admin Panel | v1.0 | 8/8 | Complete | 2026-04-21 |
| 9. System-wide Dark Mode | v1.1 | TBD | 🚧 Planning | — |
