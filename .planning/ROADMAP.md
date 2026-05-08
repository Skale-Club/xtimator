# Roadmap: Xtimator

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Dark-first UX & Modern Redesign** — Phase 9 (shipped 2026-04-22) · [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Brand Identity & Global Reach** — Phases 10-18 (shipped 2026-05-06) · [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Smart Pricing** — Phases 19-23 (shipped 2026-05-08) · [archive](milestones/v1.3-ROADMAP.md)
- 🔲 **v1.4 Estimate Plain Text & Pricing Tools** — Phases 24-26 (active)

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

<details>
<summary>✅ v1.1 Dark-first UX & Modern Redesign (Phase 9) — SHIPPED 2026-04-22</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 9 | Dark-first UX & Modern Redesign | 8/8 | 2026-04-22 |

</details>

<details>
<summary>✅ v1.2 Brand Identity & Global Reach (Phases 10-18) — SHIPPED 2026-05-06</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 10 | Global Brand Tokens | 1/1 | 2026-04-22 |
| 11 | Marketing Landing Page | 2/2 | 2026-04-24 |
| 12 | i18n Translation System | 5/5 | 2026-04-24 |
| 13 | Visual Identity Polish (favicon + app icons) | 2/2 | 2026-05-05 |
| 14 | Auth System Hardening | 3/3 | 2026-05-01 |
| 15 | Owner Admin Panel | 5/5 | 2026-05-03 |
| 16 | Sidebar Projects Panel | 3/3 | 2026-05-03 |
| 17 | Navigation Performance | 3/3 | 2026-05-05 |
| 18 | Voice-First Project Onboarding | 3/3 | 2026-05-05 |

</details>

<details>
<summary>✅ v1.3 Smart Pricing (Phases 19-23) — SHIPPED 2026-05-08</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 19 | Price Book DB Foundation | 2/2 | 2026-05-07 |
| 20 | Price Book CRUD UI | 3/3 | 2026-05-07 |
| 21 | CSV Import | 3/3 | 2026-05-08 |
| 22 | AI Price Anchoring | 3/3 | 2026-05-08 |
| 23 | Estimate Editor Price Badges | 2/2 | 2026-05-08 |

</details>

- [x] **Phase 24: Estimate Template Engine + Settings Page** — DB schema for company estimate templates + `/settings/estimate-templates` config UI (completed 2026-05-08)
- [ ] **Phase 25: Plain Text Tab + Copy UI** — "Plain Text" tab in estimate editor with editable preview and copy-to-clipboard
- [ ] **Phase 26: Bulk Price Adjustment** — Category-scoped % adjustment with preview and atomic apply in the price book

## Phase Details

### Phase 24: Estimate Template Engine + Settings Page
**Goal**: Companies can define and save a plain-text estimate template with named variables
**Depends on**: Phase 7 (Settings infrastructure), Phase 20 (Price Book settings page pattern)
**Requirements**: PLAINTEXT-03, PLAINTEXT-05
**Success Criteria** (what must be TRUE):
  1. Owner can navigate to `/settings/estimate-templates` and see a form with greeting, opener, closer, and signature fields
  2. Owner can type `{client_name}`, `{company_name}`, `{owner_name}`, `{total}`, and `{items_breakdown}` as live variables and the UI identifies them as valid
  3. Saved template persists across browser sessions and is scoped to the company (not shared across companies)
  4. A company with no saved template gets a sensible default so the plain-text feature works out of the box
**Plans**: 3 plans
Plans:
- [x] 24-01-PLAN.md — Migration + pure utility (resolveTemplate, TEMPLATE_DEFAULTS, zod schema, CompanySettings extension, query function) with TDD
- [x] 24-02-PLAN.md — Server action (saveEstimateTemplate) + client form component (EstimateTemplateForm)
- [x] 24-03-PLAN.md — Settings sub-route page + loading skeleton + /settings entry card
**UI hint**: yes

### Phase 25: Plain Text Tab + Copy UI
**Goal**: Users can view, edit, and copy a plain-text version of any estimate in one tap
**Depends on**: Phase 24 (template engine must exist to drive text output)
**Requirements**: PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04
**Success Criteria** (what must be TRUE):
  1. "Plain Text" card is visible in the Send tab below the EstimatePreview/SendForm grid
  2. The card shows the estimate rendered using the company template with all variables resolved (client name, totals, line items, etc.)
  3. User can edit the rendered text directly in the preview without that edit affecting the saved template
  4. Clicking the copy button places the current text on the clipboard and shows a confirmation toast
**Plans**: 2 plans
Plans:
- [ ] 25-01-PLAN.md — buildItemsBreakdown utility function + unit tests (TDD RED→GREEN)
- [ ] 25-02-PLAN.md — PlainTextCard component + data chain wiring (page.tsx → ProjectWorkspace → SendTab → PlainTextCard)
**UI hint**: yes

### Phase 26: Bulk Price Adjustment
**Goal**: Users can raise or lower all prices in a price book category with one confirmed action
**Depends on**: Phase 20 (Price Book CRUD UI — needs existing items to adjust), Phase 19 (price_source column in place)
**Requirements**: BULKPRICE-01, BULKPRICE-02, BULKPRICE-03
**Success Criteria** (what must be TRUE):
  1. From the price book page, user can select a category and enter a percentage adjustment (positive or negative)
  2. Before confirming, user sees a table comparing current unit prices vs projected new prices for every item in that category
  3. After confirming, all item prices in that category update simultaneously — no partial saves leave some items at old prices
**Plans**: TBD

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
| 9. Dark-first UX & Modern Redesign | v1.1 | 8/8 | Complete | 2026-04-22 |
| 10. Global Brand Tokens | v1.2 | 1/1 | Complete | 2026-04-22 |
| 11. Marketing Landing Page | v1.2 | 2/2 | Complete | 2026-04-24 |
| 12. i18n Translation System | v1.2 | 5/5 | Complete | 2026-04-24 |
| 13. Visual Identity Polish | v1.2 | 2/2 | Complete | 2026-05-05 |
| 14. Auth System Hardening | v1.2 | 3/3 | Complete | 2026-05-01 |
| 15. Owner Admin Panel | v1.2 | 5/5 | Complete | 2026-05-03 |
| 16. Sidebar Projects Panel | v1.2 | 3/3 | Complete | 2026-05-03 |
| 17. Navigation Performance | v1.2 | 3/3 | Complete | 2026-05-05 |
| 18. Voice-First Project Onboarding | v1.2 | 3/3 | Complete | 2026-05-05 |
| 19. Price Book DB Foundation | v1.3 | 2/2 | Complete | 2026-05-07 |
| 20. Price Book CRUD UI | v1.3 | 3/3 | Complete | 2026-05-07 |
| 21. CSV Import | v1.3 | 3/3 | Complete | 2026-05-08 |
| 22. AI Price Anchoring | v1.3 | 3/3 | Complete | 2026-05-08 |
| 23. Estimate Editor Price Badges | v1.3 | 2/2 | Complete | 2026-05-08 |
| 24. Estimate Template Engine + Settings Page | v1.4 | 3/3 | Complete    | 2026-05-08 |
| 25. Plain Text Tab + Copy UI | v1.4 | 0/2 | Not started | - |
| 26. Bulk Price Adjustment | v1.4 | 0/TBD | Not started | - |
