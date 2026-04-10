# Requirements: EstimateBuilder Pro

**Defined:** 2026-04-09
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes.

## v1 Requirements

### Authentication & Onboarding

- [x] **AUTH-01**: User can sign up with email and password via Supabase Auth
- [x] **AUTH-02**: User can sign in with email and password
- [x] **AUTH-03**: User can sign in with Google OAuth
- [x] **AUTH-04**: User session persists across browser refresh (Supabase session management)
- [x] **AUTH-05**: User can reset password via email link
- [x] **AUTH-06**: After first sign-up with no company record, user is redirected to onboarding wizard
- [x] **AUTH-07**: User can sign out from any authenticated page

### Company Onboarding

- [x] **ONBOARD-01**: Multi-step wizard collects business info (name, owner name, phone, email, website)
- [x] **ONBOARD-02**: User selects industry from INDUSTRIES config (8 options)
- [x] **ONBOARD-03**: User picks brand primary color via color picker
- [x] **ONBOARD-04**: User can upload company logo (stored in Supabase Storage)
- [x] **ONBOARD-05**: User can enter business address, license number, insurance info
- [x] **ONBOARD-06**: User sets default tax rate, payment terms, and warranty terms
- [x] **ONBOARD-07**: After onboarding, user is redirected to main dashboard
- [x] **ONBOARD-08**: Onboarding can be skipped and completed later via Settings

### Dashboard

- [x] **DASH-01**: Dashboard shows total projects, pending estimates, accepted count, and total revenue stats
- [x] **DASH-02**: Project list displays all projects with name, client, type, status badge, total, and date
- [x] **DASH-03**: User can search projects by name or client name
- [x] **DASH-04**: User can filter projects by status (All, Draft, Processing, Ready, Sent, Accepted, Declined, Archived)
- [x] **DASH-05**: User can sort projects (newest, oldest, highest value, alphabetical)
- [x] **DASH-06**: "+ New Project" button is prominently accessible
- [x] **DASH-07**: Each project card has quick actions: View, Edit, Delete, Duplicate
- [x] **DASH-08**: Delete project shows confirmation dialog before proceeding

### Client Management

- [ ] **CLIENT-01**: User can view all clients in a searchable, filterable list
- [ ] **CLIENT-02**: User can create a new client (name required; email, phone, address, notes optional)
- [ ] **CLIENT-03**: User can upload a client logo (stored in Supabase Storage)
- [ ] **CLIENT-04**: User can edit client details
- [ ] **CLIENT-05**: User can view a client's associated projects
- [ ] **CLIENT-06**: User can delete a client with a confirmation dialog

### Project Creation

- [ ] **PROJ-01**: New project wizard has 3 steps: client selection, project details, confirmation
- [ ] **PROJ-02**: User can select an existing client or create a new one inline during project creation
- [ ] **PROJ-03**: Project name auto-suggests based on client name + project type
- [ ] **PROJ-04**: Project type dropdown is populated from the company's industry config
- [ ] **PROJ-05**: User can enter a custom project type if "Custom" is selected
- [ ] **PROJ-06**: User can optionally enter a target budget (USD)
- [ ] **PROJ-07**: Confirmation step shows summary before creating the project
- [ ] **PROJ-08**: After creation, user is redirected to the Project Workspace

### Project Workspace

- [ ] **WS-01**: Project workspace has 5 tabs: Overview, Audio Recording, Photos, AI Estimate, Preview & Send
- [ ] **WS-02**: Overview tab shows project summary card, activity timeline, and quick stats
- [ ] **WS-03**: Project status is displayed and updates automatically as actions are taken

### Audio Recording

- [ ] **AUDIO-01**: User can start and stop audio recording via a prominent mic button
- [ ] **AUDIO-02**: Recording timer displays elapsed time in MM:SS format
- [ ] **AUDIO-03**: Real-time waveform visualization is shown during recording (Web Audio API)
- [ ] **AUDIO-04**: Live transcript preview is shown during recording (Web Speech API, Chrome/supported browsers)
- [ ] **AUDIO-05**: After recording stops, audio is uploaded to Supabase Storage
- [ ] **AUDIO-06**: Audio is sent to OpenAI Whisper API for accurate transcription
- [ ] **AUDIO-07**: Transcript is displayed and user can edit it manually
- [ ] **AUDIO-08**: User can delete a recording and re-record
- [ ] **AUDIO-09**: Multiple recordings per project are supported; all transcripts are concatenated for AI
- [ ] **AUDIO-10**: Audio recording works on mobile browsers (iOS Safari, Android Chrome)

