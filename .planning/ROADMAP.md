# Roadmap: EstimateBuilder Pro

## Overview

EstimateBuilder Pro delivers a full AI-powered estimating workflow for US service businesses. The build moves from infrastructure outward: auth and database first, then onboarding, then the core product surfaces (dashboard, clients, projects), then the AI-driven job-site capture pipeline (audio + photos), then the estimate generation and editing engine, and finally delivery (PDF, share links, email) plus settings. Each phase leaves the app in a coherent, runnable state.

**Core value:** A business owner can go from job-site audio recording to a sent, professional estimate in under 5 minutes.

**Total phases:** 7
**Total v1 requirements:** 83
**Coverage:** 83/83

---

## Phases

- [ ] **Phase 1: Foundation & Auth** - Project scaffold, Supabase wiring, database schema, and complete authentication flow
- [ ] **Phase 2: Company Onboarding** - Multi-step wizard that captures business identity and redirects to dashboard
- [ ] **Phase 3: Dashboard & Client Management** - Main app shell, project list with search/filter, and full client CRUD
- [ ] **Phase 4: Project Creation & Workspace** - New project wizard and the 5-tab workspace shell with overview tab
- [ ] **Phase 5: Audio Recording & Photo Management** - Job-site capture: mic recording with Whisper transcription and photo upload pipeline
- [ ] **Phase 6: AI Estimate Generation & Editor** - Claude-powered estimate generation, structured JSON persistence, and inline editor with auto-save
- [ ] **Phase 7: PDF, Sharing, Email & Settings** - Branded PDF export, public share page with client accept/decline, Resend email delivery, and settings

---

## Phase Details

### Phase 1: Foundation & Auth

**Goal**: The project is scaffolded with all tooling configured, the database schema is live with RLS, and a user can sign up, sign in (including Google OAuth), and sign out.
**UI hint**: yes
**Dependencies**: None

### Plans

1. **Project scaffold** — Initialize Next.js 14+ App Router project with TypeScript strict, Tailwind CSS, shadcn/ui (New York style), ESLint, and Bun; configure path aliases and environment variable types; wire Vercel deployment config.
2. **Supabase client wiring** — Create `lib/supabase/client.ts` (browser client), `lib/supabase/server.ts` (server component client), and `middleware.ts` (session refresh + protected route redirects); validate all env vars are loaded.
3. **Database migrations** — Write and run migrations for all 8 tables (`companies`, `clients`, `projects`, `recordings`, `photos`, `estimates`, `estimate_sections`, `estimate_items`, `estimate_activity`); enable RLS on every table; write row-level policies scoped to `company_id`; scope Storage buckets (`audio`, `photos`, `pdfs`, `logos`) with per-company access policies.
4. **Auth UI & flow** — Build `/auth/login`, `/auth/signup`, `/auth/reset-password` pages using shadcn/ui form components and Zod validation; implement Google OAuth sign-in button; implement session-aware redirect logic (no company → `/onboarding`; company exists → `/dashboard`); add sign-out action accessible from any authenticated page.

### Requirements
AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, SEC-01, SEC-02, SEC-03, SEC-04

### Success Criteria
- [ ] A new user can sign up with email/password and is redirected to `/onboarding` on first login
- [ ] An existing user can sign in with email/password or Google OAuth and reach `/dashboard`
- [ ] A signed-in user's session survives a full browser refresh without being logged out
- [ ] A user can trigger a password-reset email and follow the link to set a new password
- [ ] Direct navigation to `/dashboard` while logged out redirects to `/auth/login`

---

### Phase 2: Company Onboarding

**Goal**: A newly registered user can complete a 3-step onboarding wizard that captures their business identity, uploads a logo, and lands them on the main dashboard with a populated company record.
**UI hint**: yes
**Dependencies**: Phase 1

### Plans

