# Roadmap: Xtimator

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-04-21) · [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Dark-first UX & Modern Redesign** — Phase 9 (shipped 2026-04-22) · [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Brand Identity & Global Reach** — Phases 10-18 (shipped 2026-05-06) · [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Smart Pricing** — Phases 19-23 (shipped 2026-05-08) · [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 Estimate Plain Text & Pricing Tools** — Phases 24-26 (shipped 2026-05-08) · [archive](milestones/v1.4-ROADMAP.md)
- ✅ **v1.5 Zero-friction Project Onboarding** — Phases 27-30 (shipped 2026-05-09)
- ✅ **v1.6 Multi-modal Project Input** — Phases 31-33 (shipped 2026-05-09)
- ✅ **v1.7 Client-Project Quick Actions** — Phase 34 (shipped 2026-05-09)
- ✅ **v1.8 Iterative Estimate Refinement** — Phases 35-37 (shipped 2026-05-09)
- 🔲 **v1.9 Custom Domain Support** — Phases 38-39 (in progress)

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

<details>
<summary>✅ v1.4 Estimate Plain Text & Pricing Tools (Phases 24-26) — SHIPPED 2026-05-08</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 24 | Estimate Template Engine + Settings Page | 3/3 | 2026-05-08 |
| 25 | Plain Text Tab + Copy UI | 2/2 | 2026-05-08 |
| 26 | Bulk Price Adjustment | 2/2 | 2026-05-08 |

</details>

### v1.5 Zero-friction Project Onboarding (Phases 27-30)

- [x] **Phase 27: Capture Schema Migration** — Make `recordings.storage_path` nullable and `projects.client_id` optional so text-path and client-optional flows are unblocked (completed 2026-05-08)
- [x] **Phase 28: Unified Capture Screen** - Redesign the capture screen with audio, text description, and photo upload as co-equal inputs; enable Generate Estimate from any combination (completed 2026-05-09)
- [x] **Phase 29: Frictionless Project Creation & Client Linking** — Remove mandatory client step from project wizard; add New Project button on client detail page; show Link Client card in project Overview when no client is set
 (completed 2026-05-09)
- [x] **Phase 30: AI Client Extraction** — After estimate generation, surface a non-blocking toast when AI detects a client name in content, letting the user accept or dismiss the suggested link
 (completed 2026-05-09)

### v1.6 Multi-modal Project Input (Phases 31-33)

- [x] **Phase 31: Wizard Modality Selection** — Add second step to project wizard with 3 modality choice cards (Audio/Text/Photos); redirect to appropriate route based on selection; store input_mode on project (1 plan) (completed 2026-05-09)
- [ ] **Phase 32: Text Input Route** — New `/projects/[id]/describe` route with large textarea; save text as transcript; "Generate Estimate" button triggers same pipeline as audio (1 plan)
  - [x] 32-01-PLAN.md — Route shell + TextDescribe component + generate pipeline wiring
- [ ] **Phase 33: Photos Input Route** — New `/projects/[id]/photos-input` route with direct upload; "Generate from Photos" button prominent when photos added; Claude Vision pipeline
  - [x] 33-01-PLAN.md — Route shell + PhotosInput component + generate pipeline wiring

### v1.9 Custom Domain Support (Phases 38-39)

- [x] **Phase 38: Custom Domain DB + Settings UI** — Add `custom_domain` column to companies table; add domain input field + DNS/CNAME setup instructions to settings page; companies without a domain configured are unaffected (completed 2026-05-10)
- [x] **Phase 39: Subdomain Routing + White-label Estimate View** — Detect custom host in `proxy.ts`; rewrite requests to `/estimate/{token}` without redirect; hide "Generated by Xtimator" footer when estimate is served from a custom domain (completed 2026-05-10)

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
- [x] 25-01-PLAN.md — buildItemsBreakdown utility function + unit tests (TDD RED→GREEN)
- [x] 25-02-PLAN.md — PlainTextCard component + data chain wiring (page.tsx → ProjectWorkspace → SendTab → PlainTextCard)
**UI hint**: yes

### Phase 26: Bulk Price Adjustment
**Goal**: Users can raise or lower all prices in a price book category with one confirmed action
**Depends on**: Phase 20 (Price Book CRUD UI — needs existing items to adjust), Phase 19 (price_source column in place)
**Requirements**: BULKPRICE-01, BULKPRICE-02, BULKPRICE-03
**Success Criteria** (what must be TRUE):
  1. From the price book page, user can select a category and enter a percentage adjustment (positive or negative)
  2. Before confirming, user sees a table comparing current unit prices vs projected new prices for every item in that category
  3. After confirming, all item prices in that category update simultaneously — no partial saves leave some items at old prices
**Plans**: 2 plans
Plans:
- [x] 26-01-PLAN.md — bulkAdjustSchema + bulkAdjustPriceBookCategory server action (test-first: Wave 0 RED stubs + Wave 1 implementation)
- [x] 26-02-PLAN.md — BulkAdjustDialog component + PriceBookList wiring (Adjust % button + live preview table)

### Phase 27: Capture Schema Migration
**Goal**: The database schema supports text-only recordings (no audio file) and projects without a linked client
**Depends on**: Phase 18 (capture route exists), Phase 4 (projects schema baseline)
**Requirements**: (infrastructure prerequisite — unblocks CAPTURE-02, CAPTURE-04, CLIENTASSOC-01, CLIENTASSOC-04)
**Success Criteria** (what must be TRUE):
  1. A recording row can be inserted with a non-null transcript but a null storage_path, and the application does not error on such rows
  2. A project can be created and saved without a client_id value, and no constraint violation is raised
  3. Existing recordings with audio files and existing projects with clients continue to load and render correctly
**Plans**: 1 plan
Plans:
- [x] 27-01-PLAN.md — DB migration (nullable storage_path) + TypeScript type propagation + optional clientId schema + caller null-guards

### Phase 28: Unified Capture Screen
**Goal**: Users can provide audio, typed description, or photos as co-equal inputs on the capture screen — alone or combined — and generate an estimate from any combination
**Depends on**: Phase 27 (nullable storage_path and optional client_id must exist)
**Requirements**: CAPTURE-01, CAPTURE-02, CAPTURE-03, CAPTURE-04
**Success Criteria** (what must be TRUE):
  1. The audio recorder remains the visually dominant element on the capture screen, with recording controls unchanged from the current full-screen UX
  2. A user who types a job description and taps Generate Estimate — without recording any audio — gets a generated estimate using that text as the input
  3. A user who uploads one or more photos — without recording audio or typing text — can tap Generate Estimate and receive an estimate derived from those photos
  4. The Generate Estimate button is disabled when the capture screen has no transcript, no typed description, and no photos; it becomes enabled the moment any one of those inputs is present
**Plans**: 1 plan
Plans:
- [x] 28-01-PLAN.md - Multi-modal capture UI: generate-estimate guard fix, createTextRecording, description textarea, photo upload, GenerateEstimate button

### Phase 29: Frictionless Project Creation & Client Linking
**Goal**: Users can create a project without selecting a client upfront, and can link a client at any point from multiple entry surfaces
**Depends on**: Phase 27 (optional client_id schema), Phase 28 (capture screen accepts client-less projects)
**Requirements**: CLIENTASSOC-01, CLIENTASSOC-02, CLIENTASSOC-04
**Success Criteria** (what must be TRUE):
  1. A user can complete the new project wizard and reach the capture screen without selecting or creating a client — the client field is optional, not blocking
  2. On any client detail page, a "New Project" button creates a new project pre-linked to that client and navigates directly to the capture screen without showing a client selection step
  3. A project with no linked client shows a visible "Link client" card in the Overview tab, and the user can link a client from that card
  4. A project that already has a linked client does not show the "Link client" card in Overview
**Plans**: 1 plan
Plans:
- [x] 29-01-PLAN.md - Make client optional in wizard, add New Project button on client detail, add Link Client card in Overview
**UI hint**: yes

### Phase 30: AI Client Extraction
**Goal**: After estimate generation, users are offered a non-blocking opportunity to link the AI-detected client name to an existing client record
**Depends on**: Phase 28 (estimate generation must have run), Phase 29 (client linking surface must exist)
**Requirements**: CLIENTASSOC-03
**Success Criteria** (what must be TRUE):
  1. When the AI detects a client name in the transcript, description, or photo analysis, a toast notification appears after estimate generation with the detected name — it does not interrupt or block the estimate editor
  2. The user can accept the suggestion, which links the project to the matching existing client (or prompts to create one if no match exists), or dismiss it with no change to any record
  3. If the AI does not detect a client name, no toast appears and the flow is identical to today
**Plans**: 1 plan
Plans:
- [x] 30-01-PLAN.md - AI client extraction output, conservative client matching, and non-blocking suggestion toast

### Phase 31: Wizard Modality Selection
**Goal**: Users choose their preferred input modality (audio, text, or photos) as the second step of project creation, with each choice leading to a dedicated capture route
**Depends on**: Phase 28 (unified capture screen exists), Phase 29 (client-optional wizard exists)
**Requirements**: WIZARD-01, WIZARD-02, WIZARD-03, WIZARD-04
**Success Criteria** (what must be TRUE):
  1. After selecting a client (or skipping), the user sees 3 large clickable cards labeled "Audio", "Text", and "Photos" — each with an icon and a one-line use case description
  2. Clicking the Audio card navigates to `/projects/[id]/capture` (existing route)
  3. Clicking the Text card navigates to `/projects/[id]/describe` (new route)
  4. Clicking the Photos card navigates to `/projects/[id]/photos-input` (new route)
  5. The selected modality is stored in the project record as `input_mode` and persists across sessions
**Plans**: 1 plan
Plans:
- [x] 31-01-PLAN.md — Database migration + types + schema + StepModalitySelect component + 2-step wizard + action updates
**UI hint**: yes

### Phase 32: Text Input Route
**Goal**: Users can type a job description and generate an estimate without recording any audio
**Depends on**: Phase 31 (wizard redirects to this route), Phase 27 (text-only recordings supported)
**Requirements**: TEXT-01, TEXT-02, TEXT-03, TEXT-04, TEXT-05
**Success Criteria** (what must be TRUE):
  1. The `/projects/[id]/describe` route displays a textarea with placeholder text showing example job descriptions
  2. The textarea is large enough for at least 10 lines of input with comfortable line height
  3. Clicking "Save & Generate Estimate" creates a recording with the typed text as `transcript` (no storage_path, no duration_seconds)
  4. The estimate generation pipeline runs identically to the audio route — the only difference is the text origin
  5. The route is mobile-responsive with touch-friendly tap targets (minimum 44px)
**Plans**: 1 plan
Plans:
- [x] 32-01-PLAN.md — Route shell + TextDescribe component + generate pipeline wiring

### Phase 33: Photos Input Route
**Goal**: Users can upload photos and generate an estimate without recording audio or typing text
**Depends on**: Phase 31 (wizard redirects to this route), Phase 27 (photos-only flow supported)
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04
**Success Criteria** (what must be TRUE):
  1. The `/projects/[id]/photos-input` route displays a direct photo upload zone without requiring navigation through the workspace
  2. The PhotoDropZone component is reused from the existing workspace
  3. A "Generate from Photos" button is visible and prominent as soon as at least 1 photo is uploaded
  4. Clicking the button runs the Claude Vision pipeline to analyze the photos and generate the estimate (no transcript required)
  5. The user lands in the estimate editor with the generated result, same as audio/text flows
**Plans**: 1 plan
Plans:
- [x] 33-01-PLAN.md — Route shell + PhotosInput component + generate pipeline wiring

### v1.7 Client-Project Quick Actions (Phase 34)

- [x] **Phase 34: Client-Project Quick Actions Verification** — Verify all CLIENTASSOC features work correctly; address any gaps (completed 2026-05-09)
   - [x] 34-01-PLAN.md — Verification plan (4 human checkpoint tasks)

### v1.8 Iterative Estimate Refinement (Phases 35-37)

- [x] **Phase 35: Text Refinement** — Add text input refinement panel to estimate editor, new API endpoint `/api/estimates/[id]/refine`, AI refinement prompt, new version creation
   - [x] 35-01-PLAN.md — Text refinement panel + API endpoint + AI integration (COMPLETE)
- [x] **Phase 36: Voice Refinement** — Inline voice recorder (~30s), Whisper transcription, same refinement pipeline
   - [x] 36-01-PLAN.md — VoiceRefineRecorder + voice API route + panel wiring (COMPLETE 2026-05-09)
- [x] **Phase 37: Photo Refinement** — Photo upload, Claude Vision analysis, auto-generate instruction
   - [x] 37-01-PLAN.md — Photo upload section in refine panel + Claude Vision API route

### Phase 38: Custom Domain DB + Settings UI
**Goal**: Company owners can enter and save a custom domain from settings, and see DNS/CNAME instructions — companies without a domain configured are completely unaffected
**Depends on**: Phase 7 (Settings infrastructure), Phase 27 (DB migration pattern)
**Requirements**: DOMAIN-01, DOMAIN-02, DOMAIN-05
**Success Criteria** (what must be TRUE):
  1. Owner can navigate to `/settings` (or a settings sub-section) and see a "Custom Domain" field where they can enter a domain such as `estimates.mycompany.com` and save it
  2. After saving a domain, the page shows DNS/CNAME setup instructions explaining which record to add and what value to point it to (Vercel's CNAME target)
  3. A company that leaves the custom domain field empty continues to generate and share estimates on `xtimator.com/estimate/{token}` — no change to any existing behavior
  4. The saved domain persists across sessions and is scoped to the company (not shared across companies)
**Plans**: TBD
**UI hint**: yes

### Phase 39: Subdomain Routing + White-label Estimate View
**Goal**: Requests arriving at a company's custom domain render the correct estimate directly — no redirect, no Xtimator branding in the footer
**Depends on**: Phase 38 (custom_domain column must exist and be populated)
**Requirements**: DOMAIN-03, DOMAIN-04
**Success Criteria** (what must be TRUE):
  1. A browser request to `estimates.mycompany.com/estimate/{token}` renders the estimate page with the company's logo, name, and colors — without redirecting to xtimator.com
  2. The "Generated by Xtimator" footer is absent when the estimate is served from a custom domain; only company branding is visible
  3. The same share token accessed via `xtimator.com/estimate/{token}` continues to render normally with the Xtimator footer intact — no regression for standard links
**Plans**: 1 plan
Plans:
- [x] 39-01-PLAN.md — proxy.ts custom host detection + EstimateView white-label prop + estimate page header wiring + unit tests
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
| 19. Price Book DB Foundation | v1.3 | 2/2 | Complete | 2026-05-07 |
| 20. Price Book CRUD UI | v1.3 | 3/3 | Complete | 2026-05-07 |
| 21. CSV Import | v1.3 | 3/3 | Complete | 2026-05-08 |
| 22. AI Price Anchoring | v1.3 | 3/3 | Complete | 2026-05-08 |
| 23. Estimate Editor Price Badges | v1.3 | 2/2 | Complete | 2026-05-08 |
| 24. Estimate Template Engine + Settings Page | v1.4 | 3/3 | Complete    | 2026-05-08 |
| 25. Plain Text Tab + Copy UI | v1.4 | 2/2 | Complete    | 2026-05-08 |
| 26. Bulk Price Adjustment | v1.4 | 2/2 | Complete    | 2026-05-08 |
| 27. Capture Schema Migration | v1.5 | 1/1 | Complete    | 2026-05-08 |
| 28. Unified Capture Screen | v1.5 | 1/1 | Complete | 2026-05-09 |
| 29. Frictionless Project Creation & Client Linking | v1.5 | 1/TBD | Complete    | 2026-05-09 |
| 30. AI Client Extraction | v1.5 | 1/1 | Complete    | 2026-05-09 |
| 31. Wizard Modality Selection | v1.6 | 1/1 | Complete   | 2026-05-09 |
| 32. Text Input Route | v1.6 | 1/1 | Complete    | 2026-05-09 |
| 33. Photos Input Route | v1.6 | 1/1 | Complete    | 2026-05-09 |
| 35. Text Refinement | v1.8 | 1/1 | Complete    | 2026-05-09 |
| 36. Voice Refinement | v1.8 | 1/1 | Complete    | 2026-05-09 |
| 37. Photo Refinement | v1.8 | 1/1 | Complete   | 2026-05-09 |
| 34. Client-Project Quick Actions Verification | v1.7 | 1/1 | Complete | 2026-05-09 |
| 38. Custom Domain DB + Settings UI | v1.9 | 2/2 | Complete   | 2026-05-10 |
| 39. Subdomain Routing + White-label Estimate View | v1.9 | 1/1 | Complete    | 2026-05-10 |
