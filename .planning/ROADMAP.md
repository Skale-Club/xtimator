# Roadmap: EstimateBuilder Pro

## Overview

EstimateBuilder Pro delivers a full AI-powered estimating workflow for US service businesses. The build moves from infrastructure outward: auth and database first, then onboarding, then the core product surfaces (dashboard, clients, projects), then the AI-driven job-site capture pipeline (audio + photos), then the estimate generation and editing engine, and finally delivery (PDF, share links, email) plus settings. Each phase leaves the app in a coherent, runnable state.

**Core value:** A business owner can go from job-site audio recording to a sent, professional estimate in under 5 minutes.

**Total phases:** 7
**Total v1 requirements:** 83
**Coverage:** 83/83

---

## Phases

- [x] **Phase 1: Foundation & Auth** - Project scaffold, Supabase wiring, database schema, and complete authentication flow (completed 2026-04-09)
- [x] **Phase 2: Company Onboarding** - Multi-step wizard that captures business identity and redirects to dashboard (completed 2026-04-10)
- [x] **Phase 3: Dashboard & Client Management** - Main app shell, project list with search/filter, and full client CRUD
- [x] **Phase 4: Project Creation & Workspace** - New project wizard and the 5-tab workspace shell with overview tab (completed 2026-04-10)
- [x] **Phase 5: Audio Recording & Photo Management** - Job-site capture: mic recording with Whisper transcription and photo upload pipeline (completed 2026-04-10)
- [x] **Phase 6: AI Estimate Generation & Editor** - Claude-powered estimate generation, structured JSON persistence, and inline editor with auto-save (completed 2026-04-10)
- [x] **Phase 7: PDF, Sharing, Email & Settings** - Branded PDF export, public share page with client accept/decline, Resend email delivery, and settings (completed 2026-04-10)

---

## Phase Details

### Phase 1: Foundation & Auth

**Goal**: The project is scaffolded with all tooling configured, the database schema is live with RLS, and a user can sign up, sign in (including Google OAuth), and sign out.
**UI hint**: yes
**Dependencies**: None

### Plans

**Plans:** 4/4 plans complete

Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js project, install all shadcn/ui components, configure env vars, wire test infrastructure (Wave 1)
- [x] 01-02-PLAN.md — Supabase SSR client wiring (browser, server, proxy), middleware route protection (Wave 2)
- [x] 01-03-PLAN.md — Database migrations: 9 tables, RLS policies, Storage buckets (Wave 2, parallel with 01-02)
- [x] 01-04-PLAN.md — Auth pages UI: login, signup, reset-password, callback route, server actions (Wave 3)

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

**Plans:** 3/3 plans complete

Plans:
- [x] 02-01-PLAN.md — INDUSTRIES config, onboarding Zod schema, and unit tests (Wave 1)
- [x] 02-02-PLAN.md — Onboarding wizard UI: 3-step form with industry selector, color picker, logo uploader (Wave 2)
- [x] 02-03-PLAN.md — Server action for company persistence and logo upload to Supabase Storage (Wave 3)

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

**Plans:** 3/3 plans complete

Plans:
- [x] 03-01-PLAN.md — App shell layout (sidebar, topbar, bottom nav), shared components (StatusBadge, EmptyState), data layer (queries, schemas, server actions) (Wave 1)
- [x] 03-02-PLAN.md — Dashboard page with stat cards, project list with search/filter/sort, quick actions (Wave 2)
- [x] 03-03-PLAN.md — Client management: list page, create/edit Sheet, logo upload, detail page, delete flow (Wave 2)

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

**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md — Data layer: project Zod schema, query functions (getProjectById, getProjectActivity, getProjectQuickStats), createProjectAction, relative-time utility (Wave 1)
- [x] 04-02-PLAN.md — New Project Wizard: 3-step form at /projects/new with client selection, inline client creation, project details with auto-name, confirmation (Wave 2)
- [x] 04-03-PLAN.md — Project Workspace: 5-tab layout at /projects/[id] with Overview tab (summary card, activity timeline, quick stats), placeholder tabs for Phases 5-7 (Wave 2) -- COMPLETE (files written, commits pending)

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

**Plans:** 4/4 plans complete

Plans:
- [x] 05-01-PLAN.md — Data layer: service role client, recording/photo queries and actions, media format detection, image compression utility, @dnd-kit install (Wave 1)
- [x] 05-02-PLAN.md — Audio Recording tab: MediaRecorder with waveform visualization, timer, live transcript preview, recording list with playback and transcript editing (Wave 2)
- [x] 05-03-PLAN.md — Photos tab: drop zone with camera capture and drag-and-drop, client-side compression, sortable grid with @dnd-kit, lightbox, caption editing, 20-photo limit (Wave 2)
- [x] 05-04-PLAN.md — Workspace wiring: replace PlaceholderTab with AudioTab and PhotosTab, load recordings/photos server-side, human verification checkpoint (Wave 3)

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

**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md — Anthropic SDK install, estimate TypeScript interfaces/queries, POST /api/analyze-photos Claude Vision route (Wave 1)
- [x] 06-02-PLAN.md — POST /api/generate-estimate route with Claude tool_use, math validation, DB persistence, version management; estimate server actions for save/blank creation (Wave 1)
- [x] 06-03-PLAN.md — Estimate editor UI: useReducer state, inline editing, real-time recalc, drag reorder, discount/tax, auto-save, generation progress, version selector, workspace wiring (Wave 2)

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

**Plans:** 4/4 plans complete

Plans:
- [x] 07-01-PLAN.md — PDF generation: @react-pdf/renderer install, EstimatePDF document component, GET /api/estimates/[id]/pdf route (Wave 1)
- [x] 07-02-PLAN.md — Public share page: /estimate/[token] with branded view, accept/decline, view logging, email notifications (Wave 2)
- [x] 07-03-PLAN.md — Email delivery: Resend install, Send tab with preview/compose form, POST /api/estimates/[id]/send, Mark as Sent, workspace wiring (Wave 2)
- [x] 07-04-PLAN.md — Settings page: company info, defaults, notifications, account management (Wave 1)

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

**Execution Order:** 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 4/4 | Complete    | 2026-04-10 |
| 2. Company Onboarding | 3/3 | Complete | 2026-04-10 |
| 3. Dashboard & Client Management | 3/3 | Complete |  |
| 4. Project Creation & Workspace | 3/3 | Complete   | 2026-04-10 |
| 5. Audio Recording & Photo Management | 4/4 | Complete   | 2026-04-10 |
| 6. AI Estimate Generation & Editor | 3/3 | Complete   | 2026-04-10 |
| 7. PDF, Sharing, Email & Settings | 4/4 | Complete   | 2026-04-10 |
