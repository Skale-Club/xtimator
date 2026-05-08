# Roadmap: Xtimator

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Dark-first UX & Modern Redesign** — Phase 9 (shipped 2026-04-22) · [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Brand Identity & Global Reach** — Phases 10-18 (shipped 2026-05-06) · [archive](milestones/v1.2-ROADMAP.md)
- 🚧 **v1.3 Smart Pricing** — Phases 19-23 (in progress)

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
| 15 | Owner Admin Panel (dashboard, SEO, LP, blog, branding) | 5/5 | 2026-05-03 |
| 16 | Sidebar Projects Panel | 3/3 | 2026-05-03 |
| 17 | Navigation Performance (skeleton loading, streaming) | 3/3 | 2026-05-05 |
| 18 | Voice-First Project Onboarding | 3/3 | 2026-05-05 |

</details>

<details open>
<summary>🚧 v1.3 Smart Pricing (Phases 19-23) — IN PROGRESS</summary>

- [ ] **Phase 19: Price Book DB Foundation** - Create `company_price_book` table with RLS and add `price_source` column to `estimate_items`
- [ ] **Phase 20: Price Book CRUD UI** - `/settings/price-book` page with add/edit/delete items, search, and empty state
- [ ] **Phase 21: CSV Import** - File upload, parse, preview, and bulk insert for price book data
- [ ] **Phase 22: AI Price Anchoring** - Inject price book into estimate generation prompt; tag each output item with price origin
- [ ] **Phase 23: Estimate Editor Price Badges** - Visual origin badges per line item in the estimate editor with manual-override behavior

</details>

## Phase Details

### Phase 19: Price Book DB Foundation
**Goal**: The database has a `company_price_book` table with full RLS isolation per company, and `estimate_items` has a `price_source` column ready to store price origin tags
**Depends on**: Phase 18
**Requirements**: *(infrastructure prerequisite — enables PB-01 through PB-07, AIPRICE-03, EDITPRICE-01, EDITPRICE-02)*
**Success Criteria** (what must be TRUE):
  1. A Supabase migration creates `company_price_book` (id, company_id, category, name, unit, unit_price, notes, created_at) and is applied without error
  2. RLS policies on `company_price_book` allow a company's authenticated user to SELECT/INSERT/UPDATE/DELETE only their own rows; rows from other companies are invisible
  3. `estimate_items` gains a nullable `price_source` TEXT column (CHECK: 'price_book' | 'ai_estimate') and existing rows are unaffected
  4. The build passes with TypeScript types regenerated from the new schema
**Plans**: 2 plans
Plans:
- [x] 19-01-PLAN.md — Integration test stub (Wave 0) + migration SQL file
- [x] 19-02-PLAN.md — Apply migration to live DB + regenerate TypeScript types + verify build

### Phase 20: Price Book CRUD UI
**Goal**: Users can manage their company's price book directly in settings — viewing items grouped by category, adding new items, editing and deleting existing ones, searching, and seeing a clear empty state that explains optionality
**Depends on**: Phase 19
**Requirements**: PB-01, PB-02, PB-03, PB-04, PB-06, PB-07
**Success Criteria** (what must be TRUE):
  1. User navigates to `/settings/price-book` and sees all price book items grouped by category, or a clear empty state explaining the price book is optional and the AI will use market estimates if empty
  2. User can add a new item by specifying category (free text), item name, unit, unit price, and optional notes — item appears immediately in the list under its category
  3. User can edit any existing item's fields in-place and save; changes are reflected immediately
  4. User can delete an item after confirming a destructive action dialog; the item is removed from the list
  5. User can search items by name or category and the list filters instantly to matching results
**Plans**: 3 plans
Plans:
- [x] 20-01-PLAN.md — Wave 0: failing test stubs + data layer (schema, query, server actions)
- [x] 20-02-PLAN.md — Wave 1: PriceBookList + PriceBookItemDialog client components (tests GREEN)
- [x] 20-03-PLAN.md — Wave 2: page route + loading.tsx + settings entry point card

### Phase 21: CSV Import
**Goal**: Users with existing price lists can import items in bulk via CSV upload, preview what will be imported before committing, and confirm the bulk insert
**Depends on**: Phase 20
**Requirements**: PB-05
**Success Criteria** (what must be TRUE):
  1. User can upload a CSV file with columns (category, item, unit, price) and the UI parses it client-side without a page reload
  2. After upload, a preview table shows all parsed rows before any data is written — user can review and cancel or confirm
  3. On confirm, all valid rows are bulk-inserted into `company_price_book` and appear in the price book list grouped by category
  4. Rows with missing required fields are flagged in the preview with a clear error indicator; only valid rows are imported on confirm
**Plans**: 3 plans
Plans:
- [x] 21-01-PLAN.md — Wave 0: install papaparse + RED test stubs (parser/dialog/action) + source skeletons
- [x] 21-02-PLAN.md — Wave 1: GREEN implementation (parser, dialog, server action) — 32 stubs turn green
- [x] 21-03-PLAN.md — Wave 2: wire Import CSV button into PriceBookList + template CSV + full regression sweep
**UI hint**: yes

### Phase 22: AI Price Anchoring
**Goal**: The AI estimate generation pipeline loads the company's price book before generating, injects it as context into the Claude prompt, uses matched prices as anchors, falls back to market estimates when there is no match, and tags every output line item with its price origin
**Depends on**: Phase 19
**Requirements**: AIPRICE-01, AIPRICE-02, AIPRICE-03
**Success Criteria** (what must be TRUE):
  1. When a company has price book items that match detected work items, the generated estimate uses those prices (not AI-guessed prices) for the matched line items
  2. When the price book is empty or no items match, the AI generates estimates using market-rate reasoning — identical to pre-v1.3 behavior with no regression
  3. Every line item in the generated estimate JSON carries a `price_source` field set to either `"price_book"` or `"ai_estimate"`, and this value is persisted to `estimate_items.price_source`
**Plans**: 3 plans
Plans:
- [x] 22-01-PLAN.md — Wave 0: install @google/genai + lib/ai/ skeleton files + 5 RED test stubs (17 total)
- [x] 22-02-PLAN.md — Wave 1: implement factory + both adapters (Claude + Gemini) — 17 tests GREEN
- [x] 22-03-PLAN.md — Wave 2: wire route + admin panel Gemini card + provider selector + regression gate

### Phase 23: Estimate Editor Price Badges
**Goal**: Each line item in the estimate editor displays a visible badge indicating whether its price came from the company's price book or was estimated by AI, and the badge updates when a user manually overrides the price
**Depends on**: Phase 22
**Requirements**: EDITPRICE-01, EDITPRICE-02
**Success Criteria** (what must be TRUE):
  1. Every line item in the estimate editor shows a badge — "Price book" (checkmark style) for `price_book` origin and "AI estimate" (lightning style) for `ai_estimate` origin — without requiring any user action
  2. When a user edits the unit price of any line item, the badge for that item is removed or replaced with a neutral "Edited" indicator to signal the price is now a manual override
  3. Badge rendering does not break on estimates generated before v1.3 (items with null `price_source` have no badge, not an error)
**Plans**: 2 plans
Plans:
- [x] 23-01-PLAN.md — Wave 0: extend EditorItem type + UPDATE_ITEM reducer side-effect + 6 RED test stubs
- [ ] 23-02-PLAN.md — Wave 1: badge render in item-row.tsx + header column in section-card.tsx + saveEstimate price_source persistence + 6 stubs GREEN
**UI hint**: yes

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
| 19. Price Book DB Foundation | v1.3 | 2/2 | Complete    | 2026-05-07 |
| 20. Price Book CRUD UI | v1.3 | 3/3 | Complete    | 2026-05-07 |
| 21. CSV Import | v1.3 | 3/3 | Complete    | 2026-05-08 |
| 22. AI Price Anchoring | v1.3 | 3/3 | Complete    | 2026-05-08 |
| 23. Estimate Editor Price Badges | v1.3 | 1/2 | In Progress|  |