1. **INDUSTRIES config & types** — Define the `INDUSTRIES` constant (8 service types) with associated project-type lists and default templates; export shared TypeScript types for `Company`, `Industry`, and `BrandConfig`.
2. **Onboarding wizard UI** — Build the `/onboarding` multi-step wizard with three steps: (1) business info form (name, owner, phone, email, website), (2) industry selector + brand color picker, (3) address/license/insurance + tax rate/payment terms/warranty terms; include step progress indicator and skip-to-later affordance.
3. **Logo upload & company persistence** — Implement logo upload to Supabase Storage (`logos` bucket, company-scoped path); write the `POST /api/company` server action that inserts or updates the `companies` row; on completion redirect to `/dashboard`.

### Requirements
ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04, ONBOARD-05, ONBOARD-06, ONBOARD-07, ONBOARD-08

### Success Criteria
- [ ] A user who skips a step can return to Settings later and complete the fields without losing previously entered data
- [ ] After completing all three wizard steps the user lands on `/dashboard` with their company name visible in the navigation
- [ ] Uploading a logo stores the file in the `logos` Storage bucket and displays a preview in the wizard before submission
- [ ] The industry selection on step 2 populates the project-type list visible in phase 4's project creation wizard
- [ ] The brand primary color chosen in the wizard is reflected in the PDF and share page generated later

---

### Phase 3: Dashboard & Client Management

**Goal**: A signed-in user can see all their projects at a glance, search and filter the list, and perform full CRUD on clients including logo upload.
**UI hint**: yes
**Dependencies**: Phase 2

### Plans

1. **App shell layout** — Build the persistent shell with sidebar navigation (desktop) and bottom navigation bar (mobile, 44px touch targets); add responsive topbar with company name and user menu; implement skeleton loaders and global toast notification provider.
2. **Dashboard stats & project list** — Build the `/dashboard` page with four stat cards (total projects, pending estimates, accepted, total revenue); implement the project list table/card view with name, client, type, status badge, total, and date; wire search (by project name or client name), status filter tabs, and sort controls; add project card quick actions (View, Edit, Delete with confirmation dialog, Duplicate).
3. **Client management** — Build `/clients` list page with search and filter; implement create/edit client drawer/modal (name required, email/phone/address/notes optional); implement logo upload to `logos` bucket; implement view-client page showing associated projects; implement delete with confirmation dialog.

### Requirements
DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, CLIENT-01, CLIENT-02, CLIENT-03, CLIENT-04, CLIENT-05, CLIENT-06, UX-01, UX-02, UX-03, UX-04, UX-05, UX-06

### Success Criteria
- [ ] Dashboard stat cards reflect accurate counts and revenue totals based on real database rows
- [ ] Searching "Smith" in the project list filters the list to only projects whose name or client name contains "Smith"
- [ ] Filtering by status "Accepted" shows only accepted projects; clearing the filter restores all projects
- [ ] A new client can be created, edited, have a logo uploaded, and be deleted — each action reflected immediately in the list without a full page reload
- [ ] On a 375px-wide viewport, the app renders the bottom navigation bar, all touch targets are at least 44px, and no horizontal scroll appears

---

### Phase 4: Project Creation & Workspace

**Goal**: A user can create a new project through a 3-step wizard (including inline client creation) and land in a 5-tab workspace where the overview tab shows the project summary and activity timeline.
**UI hint**: yes
**Dependencies**: Phase 3

### Plans

1. **New project wizard** — Build the 3-step `NewProjectWizard` modal/page: (1) client selector with inline "Create new client" flow, (2) project details (name auto-suggestion from client + type, type dropdown from industry config, custom type option, target budget field), (3) confirmation summary; on submit call `POST /api/projects`, then redirect to `/projects/[id]`.
2. **Project workspace shell & Overview tab** — Build the `/projects/[id]` layout with 5 tabs (Overview, Audio Recording, Photos, AI Estimate, Preview & Send); implement the Overview tab with project summary card (name, client, type, status badge, total), activity timeline component, and quick stats; implement project status state machine that updates status automatically as later actions are taken.
3. **Project API routes** — Implement `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]`; implement project duplication endpoint; ensure all routes verify the authenticated user owns the project via RLS.

### Requirements
PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05, PROJ-06, PROJ-07, PROJ-08, WS-01, WS-02, WS-03

