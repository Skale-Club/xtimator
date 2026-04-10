# EstimateBuilder Pro

## What This Is

EstimateBuilder Pro is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate — ready to send as a branded PDF or shareable link.

## Core Value

A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Requirements

### Validated

- [x] Users can sign up, sign in (email/password + Google OAuth), and manage their account via Supabase Auth — Validated in Phase 1: Foundation & Auth
- [x] First-time users complete a multi-step company onboarding wizard (business info, industry, branding, address, defaults) — Validated in Phase 2: Company Onboarding (human UAT pending)

### Active


- [ ] Users can manage clients (CRUD) with name, contact info, address, logo, and notes
- [ ] Users can create projects with a 3-step wizard (client selection/creation, project details, confirmation)
- [ ] Projects have a workspace with tabs: Overview, Audio Recording, Photos, AI Estimate, Preview & Send
- [ ] Audio recording captures walkthroughs via browser MediaRecorder API with waveform visualization and real-time transcript preview
- [ ] Audio files are transcribed via OpenAI Whisper API and transcripts are editable
- [ ] Photos can be uploaded (multi-file + camera capture on mobile), reordered, captioned, and analyzed by Claude Vision
- [ ] AI generates structured, itemized estimates from transcripts + photo analyses using Claude API
- [ ] Estimates are displayed in an editable inline editor with real-time math recalculation
- [ ] Estimates can be downloaded as branded PDFs with company logo, colors, and full line-item detail
- [ ] Estimates can be sent via email (Resend) with a customizable message and PDF attachment option
- [ ] A public share link (`/estimate/[token]`) displays the estimate without authentication
- [ ] Clients can accept or decline estimates from the public share link
- [ ] Dashboard shows project stats, project list with filters/search/sort, and quick actions
- [ ] All data is protected by Supabase RLS — users only see their own company's data
- [ ] Activity log tracks all project events (created, sent, viewed, accepted, declined)
- [ ] Settings page allows editing company info, branding, defaults, and notification preferences
- [ ] App is fully mobile-responsive; audio recording and camera capture work on mobile browsers

### Out of Scope (v1)

- Multi-language support — English only for v1
- Dark mode toggle — deferred to v2
- Client portal (clients log in to see all estimates) — deferred to v2
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Estimate templates — deferred to v2
- Multi-user/team accounts — deferred to v2

## Context

- **Target market**: United States only. USD currency, US address/phone formats, US market pricing for AI estimates.
- **Primary use case**: Field-first — business owner uses this on a job site on their phone.
- **AI pipeline**: Claude API (estimate generation + photo analysis) + OpenAI Whisper (audio transcription).
- **Storage**: Supabase Storage for logos, audio files, photos, and generated PDFs.
- **Email delivery**: Resend API for sending estimates to clients.
- **Deployment target**: Vercel.
- **Existing Supabase project**: `prmqgcrnpuvpzruyzvuv.supabase.co` (clean, empty database ready).
- **Existing .env.local**: Supabase URL + anon key + service role key already configured.

## Constraints

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, Zustand or React Context, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables; schema defined in spec (8 tables)
- **AI**: Anthropic Claude claude-sonnet-4-20250514 for estimate generation and photo analysis
- **Audio transcription**: OpenAI Whisper API (server-side)
- **PDF**: @react-pdf/renderer or puppeteer (server-side generation)
- **Mobile**: Audio recording and camera capture must work on iOS Safari and Android Chrome
- **Security**: Service role key never exposed to browser; all AI calls server-side via API routes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router (not Pages) | Modern routing, server components, API routes co-located | Confirmed |
| Supabase for auth + DB + storage | Single vendor reduces integration complexity | Confirmed |
| Claude for both estimate generation and photo analysis | Avoid mixing AI vendors; Claude Vision is capable | Confirmed |
| Whisper for audio transcription | Best-in-class accuracy for field audio | Confirmed |
| @react-pdf/renderer for PDF | Client-renderable, no headless browser needed in serverless | TBD — evaluate vs puppeteer |
| Resend for email | Simple API, great deliverability, reasonable free tier | Confirmed |
| YOLO execution mode | Spec is comprehensive; minimal approval gates needed | Confirmed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after Phase 2 completion*