### Photo Management

- [ ] **PHOTO-01**: User can upload multiple photos via file input
- [ ] **PHOTO-02**: Photo upload supports camera capture on mobile (`capture="environment"`)
- [ ] **PHOTO-03**: Drag & drop upload is supported on desktop
- [ ] **PHOTO-04**: Photos are displayed in a grid with thumbnails
- [ ] **PHOTO-05**: User can view a photo full-size on tap/click
- [ ] **PHOTO-06**: User can delete individual photos
- [ ] **PHOTO-07**: User can reorder photos via drag & drop
- [ ] **PHOTO-08**: User can add/edit a caption per photo
- [ ] **PHOTO-09**: Photos are stored in Supabase Storage
- [ ] **PHOTO-10**: Maximum 20 photos per project enforced
- [ ] **PHOTO-11**: Images are compressed client-side before upload (max 2000px width)

### AI Estimate Generation

- [ ] **AI-01**: "Generate Estimate" button is enabled only when at least one transcript or photo exists
- [ ] **AI-02**: Photo analysis sends each photo to Claude Vision API and stores the description
- [ ] **AI-03**: Estimate generation sends all transcripts, photo descriptions, and project metadata to Claude API
- [ ] **AI-04**: Generation shows a multi-step progress indicator
- [ ] **AI-05**: AI response is parsed as structured JSON (sections, items, totals, terms)
- [ ] **AI-06**: All estimate math is validated and recalculated on receipt (item total = qty × price; section subtotal = sum of items)
- [ ] **AI-07**: Parsed estimate is saved to database (estimates, estimate_sections, estimate_items tables)
- [ ] **AI-08**: Project status updates to 'estimate_ready' after successful generation
- [ ] **AI-09**: If AI generation fails, user can retry; manual estimate creation is available as fallback
- [ ] **AI-10**: Each generation creates a new estimate version; previous versions are preserved

### Estimate Editor

- [ ] **EDIT-01**: Estimate is displayed with sections and line items in a professional layout
- [ ] **EDIT-02**: Each line item is editable inline (description, quantity, unit, unit price)
- [ ] **EDIT-03**: Totals recalculate in real-time on any edit
- [ ] **EDIT-04**: User can add new line items to any section
- [ ] **EDIT-05**: User can delete line items
- [ ] **EDIT-06**: User can reorder line items and sections
- [ ] **EDIT-07**: User can add and remove sections
- [ ] **EDIT-08**: User can edit summary, notes, timeline, and payment/warranty terms
- [ ] **EDIT-09**: User can apply a discount (percentage or fixed amount)
- [ ] **EDIT-10**: Tax is auto-calculated based on company default tax rate
- [ ] **EDIT-11**: Grand total updates in real-time
- [ ] **EDIT-12**: Changes auto-save (debounced) or user can manually save

### PDF & Sharing

- [ ] **PDF-01**: "Download PDF" generates a professional, branded PDF document server-side
- [ ] **PDF-02**: PDF includes company logo, brand colors, contact info, client info, project details, all line items, totals, terms
- [ ] **PDF-03**: PDF has proper page breaks, page numbers, and professional typography
- [ ] **SHARE-01**: "Copy Share Link" generates a unique public URL (`/estimate/[share_token]`)
- [ ] **SHARE-02**: Public estimate page displays full estimate without requiring authentication
- [ ] **SHARE-03**: Public page is branded with company logo and colors
- [ ] **SHARE-04**: Client can accept or decline from the public share link
- [ ] **SHARE-05**: Acceptance/decline is recorded with timestamp and updates project status
- [ ] **SHARE-06**: View event is logged to estimate_activity when client opens the share link
- [ ] **SHARE-07**: Business owner receives email notification when estimate is viewed/accepted/declined (if enabled)