### Success Criteria
- [ ] A user can create a project selecting an existing client and land in the workspace in under 4 clicks
- [ ] A user can create a project with a brand-new client created inline during the wizard without leaving the flow
- [ ] The project name field auto-populates with "{Client Name} – {Project Type}" when both fields are selected
- [ ] All 5 tabs are visible and navigable in the workspace; the Overview tab shows the project summary card and a timestamped activity entry for project creation
- [ ] Project status badge on the dashboard updates to reflect changes made inside the workspace

---

### Phase 5: Audio Recording & Photo Management

**Goal**: A user on a job site can record audio with a live waveform and transcript preview, upload photos from camera or file, and all media is stored in Supabase Storage ready for AI processing.
**UI hint**: yes
**Dependencies**: Phase 4

### Plans

1. **Audio recording UI** — Build the Audio Recording tab with MediaRecorder integration; implement MM:SS timer, Web Audio API waveform visualization, and Web Speech API live transcript preview; add start/stop/delete/re-record controls; ensure the implementation works on iOS Safari and Android Chrome.
2. **Whisper transcription pipeline** — On recording stop, upload the audio blob to Supabase Storage (`audio` bucket, project-scoped path); call `POST /api/transcribe` server route that sends the file to OpenAI Whisper API; return and persist the transcript; display the transcript below the recorder with manual edit capability; support multiple recordings per project with all transcripts concatenated in the AI prompt.
3. **Photo upload & management UI** — Build the Photos tab with multi-file input (`accept="image/*"`, `capture="environment"` for mobile), drag-and-drop zone (desktop), and client-side compression to max 2000px width; implement photo grid with thumbnails; implement full-size lightbox on tap/click; implement caption editing, reordering via drag-and-drop, and individual delete; enforce 20-photo maximum with user feedback; upload compressed files to Supabase Storage (`photos` bucket, project-scoped path).

### Requirements
AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-04, AUDIO-05, AUDIO-06, AUDIO-07, AUDIO-08, AUDIO-09, AUDIO-10, PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04, PHOTO-05, PHOTO-06, PHOTO-07, PHOTO-08, PHOTO-09, PHOTO-10, PHOTO-11

### Success Criteria
- [ ] A user can record audio, see the waveform animate and the live transcript update in real time, stop the recording, and see the Whisper-processed transcript appear within a few seconds
- [ ] A user can manually edit the displayed transcript and those edits persist after a page refresh
- [ ] A user can upload 5 photos via drag-and-drop on desktop; each appears in the grid as a thumbnail; clicking one opens a full-size view
- [ ] A user on a mobile device can tap "Take Photo", capture an image with the camera, and see it appear in the photo grid
- [ ] Attempting to upload a 21st photo displays an error toast and the upload is rejected client-side

---

### Phase 6: AI Estimate Generation & Editor

**Goal**: A user can click "Generate Estimate", watch a multi-step progress indicator, and receive a fully structured, editable estimate with real-time recalculating totals that auto-saves to the database.
**UI hint**: yes
**Dependencies**: Phase 5

### Plans

1. **Claude Vision photo analysis** — Implement `POST /api/analyze-photos` server route that sends each project photo to Claude Vision API and stores the returned description on the `photos` row; run analyses in parallel; surface per-photo status in the UI.
2. **Estimate generation & persistence** — Implement `POST /api/generate-estimate` server route: build the full prompt (transcripts + photo descriptions + project metadata + company context); call Claude API with a structured JSON schema response; validate all math (item total = qty × unit price; section subtotal = sum of items); insert rows into `estimates`, `estimate_sections`, and `estimate_items`; update project status to `estimate_ready`; handle generation failures with retry and manual-creation fallback; create a new version record on each generation, preserving previous versions.
3. **Estimate editor UI** — Build the AI Estimate tab with the estimate editor: section headers and collapsible line items with inline editing (description, quantity, unit, unit price); real-time total recalculation on every keypress; add/remove/reorder items and sections; summary/notes/timeline/terms editing; discount field (percentage or fixed); auto-calculated tax line from company default rate; grand total display; debounced auto-save with manual save button fallback; multi-step generation progress indicator; version history selector.

