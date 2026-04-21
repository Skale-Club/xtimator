# EstimateBuilder Pro

## What This Is

EstimateBuilder Pro is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate ready to send as a branded PDF or shareable link.

The platform includes a super-admin layer for centralized API credential management and runtime branding configuration, enabling the platform owner to manage integrations (Resend, Anthropic, OpenAI) and global identity (app name, logo, primary color) from a UI without code changes or redeployment.

## Core Value

A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Current State

**Version:** v1.0 MVP — shipped 2026-04-21
**Phases complete:** 8/8 | **Plans:** 32/32 | **Build:** passing
**Tech stack:** Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui (New York), Supabase (Auth + DB + Storage), React PDF, Resend, Anthropic Claude, OpenAI Whisper
**Test coverage:** 154+ unit tests passing, E2E with Playwright (env-gated for live flows)
**Deployment target:** Vercel

## Requirements

### Validated (v1.0)

- v AUTH-01–07: Email/password sign-up, sign-in, Google OAuth, session persistence, password reset, post-signup redirect, sign-out — v1.0
- v ONBOARD-01–08: Multi-step onboarding wizard (business info, industry, color, logo, address, defaults, skip option) — v1.0
- v DASH-01–08: Dashboard with stats, project list, search/filter/sort, quick actions, delete confirm — v1.0
- v CLIENT-01–06: Client CRUD with logo upload, contact info, project association — v1.0
- v PROJ-01–08: 3-step project wizard (client selection/inline creation, details, auto-name, confirmation, workspace redirect) — v1.0
- v WS-01–03: 5-tab project workspace (Overview, Audio, Photos, Estimate, Send), activity timeline, status updates — v1.0
- v AUDIO-01–10: MediaRecorder with waveform, timer, live transcript preview, Whisper transcription, editable transcript, delete/re-record, multi-recording concatenation, mobile support — v1.0
- v PHOTO-01–11: Multi-file upload, camera capture, drag-and-drop, compression, sortable grid, lightbox, captions, 20-photo limit — v1.0
- v AI-01–10: Claude Vision photo analysis, Claude estimate generation with tool_use, structured JSON persistence, math validation, progress indicator, version management, retry/manual fallback — v1.0
- v EDIT-01–12: Inline estimate editor with real-time recalculation, drag reorder, discount/tax, auto-save, version selector — v1.0
- v PDF-01–03: Branded PDF via @react-pdf/renderer with logo, colors, line items, totals, terms, page numbers — v1.0
- v SHARE-01–07: Public share link, branded share page, accept/decline, view logging, activity timeline, email notifications — v1.0
- v EMAIL-01–06: Resend email delivery, compose form, PDF attachment option, mark-as-sent, status update — v1.0
- v SET-01–06: Company info/logo/branding/defaults/notifications/account settings — v1.0
- v ADMIN-01–14: Platform admin panel (super-admin gate, integrations CRUD with encrypted keys, branding config, admins management, auth dark pass, full env-var and identity decoupling) — v1.0

### Active (v1.1 candidates)

- [ ] Human UAT: Full browser-based walkthrough of audio recording, photo upload, AI generation, PDF download, share link, and email send flows
- [ ] Production Supabase migration applied and first super-admin bootstrapped
- [ ] APP_ENCRYPTION_KEY set in Vercel environment variables
- [ ] E2E test suite enabled for live Supabase flows (env-gated tests currently skip)
- [ ] Vercel deployment pipeline configured and first production deploy successful

### Out of Scope (v1)

- Multi-language support — English only
- Dark mode toggle for tenants — auth dark pass only (admin-driven theme)
- Client portal (clients log in) — public share link covers v1 use case
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Estimate templates — deferred to v2
- Multi-user/team accounts — deferred to v2
- Per-tenant API keys — platform shared credentials via admin panel covers v1

## Context

- **Target market:** United States only. USD, US formats, US market pricing.
- **Primary use case:** Field-first — business owner on a job site on their phone.
- **AI pipeline:** Claude API (estimate generation + photo analysis) + OpenAI Whisper (audio transcription).
- **Storage:** Supabase Storage (logos, audio, photos, PDFs, platform brand assets).
- **Email:** Resend API — centralized via platform admin, no per-tenant key needed.
- **Platform admin:** AES-256-GCM encrypted API credentials in  table; branding in  singleton (id=1); super-admin gate via  table + proxy middleware.
- **Deployment:** Vercel. ENV vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_ENCRYPTION_KEY, DATABASE_URL.
- **Codebase:** ~32 plans shipped, 151+ commits, TypeScript strict throughout.

## Constraints

- **Tech Stack:** Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod
- **Database:** Supabase PostgreSQL with RLS on all tables
- **AI:** Anthropic Claude claude-sonnet-4-20250514 for estimate generation and photo analysis
- **Audio transcription:** OpenAI Whisper API (server-side)
- **PDF:** @react-pdf/renderer (server-side generation)
- **Mobile:** Audio recording and camera capture work on iOS Safari and Android Chrome
- **Security:** Service role key never exposed to browser; all AI calls server-side via API routes; API credentials encrypted at rest (AES-256-GCM)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js App Router (not Pages) | Modern routing, server components, API routes co-located | Confirmed — no issues |
| Supabase for auth + DB + storage | Single vendor reduces integration complexity | Confirmed — worked well |
| Claude for estimate generation and photo analysis | Avoid mixing AI vendors; Claude Vision capable | Confirmed — tool_use pattern solid |
| Whisper for audio transcription | Best-in-class accuracy for field audio | Confirmed |
| @react-pdf/renderer for PDF | No headless browser in serverless | Confirmed — works on Vercel |
| Resend for email | Simple API, great deliverability | Confirmed |
| AES-256-GCM for API key encryption | Standard, auditable, no Vault dependency | Confirmed — 12-byte IV per call |
| Singleton platform_branding (id=1) | Null-safe loader fallback from t=0 | Confirmed — avoids null checks everywhere |
| Last-admin BEFORE DELETE trigger | Descriptive error message vs opaque constraint | Confirmed |
| server-only marker + vitest alias | Enforces server/client boundary at both build and test | Confirmed — caught real violations |
| Deny-all RLS by omission on platform tables | Platform secrets accessible only via service role | Confirmed — cleanest posture |
| YOLO execution mode | Spec was comprehensive; minimal approval gates needed | Confirmed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via /gsd:complete-milestone):
1. Full review of all sections
2. Core Value check
3. Audit Out of Scope
4. Update Context

---
*Last updated: 2026-04-21 after v1.0 milestone*