### Email Delivery

- [ ] **EMAIL-01**: "Send via Email" opens a compose form pre-filled with client email and default subject
- [ ] **EMAIL-02**: Email body is a customizable template including estimate summary and share link
- [ ] **EMAIL-03**: User can optionally attach the PDF to the email
- [ ] **EMAIL-04**: Email is sent via Resend API
- [ ] **EMAIL-05**: Project status updates to 'sent' after successful send
- [ ] **EMAIL-06**: "Mark as Sent" manually marks project as sent (for in-person delivery)

### Settings

- [ ] **SET-01**: User can edit all company info from the settings page
- [ ] **SET-02**: User can update company logo and brand colors
- [ ] **SET-03**: User can set default payment terms, warranty terms, tax rate, and validity period
- [ ] **SET-04**: User can configure email notification preferences (viewed, accepted, declined)
- [ ] **SET-05**: User can change password and email
- [ ] **SET-06**: User can delete account with confirmation

### Data & Security

- [x] **SEC-01**: RLS enabled on all 8 database tables — users only access their company's data
- [x] **SEC-02**: Public share link routes bypass RLS for read-only estimate viewing
- [x] **SEC-03**: Service role key is never exposed to the browser; all privileged ops via server-side API routes
- [x] **SEC-04**: Audio, photo, and PDF files in Supabase Storage are scoped to the owning company

### Mobile & UX

- [x] **UX-01**: All screens are fully responsive and usable on mobile phones
- [x] **UX-02**: Touch targets are minimum 44px for mobile usability
- [x] **UX-03**: Bottom navigation bar is shown on mobile
- [x] **UX-04**: Skeleton loaders are shown while content loads
- [x] **UX-05**: Toast notifications confirm success and surface errors
- [ ] **UX-06**: Form validation shows inline error messages via zod + react-hook-form

## v2 Requirements

### Analytics & Insights

- **V2-01**: Dashboard charts showing monthly revenue, acceptance rate, top project types
- **V2-02**: Export projects to CSV

### Templates & Reuse

- **V2-03**: Save estimate structures as reusable templates
- **V2-04**: Duplicate existing project/estimate

### Extended Features

- **V2-05**: Spanish language support
- **V2-06**: Dark mode toggle
- **V2-07**: Client portal (clients log in to view all their estimates)
- **V2-08**: QuickBooks integration for invoicing
- **V2-09**: Offline PWA mode with background sync
- **V2-10**: Material cost database with auto-pricing suggestions
- **V2-11**: Estimate comparison (multiple versions side by side)
- **V2-12**: Web push notifications

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user / team accounts | Single user per company for v1; too complex for launch |
| Mobile native apps (iOS/Android) | Web app covers the use case; PWA deferred to v2 |
| Stripe billing / subscriptions | Auth-only for v1; monetization comes after validation |
| Multi-currency | US market only for v1 |
| Real-time collaboration | Single user workflow; no need for v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 to AUTH-07 | Phase 1 | Complete (01-04) |
| ONBOARD-01 to ONBOARD-08 | Phase 2 | Pending |
| DASH-01 to DASH-08 | Phase 3 | Pending |
| CLIENT-01 to CLIENT-06 | Phase 3 | Pending |
| PROJ-01 to PROJ-08 | Phase 4 | Pending |
| WS-01 to WS-03 | Phase 4 | Pending |
| AUDIO-01 to AUDIO-10 | Phase 5 | Pending |
| PHOTO-01 to PHOTO-11 | Phase 5 | Pending |
| AI-01 to AI-10 | Phase 6 | Pending |
| EDIT-01 to EDIT-12 | Phase 6 | Pending |
| PDF-01 to PDF-03 | Phase 7 | Pending |
| SHARE-01 to SHARE-07 | Phase 7 | Pending |
| EMAIL-01 to EMAIL-06 | Phase 7 | Pending |
| SET-01 to SET-06 | Phase 7 | Pending |
| SEC-01 to SEC-04 | Phase 1 | Complete (01-01 to 01-03) |
| UX-01 to UX-06 | All phases | Pending |

**Coverage:**
- v1 requirements: 83 total
- Mapped to phases: 83
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initialization*