### Requirements
AI-01, AI-02, AI-03, AI-04, AI-05, AI-06, AI-07, AI-08, AI-09, AI-10, EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05, EDIT-06, EDIT-07, EDIT-08, EDIT-09, EDIT-10, EDIT-11, EDIT-12

### Success Criteria
- [ ] With at least one transcript present, "Generate Estimate" is enabled; clicking it shows a multi-step progress indicator and produces a complete estimate with sections and line items within 30 seconds
- [ ] Editing a line item's unit price causes the item total, section subtotal, and grand total to update within one second without a page reload
- [ ] Adding a new line item to a section and saving results in that item being present after a full page refresh
- [ ] Applying a 10% discount reduces the subtotal correctly and updates the grand total in real time
- [ ] The "Generate Estimate" button is disabled (with tooltip) when no transcript or photo exists in the project

---

### Phase 7: PDF, Sharing, Email & Settings

**Goal**: A user can download a branded PDF, share a public link the client can accept or decline, send the estimate via email with optional PDF attachment, and manage all company settings — completing the full estimate delivery workflow.
**UI hint**: yes
**Dependencies**: Phase 6

### Plans

1. **PDF generation** — Implement `GET /api/estimates/[id]/pdf` server route using `@react-pdf/renderer`; build a branded PDF document component that includes company logo, brand colors, contact info, client info, project details, all sections and line items, totals (subtotal, discount, tax, grand total), payment/warranty terms, page numbers, and proper page breaks; return as a downloadable PDF binary.
2. **Public share page & client response** — Generate a unique `share_token` (UUID) on estimate save; implement the public `/estimate/[share_token]` page (unauthenticated, read-only, branded with company logo and colors); implement "Accept" and "Decline" buttons that call `POST /api/estimates/share/[token]/respond`; record acceptance/decline with timestamp and update project status; log each view event to `estimate_activity`; send email notification to the business owner via Resend when the estimate is viewed, accepted, or declined (if notification preference enabled).
3. **Email delivery** — Build the "Send via Email" compose form in the Preview & Send tab pre-filled with client email and default subject; implement a customizable email body template with estimate summary and share link; implement optional PDF attachment toggle; call `POST /api/estimates/[id]/send` which uses the Resend API; update project status to `sent` on success; implement "Mark as Sent" button for in-person delivery.
4. **Settings page** — Build `/settings` with four sections: (1) Company Info — all fields from onboarding editable including logo and brand color; (2) Defaults — payment terms, warranty terms, tax rate, validity period; (3) Notifications — toggles for viewed/accepted/declined email alerts; (4) Account — change password, change email, delete account with confirmation dialog.

### Requirements
PDF-01, PDF-02, PDF-03, SHARE-01, SHARE-02, SHARE-03, SHARE-04, SHARE-05, SHARE-06, SHARE-07, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06, SET-01, SET-02, SET-03, SET-04, SET-05, SET-06

### Success Criteria
- [ ] Clicking "Download PDF" produces a PDF file containing the company logo, all line items with correct totals, and terms — and the file opens correctly in a PDF viewer
- [ ] A client opening the public share URL sees the full estimate without being asked to log in; clicking "Accept" updates the project status to "accepted" on the business owner's dashboard
- [ ] A view event is logged to `estimate_activity` each time the share link is opened, visible in the Overview tab timeline
- [ ] "Send via Email" sends a Resend-delivered email to the client address containing the share link; the project status changes to "sent"
- [ ] All company fields edited in Settings are reflected in the next PDF generated and the next share page served

---

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 0/4 | Not started | - |
| 2. Company Onboarding | 0/3 | Not started | - |
| 3. Dashboard & Client Management | 0/3 | Not started | - |
| 4. Project Creation & Workspace | 0/3 | Not started | - |
| 5. Audio Recording & Photo Management | 0/3 | Not started | - |
| 6. AI Estimate Generation & Editor | 0/3 | Not started | - |
| 7. PDF, Sharing, Email & Settings | 0/4 | Not started | - |
