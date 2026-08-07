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
- ✅ **v1.9 Custom Domain Support** — Phases 38-39 (shipped 2026-05-10)
- ✅ **v2.0 WhatsApp Estimate Channel** — Phases 40-45 (shipped 2026-05-10)
- ✅ **v2.1 WhatsApp Launch-Readiness** — Phases 46-52 (shipped 2026-05-11)
- ✅ **v2.2 WhatsApp Channel Polish** — Phases 53-54 (shipped 2026-05-13)
- ✅ **v3.0 Monetization** — Phases 55-60 (shipped 2026-05-14) · [archive](milestones/v3.0-ROADMAP.md)
- ✅ **v3.1 Production Go-Live (rescoped)** — Phase 61 only (shipped 2026-05-15) · 4 phases deferred to v3.2 · [archive](milestones/v3.1-ROADMAP.md)
- 🚧 **v3.1.1 MVP Launch Prep + Future-Proofing** — Phases 66-72 (started 2026-05-15, rescoped same day for Inngest + Storage abstraction)
- ✅ **v4.0 Multi-Tenancy** — Phases 79-85 (shipped 2026-05-26) · [archive](milestones/v4.0-ROADMAP.md)
- ✅ **v4.1 MCP Server** — Phases 86-90 (shipped 2026-05-26) · [archive](milestones/v4.1-ROADMAP.md)
- ✅ **v4.2 Recording Reliability & Observability** — Phases 91-93 (shipped 2026-05-30)
- 🚧 **v4.3 Unified Agentic Estimate Engine** — Phases 94-97 (started 2026-06-20)
- 🗄️ **v4.4 WhatsApp Notifications** — Phase 98 (planned 2026-06-20) — **SUPERSEDED by Phase 104** (owner-facing WhatsApp notifications + in-app template builder built in 104). Do not run; revive only if a distinct customer-facing scope is ever needed.
- ✅ **v4.5 Estimate Engine Robustness & Reliability Harness** — Phases 99-103 (shipped 2026-06-21) · [archive](milestones/v4.5-ROADMAP.md)
- ✅ **v4.5.1 Notification Channels & Preferences** — Phase 104 (shipped 2026-06-22) — _(previously labeled v4.6; relabeled to free the v4.6 name for Pricing Intelligence)_
- ✅ **v4.6 Pricing Intelligence — Researched Pricing Agent** — Phases 105-109 (shipped 2026-06-24)
- ✅ **v4.7 Monetização — Credit-Based Billing + Estimate Payment Fee** — Phases 110-116 (shipped 2026-06-24)
- ✅ **v4.8 Industry Knowledge Base — Channel-Neutral Conversational Assistant** — Phases 117-121 (shipped 2026-06-24)
- ✅ **v4.9 Internal Web Chat Assistant — the 3rd channel** — Phases 122-126 (shipped 2026-06-25)
- ✅ **v4.10 MCP Channel Parity** — Phases 127-128 (shipped 2026-06-25) — binds the v4.9 neutral `lib/agent-tools/` over the existing v4.1 MCP server, closing the WhatsApp = chat = MCP sibling-channels principle
- ✅ **v4.11 Advanced Pricing Model — Per-Item Tax, Discounts, Deposit & Markup** — Phases 129-134 (shipped 2026-06-25) — enriched the pricing MODEL so the existing GUARD-03 server-side deterministic engine computes per-item tax, discounts, deposit & markup; NO AI calculator; byte-identical retrocompat; SEED-032
- 🚧 **v4.12 Team Seats & Member Invites** — Phases 135-140 (roadmap created 2026-06-25) — turn the dormant `company_members` foundation (Phase 79) into team seats: invite teammates into the SAME company, owner/admin/member roles (server-side `requireCompanyRole` + RLS, never client-trusted), and per-seat billing fully configurable in `billing_config`/super-admin (nothing hardcoded), gated by `enforcementEnabled`; retrocompat single-owner orgs = zero charge; reuse existing RLS, do NOT rebuild multi-tenancy; SEED-037
- 🚧 **v4.13 Annual Billing** — Phases 141-145 (roadmap created 2026-06-25) — add a discounted ANNUAL subscription option while keeping AI credit distribution MONTHLY for every interval. The load-bearing change: decouple the credit grant from the invoice cadence via an Inngest monthly cron + a `grant:{companyId}:{YYYY-MM}` company-month idempotency key shared with the `invoice.paid` webhook (exactly one grant per company per calendar month, any interval). Annual price + seat price live in `billing_config`/super-admin (nothing hardcoded; discount % derived); base charge via pre-created annual Stripe Price IDs (env placeholders); seat annual via inline `price_data`; checkout `billingInterval` default `'month'` keeps the monthly path byte-identical; gated by `enforcementEnabled`; SEED-038
- 🚧 **v4.14 Admin Sales Mode** — Phases 146-149 (roadmap created 2026-06-28) — enable the super-admin (skale.club@gmail.com role, never hardcoded) to create demo company accounts on the fly during in-person sales demos: role system in Supabase (`is_super_admin` flag in `profiles`), "Add new company" button visible only to super-admins, quick company-creation modal (no separate page), 3-estimate quota per newly created company, and account handoff via the existing v4.12 invite flow so the client can take ownership after the demo.
- ✅ **v4.15 Credit UX Polish & Admin Support Tooling** — Phases 150-153 (shipped 2026-07-05) · [archive](milestones/v4.15-ROADMAP.md) — replaced the raw numeric credit counter with a Claude-Console-style usage progress bar (tenants see only a % consumed, never $/credit math), moved exact $ cost visibility to a super-admin-only surface extending `measured-cost-card.tsx`, reworked the top-up purchase flow to configurable dollar packs ($20/$50/$100) with optional auto-top-up (off-session Stripe charging, atomic concurrency lock), and gave the super admin an audited, signed-session-claim "Support Mode" to view any tenant plus a paginated/searchable/filterable Companies admin screen; no new credit ledger, no real identity switch, Support Mode ≠ HandoffButton; SEED-039 + SEED-040
- ✅ **v4.16 Admin Inbox Consolidation** — Phases 154-155 (shipped 2026-07-06) · [archive](milestones/v4.16-ROADMAP.md) — consolidated the three scattered super-admin WhatsApp surfaces into one coherent **Inbox**: a single nav item (`/admin/inbox`, old routes redirect), a two-pane master-detail conversation viewer (list + thread on the same page, Xphere-style, replacing the `Sheet` drawer), and an Inbox Settings area folding in Accounts + Templates. Read-only; credentials stay in Integrations; the data layer + DB tables kept their `whatsapp_*` names (user-facing rename only)
- ✅ **v4.17 Admin Polish & Credit UX Compliance** — Phases 156-159 (shipped 2026-07-06) · [archive](milestones/v4.17-ROADMAP.md) — fixed a real regression against a locked v4.15 decision (tenant-facing surfaces leaking raw credit numbers), then polished the super-admin experience: nav reorg (Dashboard/Companies/Inbox first + new grouped "Content" section) + Legal Pages→Pages rename, two owner-flagged confusing labels fixed (Message→Message Template, Support Mode→View as Company), a credit-model-centric admin Billing page overhaul, and a "Premium Xtimator" glassmorphism visual redesign of the v4.16 Inbox
- ✅ **v4.18 Estimate Document & Send Experience Refresh** — Phases 160-163 (shipped 2026-07-09) · [archive](milestones/v4.18-ROADMAP.md) · [audit](milestones/v4.18-MILESTONE-AUDIT.md) — 24/24 requirements shipped (PUBURL-01..06 + PRESENT-01..05 + DOCUX-01..07 + SENDHUB-01..06). Per-estimate presentation-settings resolver + gear panel + format-first Send hub + friendly URLs + cross-surface visibility parity across 6 renderers + Bill To pencil affordance + ClientPicker consolidation + mobile line-item doc-native rebuild + 5-file deletion sweep of retired send surfaces. GUARD-03 preserved structurally at every seam.
- ✅ **v4.19 Integrity & Reliability Hardening** — Phases 164-170 (shipped 2026-07-17) — 32/32 requirements shipped (TRUST-01..03, SAVE-01..07, AIREL-01..05, BILL-01..06, PHOTO-01..04, CAPT-01..05, REFINE-01..02), closing the 10 severity-ranked findings from the six-track adversarial deep audit of the estimate system ([audit](audits/v4.19-ESTIMATE-DEEP-AUDIT.md)): snapshot-on-sign + freeze-on-send trust boundary, transactional atomic save RPC, AI fetch timeouts + truncation visibility + missing tool-schema pricing fields, credit gate on refine + server-derived audio duration + vision cost threading, full photo coverage + captions in the prompt, upload retry + IndexedDB capture persistence, and refine review-before-apply (shared identity-preserving merge/diff util + flush-before-refine + review-before-apply). Pure hardening — no new AI features; GUARD-03 and Inngest durability regression contracts held throughout.
- ✅ **v4.20 Structured Photo Extraction** — Phase 171 (SHIPPED 2026-07-17) — vision tool-call extraction (surfaces, measurements w/ units+confidence, materials, damage) persisted in photos.ai_extraction JSONB + compact serialization into the generation prompt; two-layer zod gate, prose fallback ladder, env kill-switch, provider parity, costContext attribution; v4.19 audit § E5 / FUT-02
- 🚧 **v4.21 Notification Center** — Phases 172-178 (roadmap created 2026-07-21) — unify all outbound messaging into one admin-manageable Notification Center serving three audiences: platform admins (Telegram per-event toggles), tenants (in-app/email/WhatsApp/SMS via the existing `notify()` pipeline), and end customers (email/SMS only — WhatsApp reserved for owner↔Xtimator). Hardcoded `copy.ts` becomes DB-driven super-admin-editable `{{var}}` templates with a per-event variable catalog, live preview, unknown-var rejection, test-send, and a DB→built-in→never-block fallback resolver with per-channel escaping (Pitfalls 1/2/4/5). Re-enables proactive tenant WhatsApp via the EXISTING HSM registry (Pitfall 3 runtime guard). New end-customer send path (friendly-from email + dedicated Twilio Messaging Service SMS + `customer_messages` audit) gated behind a hard consent/STOP/quiet-hours prerequisite (CUST-03, Pitfall 10/HIGH-legal). Agentic send (WhatsApp assistant + MCP) is confirmation-gated with injection-resistant recipient resolution + per-company rate limits (Pitfalls 8/9). Three structurally-separate pipelines that never share a table: tenant-scoped `notify()`, platform-scoped `notifyOps()`, and the new synchronous agentic-send capability. 21/21 requirements mapped (PLAT-01..03, TMPL-01..07, TNT-01..03, CUST-01..05, AGENT-01..03), 0 orphans, 0 duplicates. Numbering continues the global counter — v4.20 ended at Phase 171, so v4.21 starts at **Phase 172**.

- 🚧 **v4.22 Product-Native Demo** — Phases 180-181 (roadmap created 2026-07-26) — replace the divergent standalone public demo with a host-isolated, defense-in-depth read-only session inside the real authenticated product. Phase 180 establishes the dedicated demo session and deny-write boundaries while the legacy demo stays live; Phase 181 verifies real-product parity, cuts public entry points over, removes duplicate demo UI, and documents the GitHub Actions → Docker/GHCR → Coolify production topology. 14/14 requirements mapped, 0 orphans, 0 duplicates.
- 🚧 **v4.23 Unified Estimate Document Engine** — Phases 182-186 (roadmap created 2026-07-27) — unify the estimate webview and PDF onto one shared document structure/design (webview is the benchmark, PDF copies it, both templates classic + modern); ONE consolidated deterministic page-break rule module shared by the PDF renderer and a new fully-editable paginated editor mode (two icon toggle buttons left of "Edit with AI"); net-new signature block + photo captions on all four surfaces; fixes the hardcoded-Classic/stale-snapshot email+WhatsApp PDF send-path bug (TRUST-01); public share webview stays single-page scroll. 18/18 requirements mapped (ENGINE-01..03, PDFPAR-01..04, PGBRK-01..05, PGMODE-01..05, POLISH-01), 0 orphans, 0 duplicates. Numbering continues the global counter — v4.22 ended at Phase 181, so v4.23 starts at **Phase 182**.

- 🚧 **v4.24 Same-Origin Storage on R2** — Phases 187-192 (roadmap created 2026-08-06) — serve every user-uploaded and platform asset from the app's own origin, backed by Cloudflare R2, so images land on the Cloudflare CDN that already fronts `xtimator.com` and Supabase Storage egress goes to zero. A same-origin proxy route with a mandatory **Supabase read-through fallback** (nothing may 404 in either direction) is the keystone that makes every later step reversible; server-side provider selection is unified so `STORAGE_PROVIDER` can never half-apply (today it would make the WhatsApp adapter write to R2 while readers read Supabase — silent 404s on inbound media); the five browser upload call sites move to server-issued presigned PUTs so no storage credential reaches the browser; persisted absolute `*.supabase.co` URLs become same-origin relative URLs with a reversible rewrite; and 51 objects / 14.3 MB are copied to R2 with per-object count/size/content-type verification. Five R2 buckets named 1:1 with the existing `StorageProvider` bucket argument — `lib/storage/s3-provider.ts` is already verified working against R2 **unmodified**, so no phase re-validates the provider. 20/20 requirements mapped (PROXY-01..05, PROV-01..03, UPLOAD-01..04, URL-01..04, MIG-01..04), 0 orphans, 0 duplicates. Numbering continues the global counter — v4.23 ended at Phase 186, so v4.24 starts at **Phase 187**.

> **Phase numbering note:** v3.1.1 starts at **Phase 66**, not 62. Phases 62-65 are reserved as DEFERRED placeholders for the v3.2 Production Deploy milestone (Vercel→Hetzner deploy + Stripe live + monitoring + UAT in prod). Skipping past 62-65 keeps the global phase counter unambiguous and prevents number reuse confusion when v3.2 begins.

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

### v2.0 WhatsApp Estimate Channel (Phases 40-45)

- [x] **Phase 40: Webhook Infrastructure** — DB tables (`company_whatsapp`, `whatsapp_sessions`, deduplication), `WhatsAppProvider` interface + `MetaAdapter` skeleton, `POST /api/webhooks/whatsapp` with HMAC-SHA256, `GET` hub.challenge verification, proxy.ts bypass, admin panel Meta token card (completed 2026-05-10)
- [ ] **Phase 41: Generate-Estimate Service Extraction** — Extract business logic from `app/api/generate-estimate/route.ts` into `lib/services/generate-estimate.ts` callable with `(companyId, projectId)` — no auth context required; API route becomes a thin wrapper; enables webhook handler to invoke the pipeline directly
- [ ] **Phase 42: Inbound Processing** — `lib/whatsapp/handler.ts` state machine (awaiting_input state); audio messages → Whisper → estimate; text messages → transcript → estimate; photo messages → Claude Vision → estimate; sends confirmation summary to owner; session created and transitioned to awaiting_confirm
- [ ] **Phase 43: Confirmation Flow** — `awaiting_confirm` state machine — "send" / "cancel" command parsing; session expiry at 30 minutes with expiry notification; `pg_cron` or Vercel cron cleanup; `lib/whatsapp/formatter.ts` confirmation message builder
- [ ] **Phase 44: Outbound Client Delivery** — Deliver estimate to client as share link (default) or formatted text per `company_whatsapp.delivery_format`; update estimate + project status to "sent"; confirm delivery to owner via WhatsApp
- [ ] **Phase 45: Settings UI + Admin Token** — `/settings/integrations` page with WhatsApp Connect Card (connect / verify OTP / disconnect / delivery format selector); Settings entry card; admin panel Meta access token card; `POST /api/settings/whatsapp` connect/verify/delete routes

### v2.1 WhatsApp Launch-Readiness (Phases 46-52) — ✅ SHIPPED 2026-05-11

- [x] **Phase 46: Typed Error Handling Foundation** — `lib/errors/` with `XtimatorError` class, type+surface composite codes, `asResponse()` wrapper, WhatsApp adapter (`handleWhatsAppError`), `throwIf*` helpers; foundation for all other v2.1 phases (SEED-014 harvested)
- [x] **Phase 47: Redis + Rate Limiting Infrastructure** — Upstash Redis client in `lib/redis.ts`; `lib/ratelimit.ts` with `rateLimit(limitName, identifier)`; applied to generate-estimate, webhooks/whatsapp, analyze-photos, translate (SEED-012 harvested)
- [x] **Phase 48: WhatsApp Multi-Message Debounce** — Redis-backed buffer per phone_number; PUSH on inbound, 5s silence wait, GET+process all together; new `processInboundMessages()` accepts array; generate ONE estimate from aggregated input (SEED-010 harvested)
- [x] **Phase 49: WhatsApp Typing + Read Receipts** — `markMessageAsRead()` + `sendTypingIndicator()` in `lib/whatsapp/client.ts`; called after dedup pass and before heavy processing; re-send typing before 25s timeout (SEED-011 harvested)
- [x] **Phase 50: WhatsApp OTP Number Verification** — Two-step setup flow: submit credentials → status=pending → 6-digit code via WhatsApp → verify → status=active; schema columns (verification_code, attempts, expires); UI second step in `WhatsAppConnectCard` (SEED-015 Gap 2 harvested)
- [x] **Phase 51: WhatsApp Pre-Send Edit Commands** — Structured parser for `edit total/timeline/payment/summary`, `client`, `regenerate` commands; mutations on estimate; re-send updated summary; session stays in awaiting_confirm. Section/item-level edits deferred (SEED-015 Gap 1 partial)
- [x] **Phase 52: Per-Estimate Language Selection** — `language` column on estimates (default 'en'), `preferred_language` on clients, `default_estimate_language` on companies; cascade resolver; AI prompt parameterized; WhatsApp formatter localized; auto-learn client preference after send (SEED-016 backend harvested)

### v2.2 WhatsApp Channel Polish (Phases 53-54)

- [x] **Phase 53: PDF Attachment Delivery** — Add `pdf_attachment` as a third `delivery_format` option; generate PDF via existing `/api/estimates/[id]/pdf` endpoint; upload to `estimates-pdf` Supabase Storage with 24h signed URL; send to client via Meta API `type: "document"`; degrade to `share_link` on any failure (SEED-015 Gap 3) (completed 2026-05-11)
- [x] **Phase 54: WhatsApp Status Flow** — Wire full `pending → verified → active → suspended` pipeline post-OTP; clear UI labels in `WhatsAppConnectCard`; admin/owner suspend and reactivate action; `handler.ts` gate enforces `status = 'active'` (SEED-015 Gap 5) (completed 2026-05-13)

<details>
<summary>✅ v3.0 Monetization (Phases 55-60) — SHIPPED 2026-05-14</summary>

| Phase | Name | Plans | Completed |
|-------|------|-------|-----------|
| 55 | Schema + Tier Definitions | 2/2 | 2026-05-13 |
| 56 | Usage Tracking | 1/1 | 2026-05-14 |
| 57 | Enforcement Layer | 2/2 | 2026-05-14 |
| 58 | Stripe Integration | 2/2 | 2026-05-14 |
| 59 | Billing UI | 2/2 | 2026-05-14 |
| 60 | Trial Automation + Admin Tooling | 2/2 | 2026-05-14 |

</details>

<details>
<summary>✅ v3.1 Production Go-Live (rescoped) — Phase 61 only · SHIPPED 2026-05-15</summary>

| Phase | Name | Plans | Status |
|-------|------|-------|--------|
| 61 | Production Database Foundation | 5/5 | Complete 2026-05-15 |
| 62 | ~~Vercel Deployment + Custom Domain~~ | — | REMOVED — hosting migration tracked in SEED-018 |
| 63 | Stripe Live Mode Activation | — | DEFERRED → v3.2 |
| 64 | Monitoring + Backup & Resilience | — | DEFERRED → v3.2 |
| 65 | Production UAT + Bug Triage | — | DEFERRED → v3.2 |

[Full archive: milestones/v3.1-ROADMAP.md](milestones/v3.1-ROADMAP.md)

</details>

### v3.1.1 MVP Launch Prep + Future-Proofing (Phases 66-69)

- [x] **Phase 66: Storage Abstraction Layer** — Ship `lib/storage/` with a `StorageProvider` interface, a Supabase implementation (default), and an S3-compatible skeleton (`@aws-sdk/client-s3`) gated behind `STORAGE_PROVIDER=s3`. Migrate every `supabase.storage.from(...)` call site (audio, photos, PDFs, logos, WhatsApp inbound media, branding assets) to the new `storage.*` API. Validate the S3 path with a local MinIO smoke test. Ship `docs/STORAGE-MIGRATION.md` so the future Hetzner Object Storage swap is a 1-line provider change. (STORAGE-01..07) (completed 2026-05-15)
- [x] **Phase 67: Inngest Background AI Job Processing** — Install Inngest, register worker functions at `/api/inngest`, and refactor the three AI routes (`generate-estimate`, `transcribe`, `analyze-photos`) plus the WhatsApp inbound handler so the long-running Anthropic / OpenAI / Vision calls run as Inngest jobs (idempotent via `step.run()` + `idempotencyKey`). Frontend polls job status via `GET /api/jobs/[jobId]` so the capture stepper UI shows live "Saving / Transcribing / Analyzing / Generating" progress. Document the local dev workflow (`npx inngest-cli dev` alongside `npm run dev`). (INNGEST-01..08) (completed 2026-05-15)
- [x] **Phase 68: Hetzner Cloud Deploy-Readiness Artifacts** — Ship the future-Hetzner deploy artifacts but do not activate them: `Dockerfile` (multi-stage, Node 22 alpine, non-root, <500 MB), `next.config.mjs` set to `output: 'standalone'`, `docker-compose.yml` with Caddy reverse proxy + automatic Let's Encrypt HTTPS, `app/api/health/route.ts` returning `{ ok, db, storage, commit }` (uses the new `storage.*` API for the storage check), and `docs/HETZNER-DEPLOY.md` runbook. Validate locally with `docker build` + `docker run`. (HETZNER-01..06) (completed 2026-05-15)
- [x] **Phase 69: UAT Validation + Bug Triage + Perf Audit** — Owner manually exercises every refactored surface against localhost: v2.2 WhatsApp polish (PDF + status flow), v3.0 monetization (tiers, Stripe test mode, billing UI, trial automation, admin tooling, 402 modal), Inngest happy path + 8-min long-audio (the timeout-killer test that would have failed on Vercel Free without Inngest), every storage path post-refactor, end-to-end happy path, multi-modal capture, i18n smoke. Critical bugs get fixed in this milestone with linked commits; non-critical findings land in `.planning/known-issues.md`. Lighthouse + bundle-size audit captured. (UAT-V22-01..02 + UAT-V30-01..06 + UAT-INNGEST-01..02 + UAT-STORAGE-01 + UAT-E2E-01..03 + FIX-01..02 + PERF-01..02) (completed 2026-05-15)
- [x] **Phase 70: Stripe Connect — Optional Customer Payments on Estimates** — Ship an entirely-optional Stripe Connect Standard integration so service businesses can connect their existing Stripe account once (via OAuth in Settings → Payments) and instantly get a "Pay Now" button on every shared estimate. Customer clicks → Stripe Checkout (hosted by Stripe, on the business's connected account) → pays full amount → webhook marks `estimates.payment_status = 'paid'`, emails business owner, emails customer branded receipt, shows banner on share page after redirect. Zero application fee (Xtimator already monetizes via SaaS plans). Everything works perfectly without Stripe connected — no broken UI, no upsell nag, share/PDF/email flows unchanged. Harvests SEED-020. (CONNECT-01..09)
 (completed 2026-05-17)

- [x] **Phase 71: Glassmorphism Structural Redesign — All Surfaces** — Ship a complete visual overhaul taking Xtimator from "functional SaaS" to "premium Stripe-Dashboard-tier" without changing information architecture, navigation, or copy. New design system layer (glass surface tokens + vibrant gradient palette + typography upgrade) extends — does not replace — existing semantic tokens. Every surface a paying customer sees gets refactored across 5 waves: (1) foundation + reference page, (2) marketing/auth/onboarding, (3) app shell + dashboard + collections, (4) project workspace + capture + editor, (5) share page + settings + admin + billing. Brand identity preserved (#406EF1, dark-first, logo, wordmark intact). Reference: Stripe Dashboard. Harvests SEED-022. (REDESIGN-01..10) (completed 2026-05-17)
- [x] **Phase 72: Admin Menu Performance — Instant Navigation** — Eliminate perceived lag on admin menu opens (both client admin `/admin/*` and app shell nav) by fixing layout-blocking Promise.all() with Suspense boundaries, adding skeleton loading states, fixing N+1 decrypt pattern in integrations page, adding ISR caching to force-dynamic admin pages where safe, and lazy-loading heavy page components. Target: menus open and render skeleton within 100ms of click; no layout shift or blank flash. (PERF-ADMIN-01..06)
 (completed 2026-05-18)

### Phase 74: Post-Onboarding App Feature Tour

**Goal**: New users are guided through the app immediately after completing onboarding — a welcome modal fires automatically, an optional 5-step spotlight walkthrough highlights the 5 core nav elements, and 5 contextual first-visit tooltips appear once each on key surfaces. Tour state is localStorage-only (no DB). All text strings go through t() for PT/ES. Mobile-first (box-shadow spotlight works on iOS Safari and Android Chrome).
**Depends on**: Phase 73 (i18n t() hook available and stable)
**Requirements**: TOUR-01, TOUR-02, TOUR-03, TOUR-04, TOUR-05
**Success Criteria** (what must be TRUE):

  1. After completing onboarding, the welcome modal appears automatically on the dashboard without any manual action from the user
  2. Clicking 'Show me around' launches a 5-step spotlight overlay that highlights: New Project button, Projects link, Clients link, Price Book link, Language toggle — all without requiring page navigation
  3. Clicking 'Start estimating' (or X) closes the modal; localStorage sets tour_completed=true; modal never auto-appears again
  4. Each of 5 contextual tooltips appears exactly once on first visit to its surface (Price Book, Clients, Estimate total, WhatsApp send tab, Language toggle) and never again after dismissal
  5. A '?' floating button (fixed bottom-right) reopens the welcome modal in review mode ('Show me around' + 'Close' — no 'Start estimating') at any time; button is hidden during spotlight

**Plans**: 4 plans in 
Plans:

- [x] 74-01-PLAN.md — Tour infrastructure (TourProvider, use-tour hook, welcome modal, onboarding cookie wiring)
- [x] 74-02-PLAN.md — Spotlight walkthrough (5-step overlay, TourSpotlight, data-tour attributes on 5 targets)
- [x] 74-03-PLAN.md — Contextual first-visit tooltips (ContextualTooltip component, 5 tooltip placements)
- [x] 74-04-PLAN.md — '?' floating button + WelcomeModal review mode + final wiring + TypeScript clean pass

### Phase 71: Glassmorphism Structural Redesign — All Surfaces

**Goal**: Every surface a paying Xtimator customer touches feels premium and modern — frosted-glass cards, vibrant brand-tinted gradients on hero zones, stronger typography hierarchy, generous whitespace — without changing information architecture, navigation, or copy. Information stays where it is; presentation gets a Stripe-Dashboard-tier overhaul.
**Depends on**: Phase 70 (Stripe Connect UI surfaces are now landed and can be styled into the new design system in the same pass)
**Requirements**: REDESIGN-01, REDESIGN-02, REDESIGN-03, REDESIGN-04, REDESIGN-05, REDESIGN-06, REDESIGN-07, REDESIGN-08, REDESIGN-09, REDESIGN-10
**Success Criteria** (what must be TRUE):

  1. New glass surface tokens (`--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-blur`) and vibrant gradient palette (`--gradient-brand`, `--gradient-hero`, `--gradient-success`, `--gradient-warning`, `--gradient-danger`) ship in `app/globals.css` and are documented in a `/admin/design-system` reference page that renders every primitive and pattern variant
  2. Every shadcn primitive in `components/ui/*` gains optional glass/gradient variants without breaking existing call sites — `<Card variant="glass">`, `<Button variant="primary">` with gradient bg + shimmer hover, `<Dialog>` with backdrop-blur, `<Input>` with gradient focus border, `<Badge>` with gradient status variants, `<Tabs>` with gradient indicator
  3. Marketing + auth surfaces (`/`, `/blog/[slug]`, `/login`, `/signup`, `/reset-password`, `/onboarding/*` 5-step wizard) all use the new glass + gradient system; hero zones gain `--gradient-hero` radial backdrop; auth pages get glass card on gradient backdrop
  4. App shell (sidebar, top bar, bottom-nav, settings dropdown, language toggle, theme toggle) renders with glass surfaces and gradient highlight on active nav items; dashboard + collections (`/dashboard`, `/clients`, `/projects`) use glass stat cards with gradient top borders and glass list rows
  5. Project surfaces (`/projects/[id]` workspace 5 tabs, `/projects/[id]/capture` + `/describe` + `/photos-input`, estimate editor inline) all redesigned; capture screen gains gradient progress ring + glass stepper card; estimate editor gets glass row cards
  6. Customer-facing share page (`/estimate/[token]`) and "Pay Now" surfaces from Phase 70 use the new glass + gradient styling — Pay Now button gets brand gradient + subtle shimmer; success banner gets glass + success gradient
  7. Settings surfaces (every `/settings/*` sub-page including new `/settings/payments` from Phase 70) and admin surfaces (every `/admin/*` sub-page) use the new system; billing page tier cards get prominent gradients per tier (Free/Pro/Business)
  8. Brand identity unchanged — `#406EF1` is still the primary, logo + wordmark are byte-identical, dark mode is still default, scoped themes (`[data-theme="dark-auth"]`, forced-light `/estimate/*`) still work
  9. Playwright visual snapshot baselines updated for every redesigned surface (expected — every existing snapshot WILL break and must be re-minted; no false-positive regressions allowed in the test suite after wave 5 lands)
  10. Performance: Lighthouse Performance + Accessibility scores stay ≥ 80 on `/` and `/dashboard` after redesign; First Load JS for `/dashboard` stays under 500 KB; `backdrop-filter: blur()` restricted to top surfaces only (hero, modals, sidebar — NOT every list row) so mid-range mobile GPUs stay smooth; `prefers-reduced-transparency` honored with solid-bg fallback

**Plans**: TBD (estimated 10 plans across 5 waves — see SEED-022 for wave breakdown)
**UI hint**: yes (this entire phase is UI — run `/gsd:ui-phase 71` to generate UI-SPEC.md BEFORE planning)

### Phase 72: Admin Menu Performance — Instant Navigation

**Goal**: Eliminate the perceived lag when opening admin menus in both the super-admin panel (`/admin/*`) and the client-facing app shell. Menus must open and render a skeleton within 100ms of click; no blank flash or layout shift. Root causes identified: (1) layout-level `Promise.all()` with no Suspense boundaries blocks the entire layout render including nav; (2) admin pages use `force-dynamic` with no caching, regenerating expensive queries on every navigation; (3) integrations page has an N+1 decrypt + `getUserById()` pattern; (4) admins page fetches 1000 users on load; (5) no loading skeletons — blank screen feels broken.
**Depends on**: Phase 71 (glassmorphism redesign landed; skeletons must match new glass design tokens)
**Requirements**: PERF-ADMIN-01, PERF-ADMIN-02, PERF-ADMIN-03, PERF-ADMIN-04, PERF-ADMIN-05, PERF-ADMIN-06
**Success Criteria** (what must be TRUE):

  1. `app/admin/layout.tsx` and `app/(app)/layout.tsx` wrap slow data-fetching sections in `<Suspense>` with skeleton fallbacks — nav and topbar render immediately while page content loads behind a skeleton
  2. Admin pages that had `force-dynamic` now use `revalidate` (ISR) or React cache with appropriate TTLs where data freshness allows; pages that must stay dynamic ship with `loading.tsx` skeleton files so Next.js streaming kicks in
  3. `app/admin/integrations/page.tsx` N+1 decrypt + `getUserById()` loop replaced with a single JOIN query + batch decrypt — page load time drops from O(n) round-trips to O(1)
  4. `app/admin/admins/page.tsx` drops the `listUsers({ perPage: 1000 })` call; replaced with a paginated fetch (first 50) + server-side search, or a cached count query — no unbounded user list load on every nav
  5. Every admin page (`/admin/*`) and every app-shell nav transition shows a skeleton within 100ms — measured by adding `loading.tsx` to every admin route segment that lacks one
  6. No regressions: all existing admin CRUD actions (invite admin, suspend/reactivate, branding update, billing view) continue to work correctly after the caching and query changes

**Plans**: 3 plans in `.planning/phases/72-admin-menu-performance/`
Plans:

- [x] 72-01-PLAN.md — 10 loading.tsx skeleton files for all admin routes + revalidate=60 ISR on 4 stable admin pages (PERF-ADMIN-01, PERF-ADMIN-02)
- [x] 72-02-PLAN.md — Admin layout Suspense boundary + app shell getBranding parallelized with getCachedCompany (PERF-ADMIN-03, PERF-ADMIN-06)
- [x] 72-03-PLAN.md — integrations N+1 getUserById batch fix + admins page listUsers(1000) replaced with bounded getUserById per row (PERF-ADMIN-04, PERF-ADMIN-05, PERF-ADMIN-06)

### Phase 66: Storage Abstraction Layer

**Goal**: Every storage call site in the app routes through a `lib/storage/` provider interface so swapping Supabase Storage for an S3-compatible backend (Hetzner Object Storage, MinIO, etc.) is a 1-line provider change. Default provider stays Supabase; the S3 path ships as a working skeleton validated against MinIO. Sequenced first because doing the refactor under live customer load (post-launch) is much riskier than now during a clean window — and Phase 67 (Inngest) workers can use the new `storage.*` API from day one with no follow-up refactor.
**Depends on**: Phase 61 (production database foundation; clean baseline before refactor)
**Requirements**: STORAGE-01, STORAGE-02, STORAGE-03, STORAGE-04, STORAGE-05, STORAGE-06, STORAGE-07
**Success Criteria** (what must be TRUE):

  1. `lib/storage/index.ts` exports a `StorageProvider` interface with `upload`, `download`, `getSignedUrl`, `delete`, and `list` methods; `lib/storage/supabase-provider.ts` implements it and is the default `storage` export
  2. Running `grep -r "supabase.storage.from" app/ lib/ components/` returns zero hits outside `lib/storage/` — every audio, photo, PDF, logo, branding asset, and WhatsApp media call site uses the new `storage.*` API
  3. All signed URLs include an explicit `expiresInSeconds` value, all keys follow the `{company_id}/{type}/{timestamp}-{filename}` convention, and no caller relies on Supabase-specific `transformOptions` or on-the-fly resize endpoints
  4. With `STORAGE_PROVIDER=s3` set against a local MinIO container, upload + signed URL + download + delete all complete successfully end-to-end (smoke proof the abstraction holds), then Supabase is restored as the default
  5. `docs/STORAGE-MIGRATION.md` ships with provisioning steps, the exact `aws s3 sync` command, the endpoint swap procedure, and the documented 800 MB Supabase storage usage trigger threshold

**Plans**: 3 plans in `.planning/phases/66-storage-abstraction-layer/`
Plans:

- [x] 66-01-PLAN.md — Wave 0 RED contract tests + StorageProvider interface + Supabase provider + buildStorageKey helper (STORAGE-01, STORAGE-02, STORAGE-04)
- [x] 66-02-PLAN.md — Migrate all 8 production call sites (logos → audio → photos → pdfs → wa-media) + 3 affected tests (STORAGE-03, STORAGE-04)
- [x] 66-03-PLAN.md — S3 provider skeleton + STORAGE_PROVIDER env gate + MinIO smoke script + docs/STORAGE-MIGRATION.md runbook (STORAGE-05, STORAGE-06, STORAGE-07)

### Phase 67: Inngest Background AI Job Processing

**Goal**: All long-running AI calls (estimate generation, audio transcription, photo analysis) run as Inngest background jobs so the API routes return in under 1 second — unblocking the Vercel Free 10-second function timeout while keeping the same UX (live "Saving / Transcribing / Analyzing / Generating" progress) via job-status polling. Inngest is forward-compatible with the future Hetzner host (no swap needed at migration time).
**Depends on**: Phase 66 (Inngest worker functions consume the new `storage.*` API from day one — no follow-up refactor required)
**Requirements**: INNGEST-01, INNGEST-02, INNGEST-03, INNGEST-04, INNGEST-05, INNGEST-06, INNGEST-07, INNGEST-08
**Success Criteria** (what must be TRUE):

  1. `POST /api/generate-estimate`, `POST /api/transcribe`, and `POST /api/analyze-photos` each return `{ jobId }` in under 1 second — the actual Anthropic / Whisper / Vision call runs inside an Inngest worker function and `usage_events` is recorded only on job success
  2. The capture screen displays a live "Saving / Transcribing / Analyzing / Generating" stepper driven by `GET /api/jobs/[jobId]` polling, and the user lands in the estimate editor when the final job completes — same UX as today, no perceivable regression
  3. Every external AI call inside an Inngest function is wrapped in `step.run()` with an explicit `idempotencyKey` so a retry never double-charges Anthropic / OpenAI
  4. The WhatsApp inbound handler dispatches Whisper / Vision work via Inngest instead of awaiting it inline — the webhook ack returns to Meta in well under 10 seconds even on long voice notes
  5. A developer running `npx inngest-cli dev` alongside `npm run dev` sees jobs land at `localhost:8288` with full execution traces; the local workflow is documented in repo (e.g. `docs/INNGEST-LOCAL-DEV.md` or README addendum)

**Plans**: 5 plans in `.planning/phases/67-inngest-background-ai-jobs/`
Plans:

- [x] 66-01-PLAN.md — Wave 0 RED test stubs + verify usage_events idempotency UNIQUE index
- [x] 66-02-PLAN.md — Inngest install + client + serve handler + 4 worker functions (generateEstimateJob, transcribeAudioJob, analyzePhotosJob, whatsAppProcessJob)
- [ ] 66-03-PLAN.md — Refactor 3 AI routes to dispatch + create new /api/transcribe + /api/jobs/[jobId] proxy
- [ ] 66-04-PLAN.md — Refactor lib/whatsapp/handler.ts:processInboundMessages to dispatch via Inngest
- [ ] 66-05-PLAN.md — useJobStatus hook + capture-recorder.tsx polling + docs/INNGEST-LOCAL-DEV.md

**UI hint**: yes

### Phase 68: Hetzner Cloud Deploy-Readiness Artifacts

**Goal**: The repository ships every artifact required to deploy to a Hetzner Cloud VPS (Dockerfile, docker-compose with Caddy, `/api/health`, runbook) so the future v3.2 deploy is mechanical — but nothing is activated in this milestone. Local Docker build is proven to boot the app correctly. Sequenced after Storage + Inngest so the `/api/health` storage check uses the new `storage.*` API and the Docker image bundles the Inngest worker route.
**Depends on**: Phase 66 (the `/api/health` storage check uses the new `storage.*` API), Phase 67 (Dockerfile must include the Inngest worker route in its standalone output)
**Requirements**: HETZNER-01, HETZNER-02, HETZNER-03, HETZNER-04, HETZNER-05, HETZNER-06
**Success Criteria** (what must be TRUE):

  1. `next.config.mjs` is set to `output: 'standalone'` and `npm run build` produces `.next/standalone/server.js`; the Dockerfile is a multi-stage Node 22 alpine build that runs as a non-root user, exposes port 3000, and produces an image under 500 MB
  2. A developer can run `docker build -t xtimator . && docker run -p 3000:3000 --env-file .env.local xtimator` on Windows / macOS / Linux — the app boots, `/api/health` returns 200 with `{ ok, db, storage, commit }`, and a fresh signup + login flow completes against dev Supabase
  3. `docker-compose.yml` at the repo root brings up the Next.js service plus a Caddy reverse proxy with automatic Let's Encrypt HTTPS, an env file mount, and `restart: unless-stopped`
  4. `app/api/health/route.ts` returns 200 with `{ ok: true, db: 'ok', storage: 'ok', commit: '<sha>' }` — DB connectivity verified by a SELECT against `companies`, storage verified via a `storage.list(...)` call against the configured provider, commit SHA read from `process.env.GIT_SHA`
  5. `docs/HETZNER-DEPLOY.md` is a runbook a developer can follow end-to-end (provision CX22 → Docker + Caddy install → DNS A record → populate `.env.production` on server → `docker compose up -d` → `/api/health` smoke → UFW firewall → cert renewal verification → daily off-server backup of `.env.production`) — placeholder syntax only for any secret values, never real keys

**Plans**: 2 plans
Plans:

- [x] 95-01-PLAN.md — Wave 1: Update test anchors + add QA-03 behavioral test (RED until Wave 2)
- [x] 95-02-PLAN.md — Wave 2: Wire shared graph in generate-estimate.ts + onError re-throw in default.ts (makes Wave 1 GREEN)

### Phase 69: UAT Validation + Bug Triage + Perf Audit

**Goal**: Every refactored surface is exercised by a human against localhost — v2.2 WhatsApp polish, the v3.0 monetization stack, the new Inngest background pipeline, every storage path post-refactor, end-to-end happy path, multi-modal capture, i18n smoke. Critical bugs are fixed in this milestone with linked commits; non-critical findings are documented. Lighthouse + bundle-size audit captured. The milestone exits clean only when `.planning/known-issues.md` has a verdict for every UAT test. Sequenced last because it validates every refactor + artifact above.
**Depends on**: Phase 66 (storage refactor must be in place to validate UAT-STORAGE-01), Phase 67 (Inngest must be wired to validate UAT-INNGEST-01..02), Phase 68 (Docker artifacts available; UAT can optionally run against the Dockerized localhost build)
**Requirements**: UAT-V22-01, UAT-V22-02, UAT-V30-01, UAT-V30-02, UAT-V30-03, UAT-V30-04, UAT-V30-05, UAT-V30-06, UAT-INNGEST-01, UAT-INNGEST-02, UAT-STORAGE-01, UAT-E2E-01, UAT-E2E-02, UAT-E2E-03, FIX-01, FIX-02, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. Every v2.2 + v3.0 + Inngest + Storage UAT test (`UAT-V22-*`, `UAT-V30-*`, `UAT-INNGEST-*`, `UAT-STORAGE-01`, `UAT-E2E-*`) has a pass-or-fail verdict line in `.planning/known-issues.md` — no silent successes
  2. The full happy path is observed in one sitting: brand-new account signs up, completes onboarding, captures audio at a fixture job site, the AI generates an estimate via Inngest, the owner sends a share link to a fixture client, the client opens the share page and accepts; multi-modal variants (text-only, photos-only, audio+photos+text) all produce sensible estimates; switching language to PT-BR and ES translates the dashboard, capture screen, and billing page without crashes
  3. The 8-minute long-audio test completes successfully via Inngest — proving the timeout-killer that would have failed on Vercel Free without the background-job refactor; tier enforcement (free 402, pro/business higher caps), Stripe test-mode happy path, Customer Portal, trial automation (T-3/T-0 emails arrive), admin force-tier + bonus credits + MRR view all observable
  4. Every storage path validated post-refactor — audio upload, photo upload, PDF generation, logo upload, and WhatsApp inbound media — uses the new `storage.*` API and works against Supabase
  5. Every critical bug surfaced is fixed in this milestone with a linked commit reference; every non-critical finding is captured in `.planning/known-issues.md` with severity, repro steps, and a proposed fix direction; the file exists at milestone close even on a "zero bugs found" outcome
  6. Lighthouse scores >= 80 in Performance and Accessibility on `/` (landing) and `/dashboard` (authenticated); `npm run build` reports First Load JS for `/dashboard` under 500 KB or the rationale is captured in `.planning/known-issues.md`

**Plans**: 2 plans (2 waves)

- [x] 111-01-PLAN.md — billing_config store core: getBillingConfig() reader + DEFAULT_BILLING_CONFIG + billingConfigSchema (zod) + 'billing_config.save' AuditAction + 30s TTL cache, ships dormant (BILLCFG-01, BILLCFG-03)
- [x] 111-02-PLAN.md — super-admin Billing panel: saveBillingConfig() action (requireAdmin-first, zod, metadata-only upsert, invalidate, audit) + 'billing' category + inline BillingConfigForm (BILLCFG-02, BILLCFG-03)

**UI hint**: yes

### Phase 70: Stripe Connect — Optional Customer Payments on Estimates

**Goal**: Any service business that connects their Stripe account once via OAuth in Settings → Payments gets a "Pay Now" button on every shared estimate. Customer pays the full estimate total via Stripe Checkout hosted on the business's connected account; webhook marks the estimate paid, emails business owner, emails customer branded receipt, shows banner on share page. The integration is 100% optional — companies without Stripe connected see zero Stripe UI anywhere and all existing share/PDF/email flows work unchanged. Application fee is 0% (provider keeps 100%; Xtimator monetizes via SaaS plans only). Harvests SEED-020.
**Depends on**: Phase 7 (estimate share page exists), Phase 58 (Stripe client + webhook infrastructure exists for SaaS billing)
**Requirements**: CONNECT-01, CONNECT-02, CONNECT-03, CONNECT-04, CONNECT-05, CONNECT-06, CONNECT-07, CONNECT-08, CONNECT-09
**Success Criteria** (what must be TRUE):

  1. A business owner can navigate to Settings → Payments, click "Connect Stripe Account", complete Stripe OAuth (test mode in dev), and return to a page showing "Connected ✓ as [account display name]" with a Disconnect button — `companies.stripe_account_id` is populated and `stripe_connect_status = 'active'`
  2. On a shared estimate page (`/estimate/[token]`), if the owning company has `stripe_account_id` AND `payment_status != 'paid'`, a "Pay $X" button is rendered using the estimate total; clicking it creates a Stripe Checkout Session on the connected account (via `stripeAccount` option) and redirects the customer to the Stripe-hosted payment page
  3. On the same shared estimate page, if the company has no `stripe_account_id` OR `payment_status == 'paid'`, no Pay Now button is shown and the existing share UI (accept/decline, PDF download, branded view) renders exactly as before — confirmed via two snapshot tests, one with Stripe connected and one without
  4. When the customer completes payment on Stripe Checkout, the `checkout.session.completed` webhook (received with `event.account = acct_xxx`) is matched to the company by `stripe_account_id`, the estimate is found by `metadata.estimate_id`, and the row is updated: `payment_status = 'paid'`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`
  5. After payment, the business owner receives a Resend email "You received $X from [customer]" with a link to the estimate, and the customer receives a Resend branded receipt email "Payment confirmation — $X paid to [business]"; the customer is redirected back to `/estimate/[token]?stripe=success` where a green "✓ Payment received — thank you!" banner is shown and the Pay Now button is gone
  6. A business owner can click Disconnect in Settings → Payments and `stripe_account_id` is cleared, `stripe_connect_status = 'disconnected'` — existing paid estimates retain their `paid` status; new shared estimates simply lose the Pay Now button (graceful degrade, no errors)
  7. The platform owner can add a `stripe_connect_client_id` (`ca_...`) value via `/admin/integrations` (managed via existing `platform_integrations` table pattern); when this is unset, Settings → Payments shows "Stripe Connect not yet enabled on the platform — contact support" and never attempts an OAuth redirect that would 404

**Plans**: TBD

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

**Plans**: 2 plans

Plans:

- [x] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [x] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

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

### Phase 40: Webhook Infrastructure

**Goal**: The system can receive, verify, and route inbound WhatsApp messages — the security and data foundation for every subsequent phase
**Depends on**: Phase 39 (last shipped phase; no functional dependency)
**Requirements**: WA-01, WA-02, WA-03, WA-04
**Success Criteria** (what must be TRUE):

  1. A `GET /api/webhooks/whatsapp` request from Meta with correct `hub.verify_token` returns the `hub.challenge` value and is not redirected to login by `proxy.ts`
  2. A `POST /api/webhooks/whatsapp` request with a valid HMAC-SHA256 `X-Hub-Signature-256` header is accepted; a request with an invalid or missing signature is rejected with HTTP 401
  3. A second inbound POST carrying the same `wamid.*` message ID as a previously processed message is silently discarded — no duplicate estimate is created
  4. The `company_whatsapp` and `whatsapp_sessions` tables exist in Supabase with correct RLS policies; the Meta access token can be stored and retrieved via the admin panel `platform_integrations` card

**Plans**: 2 plans

Plans:

- [x] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [x] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 41: Generate-Estimate Service Extraction

**Goal**: The estimate generation pipeline is callable without an authenticated user session, enabling the webhook handler to invoke it using only a companyId
**Depends on**: Phase 40 (infrastructure must exist; service client pattern established)
**Requirements**: (internal prerequisite — enables WA-07, WA-08, WA-09)
**Success Criteria** (what must be TRUE):

  1. `lib/services/generate-estimate.ts` exports a function callable with `(companyId: string, projectId: string)` that runs the full estimate generation pipeline and persists the result to the database
  2. The existing `POST /api/generate-estimate` route calls this service function after its auth check — behavior from the authenticated UI path is unchanged
  3. Unit tests exercise the service function directly without an HTTP request or auth context

**Plans**: 2 plans

Plans:

- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 42: Inbound Processing

**Goal**: An owner can send audio, text, or a photo to the registered WhatsApp number and receive an estimate confirmation summary in reply — without opening the app
**Depends on**: Phase 40 (webhook route + DB tables), Phase 41 (generate-estimate service callable without auth)
**Requirements**: WA-07, WA-08, WA-09, WA-10
**Success Criteria** (what must be TRUE):

  1. Owner sends a voice note via WhatsApp — the bot transcribes it via Whisper, generates an estimate, and replies with a formatted summary of sections and total within the Meta 20-second response window (fire-and-forget async)
  2. Owner sends a text message describing a job — the bot generates an estimate from that text and replies with a confirmation summary
  3. Owner sends a photo of a job site — the bot analyzes it via Claude Vision, generates an estimate, and replies with a confirmation summary
  4. The reply summary presents the estimate total and a brief line-item breakdown, followed by "send" and "cancel" instructions

**Plans**: 2 plans

Plans:

- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 43: Confirmation Flow

**Goal**: After receiving an estimate summary, the owner can confirm or cancel via a WhatsApp reply, and sessions that go unanswered expire automatically
**Depends on**: Phase 42 (inbound processing must create sessions in awaiting_confirm state)
**Requirements**: WA-11, WA-12, WA-13
**Success Criteria** (what must be TRUE):

  1. Owner replies "send" in the confirmation window — the session transitions to delivery and the owner receives a confirmation that the estimate is being sent to the client
  2. Owner replies "cancel" — the draft project and estimate are discarded and the bot confirms cancellation; no orphan records remain
  3. A session with no owner response expires after 30 minutes — the bot sends an expiry notification and the session is cleaned up from the database

**Plans**: 2 plans

Plans:

- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 44: Outbound Client Delivery

**Goal**: After the owner confirms, the estimate is delivered to the client via the company's configured format and the owner is notified of successful delivery
**Depends on**: Phase 43 (confirmation flow must have triggered "send")
**Requirements**: WA-14, WA-15
**Success Criteria** (what must be TRUE):

  1. When delivery format is "share link" (default), the client receives a WhatsApp message containing the public estimate URL (`xtimator.com/estimate/{token}`) — no template approval required
  2. The estimate and project records are updated to status "sent" after successful delivery
  3. The owner receives a WhatsApp confirmation message that the estimate was delivered to the client

**Plans**: 2 plans

Plans:

- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

### Phase 45: Settings UI + Admin Token

**Goal**: Owners can connect, verify, and configure their WhatsApp Business number from the settings page, and admins can manage the Meta access token
**Depends on**: Phase 40 (company_whatsapp table and API routes must exist)
**Requirements**: WA-05, WA-06
**Success Criteria** (what must be TRUE):

  1. Owner navigates to `/settings/integrations`, sees a WhatsApp card, enters their Business phone number, receives a verification code, and confirms — the number shows as "Active" with a green indicator
  2. Owner clicks "Disconnect" and confirms the AlertDialog — the number is removed and future messages from that number are silently ignored
  3. Active connection card shows a delivery format selector (share link / formatted text); the selected format is persisted and respected by the outbound delivery flow

**Plans**: 2 plans

Plans:

- [ ] 40-01-PLAN.md — DB migration (3 WA tables + RLS + purge) + lib/whatsapp/ modules (types, verify, client) + unit tests
- [ ] 40-02-PLAN.md — Webhook route (GET challenge + POST HMAC handler + dedup stub) + proxy.ts bypass

**UI hint**: yes

### Phase 46: Typed Error Handling Foundation

**Goal**: Establish a typed error class with type+surface composite codes, status mappings, user message lookup, and adapters for HTTP responses and WhatsApp messages
**Depends on**: None (foundational)
**Requirements**: Derived from SEED-014
**Success Criteria** (what must be TRUE):

  1. Any handler can `throw new XtimatorError('tier_limit', 'estimates', 'msg', cause?, meta?)` and the caller wrapping with `asResponse(err)` gets correct HTTP status + JSON body
  2. WhatsApp handler can `handleWhatsAppError(err, fromPhone)` and the user receives a contextual message based on the error code
  3. ZodError is auto-translated to 400 with the invalid fields list
  4. Internal errors return generic message to user but log full stack server-side

**Plans**: 1 plan

### Phase 47: Redis + Rate Limiting Infrastructure

**Goal**: Provision Upstash Redis and ship `rateLimit(name, identifier)` applied to the four most-expensive endpoints + a per-IP middleware in proxy.ts
**Depends on**: Phase 46 (uses XtimatorError for 429 responses)
**Requirements**: Derived from SEED-012
**Success Criteria**:

  1. `lib/redis.ts` exposes a single Upstash client; env vars validated at startup
  2. `rateLimit('userEstimatePerHour', userId)` returns `{ allowed, retryAfter }` via sliding window (INCR + EXPIRE NX)
  3. Hitting an endpoint past the limit returns HTTP 429 with `Retry-After` header
  4. Per-IP middleware in proxy.ts blocks abusive bursts before they reach any route

**Plans**: 1 plan

### Phase 48: WhatsApp Multi-Message Debounce

**Goal**: When a user sends multiple messages within 5 seconds, buffer them in Redis and process the entire batch as one estimate
**Depends on**: Phase 47 (Redis client must exist)
**Requirements**: Derived from SEED-010
**Success Criteria**:

  1. User sends 5 messages in quick succession — system waits 5s after the last, then processes ALL together
  2. `processInboundMessage()` accepts an array of messages and generates ONE estimate
  3. If a message arrives during processing, it starts a new buffer (no data loss)
  4. Buffer has 2-minute TTL safety net

**Plans**: 1 plan

### Phase 49: WhatsApp Typing + Read Receipts

**Goal**: Mark inbound messages as read (blue checks) and show typing indicator during AI processing
**Depends on**: Phase 46 (errors)
**Requirements**: Derived from SEED-011
**Success Criteria**:

  1. Immediately after dedup passes, blue checks appear on the user's phone (<1s)
  2. Before heavy processing, typing indicator appears in the chat
  3. If processing exceeds 25s, typing indicator is re-sent before timeout
  4. Meta API failures on these calls are silently swallowed (fire-and-forget)

**Plans**: 1 plan

### Phase 50: WhatsApp OTP Number Verification

**Goal**: Require proof of ownership via WhatsApp-delivered code before activating a number
**Depends on**: Phase 46 (errors), Phase 49 (sendWhatsAppMessage)
**Requirements**: Derived from SEED-015 Gap 2
**Success Criteria**:

  1. User submits credentials → status='pending' → 6-digit code sent via WhatsApp
  2. User enters code → server validates (10min TTL, max 3 attempts) → status='active'
  3. Wrong/expired code shows clear error; after 3 attempts, row is reset
  4. Inbound webhook only accepts messages from numbers with status='active'

**Plans**: 1 plan

### Phase 51: WhatsApp Pre-Send Edit Commands

**Goal**: Owner can edit the estimate via structured WhatsApp commands while in awaiting_confirm, instead of canceling and starting over
**Depends on**: Phase 46 (errors), Phase 48 (debounce)
**Requirements**: Derived from SEED-015 Gap 1
**Success Criteria**:

  1. Owner can `edit total 450` / `edit section 1 "X"` / `edit item 2.3 price 85`
  2. Owner can `add item ...` / `remove item ...` / `regenerate` / `client "Name" 555...`
  3. After every successful edit, the updated summary is re-sent; session stays in awaiting_confirm
  4. Invalid commands return a contextual error explaining the right syntax

**Plans**: 1 plan

### Phase 52: Per-Estimate Language Selection

**Goal**: An estimate can be generated in EN, PT-BR, or ES regardless of the user's app language; English-first cascade resolves the default
**Depends on**: Phase 46 (errors)
**Requirements**: Derived from SEED-016
**Success Criteria**:

  1. Schema adds `estimates.language` (required, default 'en'), `clients.preferred_language` (nullable), `companies.default_estimate_language` (nullable)
  2. `generateEstimateForProject()` accepts a language parameter; AI prompt generates in target language with locale-aware formatting
  3. `EstimatePDF` is i18n-aware; renders in the estimate's language
  4. WhatsApp formatter uses estimate.language for client-facing message
  5. Generate-estimate UI exposes a "Generate in:" dropdown with cascade-resolved default
  6. After sending, if `clients.preferred_language` is null, auto-set to the estimate's language

**Plans**: 1 plan

### Phase 53: PDF Attachment Delivery

**Goal**: Clients can receive their estimate as a PDF document via WhatsApp — a third delivery option alongside share link and formatted text
**Depends on**: Phase 44 (outbound delivery branching in confirm.ts), Phase 45 (delivery_format selector UI), Phase 50 (status=active gate already in place)
**Requirements**: WAPDF-01, WAPDF-02, WAPDF-03, WAPDF-04
**Success Criteria** (what must be TRUE):

  1. Owner can select "PDF attachment" as the delivery format in WhatsApp settings — the option appears alongside "Share link" and "Formatted text" in the selector
  2. When delivery format is set to pdf_attachment and the owner confirms send, the client receives a WhatsApp document message with a descriptive filename (e.g. `Estimate-ClientName-2026-05-11.pdf`) and a caption from the company name
  3. The PDF is the same branded document generated by the existing `/api/estimates/[id]/pdf` endpoint — line items, totals, company logo, and colors are correct
  4. If PDF generation, Supabase Storage upload, or the Meta document API call fails for any reason, the send completes anyway using the share_link fallback — the owner is not left with a failed delivery

**Plans**: 2 plans
Plans:

- [x] 53-01-PLAN.md — Wave 0 test stubs + DB migration (extend delivery_format CHECK) + lib/whatsapp/pdf-delivery.ts helper (generateAndUploadEstimatePDF + buildPdfFilename)
- [x] 53-02-PLAN.md — confirm.ts handleSend pdf_attachment branch + WhatsAppConnectCard third SelectItem

### Phase 54: WhatsApp Status Flow

**Goal**: The WhatsApp connection status pipeline is fully wired — UI shows accurate labels, transitions follow the correct sequence, admins can suspend and reactivate, and the message handler enforces the active gate
**Depends on**: Phase 50 (OTP verification established pending→active path), Phase 45 (WhatsAppConnectCard UI)
**Requirements**: WASTATUS-01, WASTATUS-02, WASTATUS-03, WASTATUS-04
**Success Criteria** (what must be TRUE):

  1. The WhatsApp Connect Card displays one of four human-readable labels — "Pending", "Verified", "Active", or "Suspended" — matching the current database status value; no raw enum values are shown to the user
  2. After OTP verification completes (Phase 50 flow), the status automatically transitions to `active` without requiring a separate admin approval step
  3. An owner (or admin) can set the connection status to `suspended` from the settings UI, and a suspended connection can be reactivated back to `active` — both actions persist correctly and are reflected immediately in the UI
  4. An inbound WhatsApp message from a number whose `company_whatsapp.status` is `pending`, `verified`, or `suspended` is silently ignored by the handler — no estimate is created, no reply is sent

**Plans**: 2 plans
Plans:

- [x] 54-01-PLAN.md — updateWhatsAppStatus server action + unit tests (WASTATUS-02, WASTATUS-03, WASTATUS-04)
- [x] 54-02-PLAN.md — WhatsAppConnectCard: StatusBadge + Suspend/Reactivate buttons (WASTATUS-01, WASTATUS-03)

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
| 24. Estimate Template Engine + Settings Page | v1.4 | 3/3 | Complete | 2026-05-08 |
| 25. Plain Text Tab + Copy UI | v1.4 | 2/2 | Complete | 2026-05-08 |
| 26. Bulk Price Adjustment | v1.4 | 2/2 | Complete | 2026-05-08 |
| 27. Capture Schema Migration | v1.5 | 1/1 | Complete | 2026-05-08 |
| 28. Unified Capture Screen | v1.5 | 1/1 | Complete | 2026-05-09 |
| 29. Frictionless Project Creation & Client Linking | v1.5 | 1/TBD | Complete | 2026-05-09 |
| 30. AI Client Extraction | v1.5 | 1/1 | Complete | 2026-05-09 |
| 31. Wizard Modality Selection | v1.6 | 1/1 | Complete | 2026-05-09 |
| 32. Text Input Route | v1.6 | 1/1 | Complete | 2026-05-09 |
| 33. Photos Input Route | v1.6 | 1/1 | Complete | 2026-05-09 |
| 34. Client-Project Quick Actions Verification | v1.7 | 1/1 | Complete | 2026-05-09 |
| 35. Text Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 36. Voice Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 37. Photo Refinement | v1.8 | 1/1 | Complete | 2026-05-09 |
| 38. Custom Domain DB + Settings UI | v1.9 | 2/2 | Complete | 2026-05-10 |
| 39. Subdomain Routing + White-label Estimate View | v1.9 | 1/1 | Complete | 2026-05-10 |
| 40. Webhook Infrastructure | v2.0 | 2/2 | Complete | 2026-05-10 |
| 41. Generate-Estimate Service Extraction | v2.0 | 1/1 | Complete | 2026-05-10 |
| 42. Inbound Processing | v2.0 | 1/1 | Complete | 2026-05-10 |
| 43. Confirmation Flow | v2.0 | 2/2 | Complete | 2026-05-10 |
| 44. Outbound Client Delivery | v2.0 | 1/1 | Complete | 2026-05-10 |
| 45. Settings UI + Admin Token | v2.0 | 1/1 | Complete | 2026-05-10 |
| 46. Typed Error Handling Foundation | v2.1 | 1/1 | Complete | 2026-05-11 |
| 47. Redis + Rate Limiting Infrastructure | v2.1 | 1/1 | Complete | 2026-05-11 |
| 48. WhatsApp Multi-Message Debounce | v2.1 | 1/1 | Complete | 2026-05-11 |
| 49. WhatsApp Typing + Read Receipts | v2.1 | 1/1 | Complete | 2026-05-11 |
| 50. WhatsApp OTP Number Verification | v2.1 | 1/1 | Complete | 2026-05-11 |
| 51. WhatsApp Pre-Send Edit Commands | v2.1 | 1/1 | Complete | 2026-05-11 |
| 52. Per-Estimate Language Selection | v2.1 | 1/1 | Complete | 2026-05-11 |
| 53. PDF Attachment Delivery | v2.2 | 2/2 | Complete    | 2026-05-11 |
| 54. WhatsApp Status Flow | v2.2 | 2/2 | Complete    | 2026-05-13 |
| 55. Schema + Tier Definitions | v3.0 | 2/2 | Complete    | 2026-05-13 |
| 56. Usage Tracking | v3.0 | 1/1 | Complete    | 2026-05-14 |
| 57. Enforcement Layer | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 58. Stripe Integration | v3.0 | 2/2 | Complete    | 2026-05-14 |
| 59. Billing UI | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 60. Trial Automation + Admin Tooling | v3.0 | 1/2 | Complete    | 2026-05-14 |
| 61. Production Database Foundation | v3.1 | 1/5 | Complete    | 2026-05-15 |
| 62. ~~Vercel Deployment + Custom Domain~~ | v3.1 | — | REMOVED — see SEED-018 for Hetzner migration | - |
| 63. Stripe Live Mode Activation | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 64. Monitoring + Backup & Resilience | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 65. Production UAT + Bug Triage | v3.1 | 0/TBD | DEFERRED → v3.2 | - |
| 66. Storage Abstraction Layer | v3.1.1 | 3/3 | Complete    | 2026-05-15 |
| 67. Inngest Background AI Job Processing | v3.1.1 | 5/5 | Complete    | 2026-05-15 |
| 68. Hetzner Cloud Deploy-Readiness Artifacts | v3.1.1 | 2/3 | Complete    | 2026-05-15 |
| 69. UAT Validation + Bug Triage + Perf Audit | v3.1.1 | 0/TBD | Complete    | 2026-05-15 |
| 70. Stripe Connect — Customer Payments | v3.1.1 | 5/5 | Complete    | 2026-05-17 |
| 71. Glassmorphism Structural Redesign | v3.1.1 | 11/11 | Complete    | 2026-05-17 |
| 72. Admin Menu Performance | v3.1.1 | 3/3 | Complete    | 2026-05-18 |
| 73. Language Onboarding + Estimate Language UI | v3.1.1 | 5/5 | Complete    | 2026-05-19 |
| 74. Post-Onboarding App Feature Tour | v3.1.1 | 4/4 | Complete    | 2026-05-19 |
| 104. Notification Channels & Preferences Revamp | v4.5.1 | 4/4 | Complete | 2026-06-22 |
| 105. `price_source: 'researched'` Threading | v4.6 | 2/2 | Complete    | 2026-06-24 |
| 106. Cache Table + Tenant-Scoped Cache Module | v4.6 | 2/2 | Complete    | 2026-06-24 |
| 107. Provider Seam + First Source + Determinism Seam | v4.6 | 3/3 | Complete    | 2026-06-24 |
| 108. Orchestrator + Service Integration | v4.6 | 5/5 | Complete    | 2026-06-24 |
| 109. Durability + Cost-Control Hardening | v4.6 | 2/2 | Complete    | 2026-06-24 |
| 117. Knowledge Schema + pgvector + Dual RLS | v4.8 | 1/1 | Complete    | 2026-06-24 |
| 118. Channel-Neutral lib/knowledge/ Module | v4.8 | 3/3 | Complete    | 2026-06-24 |
| 119. Super-Admin Industry KB Curation + Bulk Import | v4.8 | 3/3 | Complete    | 2026-06-24 |
| 120. Company KB Overlay (tenant settings) | v4.8 | 2/2 | Complete    | 2026-06-25 |
| 121. WhatsApp KNOWLEDGE Intent | v4.8 | 1/1 | Complete    | 2026-06-25 |
| 141. Configurable Annual Pricing | v4.13 | 1/1 | Complete   | 2026-06-25 |
| 142. Monthly Credit Grant Decouple | v4.13 | 1/1 | Complete   | 2026-06-27 |
| 143. Annual Checkout | v4.13 | 1/1 | Complete   | 2026-06-28 |
| 144. Interval-Aware Seat Billing | v4.13 | 1/1 | Complete   | 2026-06-28 |
| 145. Pricing UI Toggle | v4.13 | 1/1 | Complete   | 2026-06-28 |

### Phase 75: Tour and Tooltip QA

**Goal:** Every spotlight tour step and contextual tooltip from Phase 74 only appears when intended, lands in the correct DOM position, dismisses cleanly, and persists "seen" state per user across sessions. Owner reports tooltips popping up unprompted (e.g., LanguageToggle tooltip floating without trigger) and "meio bugados" overall.

**Depends on:** Phase 74 (Tour & Contextual Tooltips system)

**Requirements**: TOUR-FIX-01, TOUR-FIX-02, TOUR-FIX-03, TOUR-FIX-04, TOUR-FIX-05, TOUR-FIX-06, TOUR-FIX-07

**Success Criteria** (what must be TRUE):

  1. Audit lists every `ContextualTooltip` mount point + trigger condition + dismiss rule in a single doc (e.g., `tests/visual/tour-inventory.md`)
  2. Every tooltip and spotlight step appears ONLY when its documented trigger fires — no unprompted popups on page load, refresh, or unrelated nav
  3. Tooltip positioning honors the `side` prop and never overflows viewport; auto-flips to the opposite side when there's no room
  4. Dismissal persists per user — once dismissed, a tooltip never reappears unless the user explicitly opens "Restart tour" via `TourHelpButton`
  5. `prefers-reduced-motion` honored (no animation when reduce); `prefers-reduced-transparency` honored on spotlight overlay; keyboard ESC dismisses spotlight
  6. Unit tests cover the tour state machine (start, advance, prev, dismiss, restart) and tooltip persistence layer (seen flag in localStorage); minimum 8 cases
  7. Manual UAT pass: open every page that hosts a tooltip in EN, PT, ES (3 locales × N pages); confirm strings translated, position correct, animation gated, no overlap with sticky topbar or hero gradient

**Plans:** 4/4 plans complete

### Phase 76: Price Book CSV Pro — Professional Import UX

**Goal:** The Price Book CSV import becomes a polished multi-step wizard that handles real-world messy data: column mapping, per-row validation with inline edit, duplicate resolution strategy, currency/locale parsing, undo after import, and a verification summary. A non-technical contractor can paste an exported spreadsheet (from QuickBooks, Excel, Google Sheets) and end with a clean Price Book without needing to pre-massage the file.

**Depends on:** Phase 19 (Price Book DB) · Phase 20 (Price Book CRUD UI) · Phase 21 (Initial CSV Import — the baseline this phase upgrades)

**Requirements:** PB-CSV-01, PB-CSV-02, PB-CSV-03, PB-CSV-04, PB-CSV-05, PB-CSV-06, PB-CSV-07, PB-CSV-08, PB-CSV-09, PB-CSV-10

**Success Criteria** (what must be TRUE):

  1. **4-step wizard** replaces single dialog — (1) Upload + drag-drop, (2) Column mapping (auto-detect with override), (3) Preview + per-row edit + dedupe strategy choice, (4) Import + verification summary. Progress indicator shows current step.
  2. **Column auto-detection** — recognizes common alias headers ("item", "service", "description" → name; "price", "cost", "rate" → unit_price; "category", "group", "folder" → folder; "qty unit", "uom", "measure" → unit). User can override every mapping via dropdown. Supports skipping unmapped columns.
  3. **Per-row inline editing** — every preview row's name/unit/unit_price/folder is editable directly in the table before commit. Validation errors (negative price, missing name, malformed currency) shown inline; row blocked from import only if user doesn't fix.
  4. **Locale-aware currency parsing** — accepts `$1,234.56` · `1.234,56` · `R$ 1.234,56` · `1234` · `1234.5` · `"$1,234.56"`. Owner sees detected locale guess + can override (US / BR / Custom decimal+thousands).
  5. **Duplicate resolution strategy** — when name+folder collides with existing row, user picks: Skip duplicates · Update existing (overwrite unit_price + unit + notes) · Import as new (suffix " (2)"). Default: Skip. Per-row override available.
  6. **Dry-run summary BEFORE commit** — shows: N rows will be inserted · N updated · N skipped · N folders created. User confirms before any DB write.
  7. **Undo last import** — every batch import writes a `price_book_imports` row capturing the inserted IDs; "Undo last import" button on price-book page deletes those rows (5-min window). Persisted in DB so survives reload.
  8. **Streaming progress for large files** — files >200 rows show real-time progress (e.g. "Importing 347 of 800…") via React state ticks during the bulk insert. UI doesn't lock; cancel button available.
  9. **Error report download** — if any rows fail validation, user can download `import-errors.csv` with the failed rows + reason column. Same format as input so they can fix and re-upload.
  10. **Tests cover the new pipeline** — unit tests for: auto-detect aliases (8 cases), locale parsing (12 cases), dedupe strategies (3 cases × scenarios), wizard state machine (step nav + persistence on close-reopen). Playwright E2E spec walks the full happy path with a 50-row fixture file.

**Out of scope for Phase 76:** scheduled imports, recurring sync with external sheets (Google Sheets API), AI-powered field normalization (use deterministic alias matching only). Those become future seeds.

**Plans:** 5/5 plans complete

### Phase 76.1: PWA — Progressive Web App Infrastructure (INSERTED)

**Goal:** Xtimator passes Lighthouse PWA installability checks and can be added to the home screen on iOS Safari and Android Chrome. A service worker (via `@ducanh2912/next-pwa`) caches the app shell and previously visited estimates in read-only mode, so field contractors who open the app offline see their last-loaded data instead of a blank screen. Push notification scaffold (service worker registration + permission prompt) is out of scope here and belongs to Phase 77.

**Depends on:** Phase 76 (Price Book CSV Pro — ensures app shell is stable before service worker layer is added)

**Requirements:** PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06

**Success Criteria** (what must be TRUE):

  1. **Installable** — Lighthouse PWA audit passes on mobile simulation (all installability checks green). App installs correctly on iOS Safari (Add to Home Screen) and Android Chrome (install prompt).
  2. **App shell offline** — Killing the network and reloading shows the app shell (not a browser error page). A branded offline fallback page renders at `/offline`.
  3. **Read-only cache** — Previously visited `/estimates` list and individual `/estimates/[id]` pages load from cache when offline. Stale-while-revalidate for Supabase GET calls; Network Only for mutations and AI routes.
  4. **Install prompt** — A bottom banner ("Install Xtimator for quick access") appears after the user has ≥1 estimate and has not dismissed it. Stores dismissal in localStorage. Only shown to authenticated users.
  5. **Offline indicator** — A subtle top bar "You're offline — showing cached data" appears when `navigator.onLine` is false. Create/record CTAs are disabled with tooltip "Requires internet connection".
  6. **Icons** — `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png` exist; `app/manifest.ts` fallback icons array points to `/icons/*`; `apple-touch-icon` meta tag present in layout.

**Out of scope:** Push notification delivery (→ Phase 77), background sync / offline mutation queue, native app store submission.

**Plans:** 2/2 plans complete

Plans:

- [x] 76.1-01-PLAN.md — viewport export, apple meta tags, InstallPrompt estimate gate + iOS branch, Wave 0 test stubs, app-icons test fix (PWA-01, PWA-04, PWA-06)
- [x] 76.1-02-PLAN.md — offline CTA disabling (New Project buttons) + Lighthouse manual QA checkpoint (PWA-02, PWA-03, PWA-05)

### Phase 76.2: Settings & Admin Persistence Fix — DB Schema Sync + Full Audit (INSERTED) — COMPLETE 2026-05-21

**Goal:** Every field in every settings page and admin panel actually persists to the database after save + refresh. Root cause: 6 columns added via recent migrations (`digital_signature_enabled`, `estimate_terms_enabled`, `estimate_terms_text`, `email_delivery_enabled`, `sms_delivery_enabled`, `ai_model_override`) were never applied to the Supabase project and `database.types.ts` was never regenerated. This phase applies all pending migrations, regenerates types, fixes any TypeScript errors surfaced, hardens server action error visibility, and does a full manual verification of every settings and admin form.

**Depends on:** Phase 76 (Price Book CSV Pro — stable baseline before schema changes)

**Requirements:** SETTINGS-FIX-01, SETTINGS-FIX-02, SETTINGS-FIX-03, SETTINGS-FIX-04, SETTINGS-FIX-05

**Success Criteria** (what must be TRUE):

  1. **All 6 missing columns exist in Supabase** — `digital_signature_enabled` (BOOL), `estimate_terms_enabled` (BOOL), `estimate_terms_text` (TEXT), `email_delivery_enabled` (BOOL), `sms_delivery_enabled` (BOOL), `ai_model_override` (TEXT) — verified via `SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'`.
  2. **`database.types.ts` reflects all columns** — all 6 columns present in `Database['public']['Tables']['companies']['Row']` type after regeneration via Supabase MCP or CLI.
  3. **No TypeScript errors in settings/admin actions** — `npx tsc --noEmit` exits 0; no implicit `any` or missing-property errors in `lib/actions/settings.ts`, `app/admin/companies/actions.ts`, and all affected form components.
  4. **Server action errors surface visibly** — `updateDeliverySettings`, `updateEstimateTerms`, `setCompanyModelOverride` log and return `{ ok: false, error }` on DB failure instead of silently swallowing errors; toast/alert shown in UI on failure.
  5. **Manual verification passes** — for every affected page: fill form → save → hard refresh → values match what was saved. Pages: `/settings/delivery`, `/settings/estimate-templates`, `/admin/companies/[id]`. No regression on other settings pages.

**Affected files:**

- `supabase/migrations/` — 3 migration files to apply: `20260519000002`, `20260519000003`, `20260520000001`
- `types/database.types.ts` — regenerate after applying migrations
- `lib/actions/settings.ts` — fix TypeScript errors, surface errors in `updateDeliverySettings` + `updateEstimateTerms`
- `app/admin/companies/actions.ts` — fix TypeScript errors in `setCompanyModelOverride`
- `components/settings/delivery-settings-form.tsx` — fix type errors after regeneration
- `components/settings/estimate-terms-form.tsx` — fix type errors after regeneration

**Out of scope:** New features, UI redesign, WhatsApp settings (already working), billing pages (read-only).

**Plans:** 1/1 plans complete

Plans:

- [x] 76.2-01-PLAN.md — Apply 3 pending migrations + regenerate types + add console.error logging + manual persistence verification (SETTINGS-FIX-01..05)

### Phase 77: Notifications System — Unified In-App + Email + (later) Push

**Goal:** A robust notifications layer that captures every consequential event in the app (estimate viewed, accepted, paid, payment received, trial ending, quota warning, WhatsApp inbound, AI job failed, admin override, etc.), persists per-user as in-app feed entries, and optionally delivers via email + browser push. Users see a bell icon with unread badge in the topbar; clicking opens a panel with grouped + filterable list. Each notification has read/unread state, link to the relevant resource, and per-category mute control in Settings.

**Depends on:** Phase 7 (Resend email infra) · Phase 67 (Inngest background dispatch) · Phase 70 (Stripe payment webhooks as event source) · Phase 71 (UI design system)

**Requirements:** NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09, NOTIF-10, NOTIF-11, NOTIF-12

**Success Criteria** (what must be TRUE):

  1. **`notifications` table** ships with: id · company_id · user_id (nullable for company-wide) · event_type (enum) · title · body · link_url · resource_type · resource_id · metadata JSONB · read_at · created_at · expires_at. RLS scoped to company_id.
  2. **`notification_preferences` per-user table** — JSONB `categories: {estimate: {in_app, email}, payment: {...}, trial: {...}, admin: {...}, whatsapp: {...}}`. Defaults: all in_app=true, email=true except quiet ones.
  3. **`notify()` server-side helper** at `lib/notifications/dispatch.ts` — single API for any code path to enqueue a notification. Takes event_type + payload, looks up user preferences, fans out to: insert in_app row + queue email via Resend + (future) push.
  4. **17 event types instrumented** across the app: estimate.viewed · estimate.accepted · estimate.declined · payment.received (Phase 70) · trial.expiring_3d · trial.expired · quota.80pct · quota.exhausted · whatsapp.inbound · ai_job.failed · ai_job.completed · admin.tier_changed · admin.bonus_credits_granted · price_book.imported · custom_domain.verified · invite.accepted · system.maintenance
  5. **Topbar bell icon** with unread count badge (red dot when >0). Click opens a 400px panel with: grouped by day, unread bold, click navigates to link_url + marks as read. "Mark all as read" + "See all" actions.
  6. **`/notifications` full-page view** with filtering by category + date range + read/unread, paginated, search by title/body.
  7. **Email digest mode** — instead of one email per event, group same-category events into a single email if >3 events in 1 hour. Cron via Inngest.
  8. **`/settings/notifications` tab** controls per-category toggles for in_app and email separately. Persists to `notification_preferences` immediately.
  9. **Browser push notifications** (Phase 1: scaffold only — request permission button + Web Push API service worker registration; actual push delivery deferred to Phase 2 if user signals demand). Adds `push_subscription` JSONB to `notification_preferences`.
  10. **Auto-cleanup cron** runs daily, deletes notifications older than 60 days unless `pinned=true`.
  11. **Real-time updates** via Supabase Realtime — `notifications` INSERT subscription on the client increments the bell badge live without refresh.
  12. **Tests** — unit: dispatch() preference fan-out (≥10 cases), category filtering (≥6 cases), email digest grouping (≥4 cases). Playwright E2E: walk full flow from trigger event → bell badge updates → click → read marked → navigate.

**Out of scope (potential future seeds):**

- SMS notifications (Twilio integration)
- Per-user custom rules ("notify me when estimates over $5000 are sent")
- Notification analytics dashboard
- Browser push delivery proper (Phase 1 ships scaffold only)

**Plans:** 7/7 plans complete

### Phase 78: Admin OG Image Upload — File Upload with Preview Feedback

**Goal:** The Super Admin SEO page replaces the bare "OG image URL" text input with a proper file upload control that shows visual preview, validates dimensions (1200x630 ideal, 600x315 minimum), stores in Supabase Storage, and surfaces the resulting URL automatically. Owner can upload a new image or remove the current one with one click.

**Depends on:** Phase 71 (design system) · Phase 66 (storage abstraction)

**Requirements:** OG-IMG-01, OG-IMG-02, OG-IMG-03, OG-IMG-04, OG-IMG-05

**Success Criteria** (what must be TRUE):

  1. Replace `<input type="url">` for OG image with a file upload dropzone (same UX as company LogoUploader). Accept image/png + image/jpeg. Max 2 MB.
  2. On file select, show preview of the image in a 1200×630 aspect ratio frame (the actual OG card dimensions) with overlay text "1200×630 recommended". Display detected dimensions; warn if <600×315 with red text, but allow override.
  3. Upload to Supabase Storage bucket `branding-assets/og-images/{timestamp}-{filename}` via existing `storage.upload()` API; on success, store the public URL in `platform_branding.og_image_url`.
  4. Remove button clears `og_image_url` to null AND deletes the previous storage object (best-effort — don't fail save if delete errors). Confirmation modal before remove.
  5. Existing URL-typed setups (current state) keep working — if `og_image_url` is set but the file isn't in branding-assets bucket (external URL), show preview if loadable + a hint "Currently using external URL — upload to migrate to managed storage".

**Plans:** 2/2 plans complete

### Phase 73: Language Onboarding + Estimate Language UI

**Goal:** New users pick the app + estimate language during onboarding (en / pt / es) instead of having it inferred from browser. Estimate generation respects that language end-to-end (AI prompts, PDF, share view, WhatsApp). The choice surfaces in Settings → Profile.

**Depends on:** Phase 12 (i18n translation system) · Phase 52 (per-estimate language backend)

**Requirements:** LANG-ONB-01..05, EST-LANG-UI-01..05

**Success Criteria:**

  1. Onboarding wizard step 1 has language selector (3 flags + names). Persists to `companies.preferred_language`.
  2. Estimate generation uses the company's `preferred_language` as the default for new estimates, overridable per estimate.
  3. Per-estimate language picker is visible in the editor next to the title; switching it re-runs the AI translation pass and updates the share view + PDF.
  4. Settings → Profile exposes the language picker with the same 3 options; change updates `preferred_language` and revalidates the app shell.
  5. All hardcoded English strings in onboarding + estimate UI now go through `t()`. PT-BR and es-MX translations covered.

**Plans:** 5/5 plans complete — SHIPPED 2026-05-20

### Phase 79: Multi-Company Foundation (Schema + Cookie + Active Company Resolution)

**Goal:** Ship the foundation slice of v4.0 Multi-Tenancy. `company_members(user_id, company_id, role)` join table exists with idempotent backfill (1 owner per existing company); session cookie holds `active_company_id`; server-side helpers `getActiveCompanyId()` / `getActiveCompany()` resolve it (cookie → validate → fallback to oldest membership → write cookie); `createOrUpdateCompany` gains a `mode: 'first' | 'add'` parameter; `app/(app)/layout.tsx` reads via the new resolvers. No new UI in this phase by design.

**Depends on:** v3.x stack (Supabase, layout, server actions)

**Requirements:** D-01..D-16 (CONTEXT.md decision IDs; not entered in REQUIREMENTS.md by design)

**Success Criteria:**

  1. New `company_members` table with composite PK (user_id, company_id), CASCADE FKs to `auth.users` + `companies`, RLS enabled with auth.uid() gated SELECT-only policy.
  2. Backfill INSERTs one `role='owner'` row per pre-existing company; re-running the backfill is a no-op (idempotent via `ON CONFLICT DO NOTHING`).
  3. `lib/queries/active-company.ts` exports `getActiveCompanyId`, `getActiveCompany`, `ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS`. Cookie precedence > fallback > null behavior fully unit-tested.
  4. `createOrUpdateCompany(input, mode)` preserves legacy upsert in `'first'` mode; `'add'` mode inserts a NEW companies row + matching company_members owner row and writes the active-company cookie.
  5. `app/(app)/layout.tsx` switched from `getCachedCompany(claims.sub)` to `getActiveCompany()`; billing row re-keyed to `.eq('id', activeCompanyId)`; `unstable_cache` re-keyed by activeCompanyId.

**Plans:** 4/4 plans complete — SHIPPED 2026-05-25 (foundation slice; Switcher UI + Add Company flow still pending in v4.0)

### Phase 80: Walkthrough Audit + Debug + Polish

**Goal:** End-to-end audit of the production-bound user walkthrough (signup → onboarding → first project → audio capture → AI estimate → share). Triage every snag (bug, copy issue, UX paper cut, perf hot spot) into a fix or a documented known-issue. Polish the rough edges that survived prior phases.

**Depends on:** Phases 71 (design), 72 (admin perf), 73 (language UI)

**Requirements:** WALKTHRU-01..04

**Success Criteria:**

  1. Walkthrough exercised on desktop + iOS Safari + Android Chrome; every issue logged with screenshot + reproduction.
  2. Critical issues fixed in this phase; non-critical added to `.planning/known-issues.md` with severity + workaround.
  3. Verification report (`80-VERIFICATION.md`) lists every gap addressed and each deferred item with rationale.
  4. Human UAT captured in `80-HUMAN-UAT.md` with the manual smoke test outcome.

**Plans:** 4/4 plans complete — SHIPPED 2026-05-21

### Phase 999.1: Migrate Inngest to Self-Hosted Hetzner (PARKING LOT)

**Goal:** Move the Inngest dev worker stack to a self-hosted instance on Hetzner Cloud to remove the managed Inngest dependency once the Hetzner host (Phase 68 deliverables) is operational.

**Status:** Backlog placeholder. Not started. Numbered `999.x` per GSD parking-lot convention to indicate "out of sequence, surface when prerequisites land".

**Prerequisites:**

  - Phase 67 (Inngest background AI jobs) — landed
  - Phase 68 (Hetzner Cloud deploy-readiness artifacts) — landed (but not yet exercised in prod)
  - v3.2 deployment milestone — not yet started

**Plans:** 3/3 plans complete

### v4.2 Recording Reliability & Observability (Phases 91-93)

- [x] **Phase 91: Recording Pipeline Reliability** -- Eliminate the opaque 503 from `GET /api/jobs/[jobId]`, degrade gracefully when Inngest is unconfigured, give the capture popup a human-readable failure + Retry + Edit-manually, and make pipeline jobs idempotent (carry-forward INNGEST-01/06)
 (completed 2026-05-29)

- [x] **Phase 92: Pipeline Event Persistence** -- New service-role-only events store plus backend instrumentation that records every pipeline step (success and failure) across all input types, additive to the existing `estimate_activity` write (completed 2026-05-30)
- [x] **Phase 93: Super Admin Event Log** -- Generations-style Super Admin UI: recent attempts list, search, filters + counts + refresh, and a per-attempt step timeline, exposing only safe metadata (completed 2026-05-30)

### Phase 91: Recording Pipeline Reliability

**Goal**: A user whose recording pipeline hits an Inngest-config or processing problem always sees an actionable, recoverable state instead of an opaque 503 -- and retries never double-charge AI/transcription providers. Completes the unfinished v3.1.1 INNGEST-01 (worker registration/reachability) and INNGEST-06 (idempotency).
**Depends on**: Phase 67 (Inngest pipeline + `/api/jobs/[jobId]` exist), Phase 90 (last shipped phase)
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05
**Success Criteria** (what must be TRUE):

  1. `GET /api/jobs/[jobId]` never returns an opaque 503 when Inngest is unconfigured -- it either reports a registered, reachable worker status or degrades to an actionable, non-error status the client can render
  2. When the pipeline fails, the capture popup shows a plain-language reason plus a Retry button and an "Edit manually" button -- never a raw status code or stack trace
  3. Tapping Retry continues the same attempt lineage (same attempt id), and "Edit manually" lands the user in the editor with all project context preserved -- no recording work is lost
  4. Re-running or retrying a pipeline job does not double-charge Anthropic / OpenAI -- each job runs inside `step.run()` boundaries with an explicit `idempotencyKey`
  5. `hooks/use-job-status.ts` distinguishes "still processing", "failed with reason", and "config unavailable" without throwing on any non-200 response

**Plans**: 2 plans

  - [x] 91-01-PLAN.md — Graceful job-status contract + hook rewrite + failure UI (REC-01/02/05)
  - [x] 91-02-PLAN.md — Attempt-lineage + idempotency hardening; no double-charge on Retry (REC-03/04)

**UI hint**: yes

### Phase 92: Pipeline Event Persistence

**Goal**: Every step of every recording-to-estimate attempt is durably recorded in a new, service-role-only events store so operators can later reconstruct exactly what happened -- which step broke, why, for whom, and how long it took -- without touching the database or losing the existing activity feed.
**Depends on**: Phase 91 (the reliability fix defines the attempt-id lineage and graceful statuses the event store records)
**Requirements**: EVENT-01, EVENT-02, EVENT-03, EVENT-04
**Success Criteria** (what must be TRUE):

  1. A new events table persists per-attempt, per-step records (attempt id, project/estimate/user/company id, input type, step, status, error message, error/HTTP code, provider, duration, retry count, timestamps) with deny-all RLS to the client, service-role writes, and super-admin read only
  2. Backend instrumentation writes an event at each pipeline step transition (save recording, transcribe, analyze, generate estimate, preview redirect), capturing both success and failure with timing
  3. All input types are captured (recording / photo / manual text); a retry increments `retry_count` and links back to its originating attempt id
  4. The existing single `recording_added` write to `estimate_activity` still fires unchanged -- the new events store is additive, with no regression to the current activity feed

**Plans**: 4 plans

  - [x] 92-00-PLAN.md — Wave 0: 5 RED Nyquist test stubs + pipeline_events migration (applied to remote) + types block
  - [x] 92-01-PLAN.md — Wave 1: best-effort recordPipelineEvent() helper (insert + swallow + retry_count)
  - [ ] 92-02-PLAN.md — Wave 2: attemptId+inputType lineage threading (payloads + 3 entrypoints + 3 routes)
  - [x] 92-03-PLAN.md — Wave 3: instrument 6 step boundaries + preview_redirect marker + EVENT-04 regression + phase gate

### Phase 93: Super Admin Event Log

**Goal**: A Super Admin can diagnose any recording failure in seconds from a Generations-style event log -- finding the attempt, seeing which step broke and why, across users and companies -- without ever exposing raw sensitive provider payloads.
**Depends on**: Phase 92 (the events store and instrumentation must exist before the admin UI can read them)
**Requirements**: ADMINLOG-01, ADMINLOG-02, ADMINLOG-03, ADMINLOG-04, ADMINLOG-05
**Success Criteria** (what must be TRUE):

  1. A Super Admin sees a recent-attempts list with Generations-style columns (timestamp, user/company, project/estimate, input type, step reached, status, duration), newest first and paginated
  2. The admin can search attempts by user, project, estimate, attempt id, and error text
  3. The admin can filter by status (success/failure/in-progress), input type, and step; success/failure counts are displayed; a manual refresh control is present
  4. Opening an attempt renders a step timeline showing each step's timestamp, status, message, error code, safe metadata, and duration
  5. No raw sensitive provider payloads (audio bytes, full transcripts, API keys) are rendered anywhere in the admin UI -- only safe, summarized metadata

**Plans**: 4 plans
Plans:

- [x] 93-00-PLAN.md — Wave 0: 6 RED Nyquist test stubs (all ADMINLOG requirements)
- [x] 93-01-PLAN.md — pipeline_attempts view DDL + apply script + database types extension
- [x] 93-02-PLAN.md — events-helpers.ts (buildSearchOr/terminalStatus/formatDuration/SAFE_EVENT_COLUMNS) + EventsControls client + admin nav item
- [x] 93-03-PLAN.md — list page (events/page.tsx) + EventStepTimeline component + detail page ([attemptId]/page.tsx)

**UI hint**: yes

### v4.3 Unified Agentic Estimate Engine (Phases 94-97)

> **Numbering:** continues from v4.2's last phase (93). The global phase counter is NOT reset; v4.3 starts at **Phase 94**.

> **Milestone goal:** Unify estimate creation across web UI, MCP, and WhatsApp under ONE shared, channel-neutral LangGraph engine driven by a `ChannelAdapter`, and bring the quality-assessment + auto-refine intelligence (today WhatsApp-only) to web and MCP — closing the silent-zero-estimate gap.

> **Locked decisions (scope guardrails for planning):** Inngest owns durability — NO LangGraph checkpointer. Auto-refine is hard-capped at 1 iteration. Web's decoupled upload-time ingestion is preserved (graph enters at `generate`). Only the `StepRunner` contract + scaffold ships (DURABLE-01/02); the FULL durability granularity refactor is OUT OF SCOPE / deferred. Intent-router unification is OUT OF SCOPE.

> **Keystone insight:** extraction must be behavior-preserving FIRST (WhatsApp tests stay green), THEN migrate web/MCP as a no-op, THEN add new intelligence, THEN observe — so the mechanical refactor and the product change are isolated and independently bisectable.

- [x] **Phase 94: Extract Canonical Graph Behind WhatsApp (behavior-preserving) + StepRunner Seam** — Lift the WhatsApp-only StateGraph into a shared, channel-neutral `lib/estimate/graph/` core (`ingest → generate → assess → refine/ask → finalize`) driven by a `ChannelAdapter`, with the deterministic `isVagueEstimate` gate extracted, the never-throw/failure-as-state invariant preserved, the `StepRunner` contract injected, and the checkpoint-granularity decision captured — WhatsApp behavior unchanged, its tests stay green (ENGINE-01..04, CHAN-01, DURABLE-01, DURABLE-02, QA-01)
 (completed 2026-06-20)

- [x] **Phase 95: Migrate Web + MCP onto the Shared Graph (generate-only passthrough)** — Repoint the web `generate-estimate` Inngest job to invoke the shared graph via the default adapter (`ingest` = passthrough guard, `assess`/`refine`/`finalize` = no-op finalize); MCP inherits via the same event. Output is byte-equivalent to today across all three channels; the non-vague web happy path stays at exactly 1 AI call and writes no `whatsapp_*` rows (CHAN-02, CHAN-03, CHAN-04, QA-03)
 (completed 2026-06-20)

- [x] **Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing** — Turn on the default adapter's real `assess` + one automatic self-refine (cap = 1) before a typed `needs_details` verdict; web persists `awaiting_details` (non-blocking UI prompt, no `interrupt()`), MCP returns a structured status (no elicitation), WhatsApp's inline ask-details is now driven by the shared verdict; multi-tenant isolation re-verified across the shared nodes + any refine tool (SMART-01..05, QA-02)
 (completed 2026-06-20)

- [x] **Phase 97: Unified Observability — Langfuse v5 + Sentry Coexistence** — One unified Langfuse trace per estimate run via a single `CallbackHandler` at `graph.invoke` (channels distinguished by metadata/tags), migrated to the Langfuse v5 OTel SDK coexisting with Sentry on a shared tracer provider, exposing per-channel AI call-count and latency (OBS-01, OBS-02, OBS-03)
 (completed 2026-06-20)

### Phase 94: Extract Canonical Graph Behind WhatsApp (behavior-preserving) + StepRunner Seam

**Goal**: The estimate orchestration logic today exclusive to WhatsApp lives in a shared, channel-neutral domain graph (`lib/estimate/graph/`) consumed through a `ChannelAdapter`, built from day one with the durability `StepRunner` seam and the never-throw invariant — and WhatsApp, the only channel using it so far, behaves exactly as before with its full test suite green. This is the riskiest mechanical change done behind the richest test coverage, with zero behavior change and zero web/MCP impact.
**Depends on**: Phase 93 (last shipped phase; no functional dependency)
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, CHAN-01, DURABLE-01, DURABLE-02, QA-01
**Success Criteria** (what must be TRUE):

  1. A shared `lib/estimate/graph/` module defines the canonical `generate → assess → decide` nodes with channel-neutral state (carrying `companyId`, `projectId`, `channel`, `prompts?`, `isVague`, `failure?`, `refineAttempts` — and NO `ownerPhone`, `WhatsAppMessage`, or `whatsapp_*` field); a static check confirms the shared core has zero WhatsApp imports
  2. A `ChannelAdapter` closure-factory (`buildEstimateGraph(adapter)`) lets a channel plug only its edge behaviors (`ingest`, `refine`/`finalize`, `onError`); the WhatsApp adapter supplies media fan-out + conversational reply/session by importing existing `lib/whatsapp/*` primitives, leaving the core untouched
  3. The deterministic `isVagueEstimate` gate is extracted to `lib/estimate/quality/vagueness.ts` and reused verbatim as the always-on, zero-cost (no-LLM) check; the shared graph never throws — nodes signal failure via the `failure?` state channel and the adapter maps the terminal failure to the channel's reply/cleanup
  4. WhatsApp's inbound-estimate flow runs entirely on the shared graph (`whatsapp-process.ts` repointed to the new module + `channel:'whatsapp'`) with its behavior preserved exactly; the frozen never-throw / always-reply regression test stays green — the owner still gets a reply on every failure path
  5. A `StepRunner` abstraction is defined and injected into the engine (default `passthroughRunner`) so AI-heavy nodes CAN later be promoted to their own durable Inngest `step.run` without coupling the core to Inngest, and a decision artifact captures the graph↔Inngest checkpoint-granularity contract (Inngest is the sole durability layer; no LangGraph checkpointer; cross-message wait stays in `whatsapp_sessions`/events; when to decompose + retry-cost trade-offs)

**Plans**: 4 plans
Plans:

- [x] 94-01-PLAN.md — Wave 0: DURABLE-02 decision artifact + 7 failing test stubs (the behavior-preserving safety net)
- [x] 94-02-PLAN.md — Extract channel-neutral core: vagueness gate + EstimateState + ChannelAdapter/StepRunner contracts + generate/assess/decide nodes + buildEstimateGraph factory
- [x] 94-03-PLAN.md — WhatsApp ChannelAdapter (ingest/finalize/onError) + default.ts stub; rewire estimate-graph.ts + repoint whatsapp-process.ts
- [x] 94-04-PLAN.md — Repoint source-text anchor test paths + full-suite green gate + D-13 behavior-preserving audit

### Phase 95: Migrate Web + MCP onto the Shared Graph (generate-only passthrough)

**Goal**: The web `generate-estimate` Inngest job and MCP `create_estimate` both flow through the same shared graph as today's single-shot path — producing byte-equivalent output with no behavior change yet — proving the shared engine works for web/MCP before any intelligence is switched on. Web's decoupled upload-time ingestion is preserved; the graph enters at `generate` via a passthrough `ingest` guard.
**Depends on**: Phase 94 (the shared graph + default-adapter seam must exist)
**Requirements**: CHAN-02, CHAN-03, CHAN-04, QA-03
**Success Criteria** (what must be TRUE):

  1. The web `generate-estimate` Inngest job invokes the shared graph through the default adapter; the default `ingest` is a passthrough guard (transcripts/photo descriptions already persisted by the decoupled `transcribe-audio`/`analyze-photos` jobs), and `assess`/`refine`/`finalize` behave as a no-op finalize so output is identical to today
  2. MCP `create_estimate` inherits the shared graph for free via the existing `EVENT_ESTIMATE_GENERATE` dispatch — no new dispatch contract, still `job_id` + poll — and produces the same result it does today
  3. Behavior parity is verified: all three channels (web, MCP, WhatsApp) produce equivalent estimate output for equivalent inputs through the single engine, and no channel regresses (existing per-channel test suites stay green)
  4. The non-vague web fast path makes exactly 1 AI call per generation (no surprise extra AI calls), and a web/MCP run writes no `whatsapp_*` rows and triggers no conversational reply — confirmed by test

**Plans**: TBD

### Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing

**Goal**: Web and MCP gain the quality intelligence WhatsApp already has — the engine assesses every estimate, makes one automatic self-refine attempt when it detects a vague/low-quality result, and if still vague ends at a typed `needs_details` verdict surfaced in a channel-appropriate way (never a 500). This is the milestone's headline: closing the silent-zero-estimate gap on web/MCP, with multi-tenant isolation preserved across the now-shared nodes.
**Depends on**: Phase 95 (web/MCP must already flow through the shared graph as no-op before behavior is flipped on)
**Requirements**: SMART-01, SMART-02, SMART-03, SMART-04, SMART-05, QA-02
**Success Criteria** (what must be TRUE):

  1. When the engine detects a vague/low-quality estimate, it makes exactly ONE automatic self-refine attempt (re-prompt to be more specific) before involving the human — the loop is hard-capped at 1 iteration; if still vague, the run ends at a typed `needs_details` verdict, never a 500/throw, and quota is charged only for a delivered estimate (not per internal attempt)
  2. Web surfaces `needs_details` as a persisted project-level `awaiting_details` state that prompts the user in the UI to add detail and regenerate — non-blocking, no `interrupt()`, no job hang
  3. MCP surfaces `needs_details` as a structured status in the job result (compatible with the existing `job_id` + poll contract, no elicitation) that the calling LLM can act on
  4. WhatsApp's existing inline ask-details behavior is preserved unchanged, now driven by the same shared quality verdict
  5. Multi-tenant isolation is preserved: `companyId` stays a trusted closure/param across every shared node and any new refine tool — no LLM-suppliable tenant field — verified by extending the existing `query-tools` "no tenant input" test to cover the refine surface, and every shared-core query stays company-scoped

**Plans**: 2 plans
Plans:

- [x] 96-01-PLAN.md — Wave 1: RED test stubs (auto-refine-isolation.test.ts + graph-neutrality extension)
- [x] 96-02-PLAN.md — Wave 2: Production code (revert.ts + state needsDetails + auto-refine.ts + decide.ts + index.ts + default.ts)

### Phase 97: Unified Observability — Langfuse v5 + Sentry Coexistence

**Goal**: Every estimate run on every channel emits one unified Langfuse trace via a single `CallbackHandler` attached at `graph.invoke`, with channels distinguished by metadata/tags, so per-channel AI call-count and latency are visible — the metric foundation that will later justify the deferred durability refactor. Langfuse is migrated to the v5 OTel SDK and coexists with Sentry's OTel without colliding on the global tracer provider.
**Depends on**: Phase 96 (behavior is now uniform across channels, so there is something uniform to observe)
**Requirements**: OBS-01, OBS-02, OBS-03
**Success Criteria** (what must be TRUE):

  1. All three channels emit a unified Langfuse trace per estimate run via a single `CallbackHandler` attached once at `graph.invoke`; web/MCP/WhatsApp runs are distinguishable by `metadata`/`tags` on the trace
  2. Langfuse is migrated to the v5 OTel SDK (`@langfuse/langchain` + `@langfuse/otel` + `@langfuse/tracing`, replacing the LangChain-v1-incompatible `langfuse@3.38.20`) and coexists with `@sentry/nextjs` OTel on a shared tracer provider without collision (Sentry set to `skipOpenTelemetrySetup: true`, both processors on one `NodeTracerProvider` in `instrumentation.ts`)
  3. Per-channel AI call-count and latency (p95) per estimate are visible in the traces — and the deterministic vagueness gate is confirmed still in place so the web non-vague happy-path call count stays pinned at 1; no Langfuse keys/host or transcript/audio/key tokens are committed (env-var only, safe-metadata rule from v4.2)

**Plans**: TBD

### v4.4 WhatsApp Notifications (Phase 98)

### Phase 98: WhatsApp Template Notifications — Owner Alerts via Approved HSM Templates

> **SUPERSEDED by Phase 104** (owner-facing WhatsApp notifications + in-app template builder built in 104). Do not run; revive only if a distinct customer-facing scope is ever needed. Phase 104 delivered the `sendWhatsAppTemplate` client, the dispatch WhatsApp branch + event→template registry, opt-in preferences UI, AND the super-admin in-app template builder (104.3) Phase 98 had deferred. Phase 98 artifacts are left untouched as historical reference only.

**Goal**: The profile-settings promise "Used for account recovery and WhatsApp notifications" becomes true. The business owner actually receives WhatsApp messages for key estimate events (e.g. viewed / approved / paid), sent as Meta-approved **message templates (HSM)** so delivery works *outside* the 24-hour customer-service window. WhatsApp becomes a first-class, opt-in channel in the existing `notify()` notifications pipeline. Reuses Xtimator's own WABA (already configured; `wabaId` currently unused). `xphere` (`C:\Dev\xphere`) is the read-only reference implementation we port the send shape from — NOT a runtime dependency. Templates are authored manually in Meta WhatsApp Manager for the MVP; an in-app builder is deferred.
**Depends on**: Phase 40 (WhatsApp client + `getWhatsAppPlatformConfig`), Phase 77 (notifications system + `notify()` dispatch), Phase 70 (estimate payment/activity events that trigger alerts)
**Requirements**: WANOTIF-01, WANOTIF-02, WANOTIF-03, WANOTIF-04, WANOTIF-05
**Success Criteria** (what must be TRUE):

  1. `lib/whatsapp/client.ts` exports `sendWhatsAppTemplate(to, { name, languageCode, bodyVariables?, headerVariables? })` that POSTs a `type: 'template'` message to `/{phoneNumberId}/messages` using the existing platform config — `components` are built from the variable arrays exactly as xphere does, and the function follows the same throw-on-non-2xx convention as `sendWhatsAppMessage`
  2. `lib/notifications/dispatch.ts` accepts a `whatsapp` channel on `NotifyParams.channels`; when enabled it resolves the owner's E.164 phone (`company_whatsapp.owner_phone`, falling back to `auth.users.user_metadata.phone`) and sends a mapped approved template — driven by a small explicit `EventType → { templateName, languageCode, variables }` registry (NOT auto-enabled for every event)
  3. WhatsApp sends are opt-in via notification preferences and dispatched asynchronously (queued via Inngest, mirroring the email branch) so a slow Meta call never blocks the request path; a WhatsApp send failure is best-effort and never breaks the triggering business operation (same contract as in-app/email)
  4. The profile-settings help text and the notification-preferences UI accurately reflect reality — the owner can toggle WhatsApp notifications on/off, and the label no longer promises an unbacked feature
  5. Unit tests cover the `sendWhatsAppTemplate` payload (correct `type: 'template'`, components from variable arrays, language code) mirroring `tests/unit/whatsapp/client.test.ts`, plus a dispatch test asserting the `whatsapp` channel resolves the owner phone and calls the template sender, and that preference-off / missing-phone are no-ops; `npx vitest run` stays green

**Plans**: TBD (needs `/gsd:plan-phase 98` once GSD tooling is installed, or manual plan authoring)
**Prerequisite (manual, outside code)**: Author the MVP notification template(s) in Meta WhatsApp Manager under Xtimator's existing WABA (category UTILITY for fastest approval), submit for approval, and record the approved `name` + `language` for the event→template registry. Nothing sends until Meta marks the template APPROVED.
**Deferred (Phase 4 of the plan)**: in-app template builder + Meta approval-status webhook sync (port `C:\Dev\xphere\src\lib\whatsapp\cloud\templates.ts` + `template-composer-dialog.tsx`; handle `message_template_status_update` in `app/api/webhooks/whatsapp/route.ts`). This is where the unused `wabaId` would finally be consumed.
**Full approved analysis/plan**: `C:\Users\Leila\.claude\plans\analyze-deeply-the-part-sunny-pearl.md` (mirrored into this phase's CONTEXT doc).

### Phase 1000: Xphere CRM Sync

**Goal**: Every Xtimator company is mirrored into the Xphere "Xtimator" org as an Account + Contact + Opportunity by POSTing the FIXED webhook contract to the already-built Xphere receiver `POST {XPHERE_BASE_URL}/api/xtimator/webhook` (Bearer XPHERE_API_KEY), dispatched via Inngest for retries + non-blocking UX. Stage mapping, custom_fields snapshot, and reliability rules honor 1000-CONTEXT.md verbatim (incl. the em-dash stage literals "Active — Pro" / "Active — Business").
**Depends on**: Phase 999
**Requirements**: XPHERE-B1, XPHERE-B2, XPHERE-B3-MAP, XPHERE-B3-CLIENT, XPHERE-B4, XPHERE-B5, XPHERE-B6, XPHERE-B7
**Plans**: 5 plans
Plans:

- [x] 1000-01-PLAN.md — Wave 1: companies migration (xphere_* columns) + pure mapping/types (buildSyncPayload, stage literals)
- [x] 1000-02-PLAN.md — Wave 1: credentials (getXphereConfig + 'xphere' provider) + admin CRM config section
- [x] 1000-03-PLAN.md — Wave 2: Xphere HTTP client (syncCompany) + Inngest event + xphereSyncJob + serve registration
- [ ] 1000-04-PLAN.md — Wave 3: lifecycle hooks (company/estimate/subscription/trial) via fire-and-forget dispatchXphereSync
- [ ] 1000-05-PLAN.md — Wave 3: admin batched backfill route + xphere_sync_error observability panel

### v4.5.1 Notification Channels & Preferences (Phase 104)

> **Numbering:** continues the GLOBAL phase counter. v4.5 ended at Phase 103; v4.4's WhatsApp Notifications is Phase 98. v4.6 = **Phase 104**.

- [x] **Phase 104: Notification Channels & Preferences Revamp** — Restructure owner notification preferences to a 3-category × 4-channel matrix (Estimates · Billing · System) and add WhatsApp + SMS as real delivery channels (NOTIF-01..07)
 (completed 2026-06-22)

#### Phase 104: Notification Channels & Preferences Revamp

**Goal**: The owner notification preferences become a tidy 3-category model (Estimates, Billing, System) delivered over 4 working channels (In-App, Email, WhatsApp, SMS), replacing today's noisy 8-category × 2-channel matrix.
**Depends on**: Phase 77 (notification system: schema, dispatch, in-app/email senders, preferences UI)
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-06, NOTIF-07
**Success Criteria** (what must be TRUE):

  1. The preferences page shows exactly 3 categories (Estimates, Billing, System) — Payments/Trial/Quota/Admin merged into Billing; WhatsApp and AI Jobs categories removed
  2. Each category is toggleable across 4 channels (In-App, Email, WhatsApp, SMS); enabling a WhatsApp/SMS channel actually delivers via that channel
  3. WhatsApp owner notifications send via the WhatsApp client (approved template for out-of-session); SMS owner notifications send via Twilio
  4. The owner's phone number is collected + validated with explicit per-channel opt-in before any WhatsApp/SMS send
  5. Existing preferences + the event→category mapping migrate cleanly (payment/trial/quota/admin → billing; removed-category events handled per the documented decision); dispatch routes each event to its category and delivers only via enabled channels, never throwing on an unconfigured channel

**Plans**: 4 plans (3 waves + Wave-0 scaffold)

- [x] 104-00-PLAN.md — Wave 0: RED/EXTEND test scaffold (6 new + 3 extended gaps)
- [x] 104-01-PLAN.md — Wave 1: schema + 3 categories + `_dropped` sentinel + 4-channel matrix UI + idempotent remap migration (NOTIF-01, NOTIF-02, NOTIF-06)
- [x] 104-02-PLAN.md — Wave 2: `sendSms()` + WhatsApp/SMS dispatch branches + owner-phone resolver + per-channel opt-in/consent (NOTIF-03, NOTIF-04, NOTIF-05, NOTIF-07)
- [x] 104-03-PLAN.md — Wave 3: super-admin WhatsApp-template panel + `message_template_status_update` webhook + Phase-98 superseded note (NOTIF-03)

> **Open product decisions for discuss-phase:** phone-number source & validation (profile field vs onboarding), SMS opt-in/consent flow + Twilio cost acceptance, WhatsApp template approval, and the fate of removed-category events (AI Jobs job-failure notices, inbound-WhatsApp notices) — re-route to a kept category, keep in-app-only, or drop. RESOLVED in 104-CONTEXT: reuse `owner_phone` (gate on non-null, no OTP re-add); explicit per-channel opt-in with paid-SMS consent; templates via super-admin panel; removed-category events → `_dropped` sentinel (no delivery).

### Phase 1001: SEO Foundation and Organic Acquisition Readiness

**Goal:** Raise Xtimator's production SEO readiness from the audited 4.5/10 baseline to at least 8.5/10 by making every intended public page crawlable, canonical, semantically described, fast, measurable, and supported by useful industry-specific content—without exposing private application, estimate, auth, admin, or demo surfaces to search engines.
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, SEO-06
**Depends on:** Phase 1000
**Success Criteria** (what must be TRUE):

  1. Production serves valid `/robots.txt` and `/sitemap.xml`; the sitemap contains only canonical public URLs and all private/auth/admin/demo/share routes emit `noindex, nofollow` or are excluded by an explicit route policy.
  2. Every indexable page has a unique title, description, self-referencing canonical, `og:url`, `og:type`, Twitter card metadata, and a valid social image with dimensions and alt text; `fb:app_id` is emitted only when a real Facebook App ID is configured.
  3. The homepage and public content expose valid JSON-LD for `Organization`, `WebSite`, and `SoftwareApplication`; blog posts expose `Article` and breadcrumbs, with automated schema validation tests.
  4. Xtimator ships a high-quality, internally linked content architecture: a metadata-complete blog index/post system plus a curated first set of substantial industry landing pages, avoiding templated thin-content multiplication.
  5. The anonymous homepage no longer becomes `private, no-store` solely to render auth-aware navigation; production Lighthouse SEO is at least 95 and mobile performance/accessibility remain at least 85 on the homepage and one representative content page.
  6. A documented launch checklist covers Search Console ownership, sitemap submission, URL inspection, Meta Sharing Debugger, Bing Webmaster Tools, baseline queries, and a 30/60/90-day measurement loop; automated tests fail when crawlability, metadata, schema, or route-indexing policy regresses.

**Plans:** 4/4 plans complete

Plans:

**Wave 1**

- [x] 1001-01-PLAN.md — establish canonical URL helpers, robots/sitemap routes, explicit index/noindex boundaries, and crawlability regression tests (SEO-01, SEO-02)
- [x] 1001-02-PLAN.md — complete Open Graph/Twitter metadata and add validated Organization/WebSite/SoftwareApplication/Article/Breadcrumb JSON-LD (SEO-02, SEO-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 1001-03-PLAN.md — build the curated industry landing-page architecture, unique blog metadata, internal linking, and content quality gates (SEO-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 1001-04-PLAN.md — restore cacheability for anonymous acquisition pages and add Lighthouse, production smoke, Search Console, and social-debugger verification gates (SEO-05, SEO-06)

---

## 🚧 v4.6 Pricing Intelligence — Researched Pricing Agent (Phases 105-109)

**Milestone Goal:** When an estimate line item has no price-book match, a dedicated agent researches the average regional market price (client's city + state) and writes it with `price_source: 'researched'` — instead of the AI guessing a price that can come out $0 and trip the "too vague" gate. Delivers Pillar 2 (researched pricing) on top of Pillar 1 (price-book priority via `anchorAndClampSections`).

> **Numbering:** continues the GLOBAL phase counter. v4.5 ended at Phase 103; the notifications tranche (relabeled v4.5.1) is Phase 104. **v4.6 Pricing Intelligence starts at Phase 105.** Do NOT reset to 1.
>
> **Coverage:** 17/17 v4.6 requirements mapped (RPRICE-01..04, RSRC-01..04, RFALL-01..04, RMETER-01..03, RCACHE-01..02). No orphans.
>
> **Locked scope guardrails (do NOT plan against):** Inngest is the sole durability layer (NO LangGraph checkpointer); the estimate graph stays channel-neutral (the `ENGINE-01` static gate); reuse the existing count-based quota (`usage_events` / `checkQuota` / `recordUsage`) — no new credit/billing subsystem; OpenRouter is the primary provider (engine `exa` default, Anthropic web search a gated quality fallback); no source-citation / range / confidence UI this milestone (deferred); region granularity = city + state; markup/margin deferred to admin config.

### Phases

- [x] **Phase 105: `price_source: 'researched'` Threading** — Plumb the new `'researched'` enum value through schema/types/DB CHECK/editor badge; ships dormant (no behavior change), unblocks everything
 (completed 2026-06-24)

- [x] **Phase 106: Cache Table + Tenant-Scoped Cache Module** — `price_research_cache` table (company-scoped, deny-all RLS, 30d TTL) + canonical-key cache module; parallelizable with 105
- [x] **Phase 107: Provider Seam + First Source + Determinism Seam** — `PriceResearchProvider` port + OpenRouter-web adapter + Anthropic quality-fallback adapter + deterministic fixture adapter for CI + prompt-injection hardening (completed 2026-06-24)
- [x] **Phase 108: Orchestrator + Service Integration (the payoff)** — `researchUnmatchedPrices` wired into `generateEstimateForProject` after anchoring; precedence + evidence-gated tagging + no-$0 fallback ladder + vagueness-gate fix + "Couch cleaning 8seats" regression fixture + quota metering (completed 2026-06-24)
- [x] **Phase 109: Durability + Cost-Control Hardening** — per-estimate research item CAP (env-overridable, logged drops) + gated OpenRouter-web→Anthropic-web provider fallback ordering + in-run memo (refine-loop double-pay guard); `step.run('price-research')` retry isolation documented-as-deferred (inline call already non-fatal). Carried 108 render-path `price_source` build-fix landed in 109-01. (completed 2026-06-24)

### Phase Details — v4.6 Pricing Intelligence

### Phase 105: `price_source: 'researched'` Threading

**Goal**: The estimate stack understands a third price provenance — `researched` — end to end (output schema, types, DB constraint, persistence, editor badge), shipped with zero runtime behavior change because nothing tags an item `researched` yet. This is the dormant foundation that unblocks the real research wiring.
**Depends on**: Nothing (first phase of the milestone; parallelizable with Phase 106)
**Requirements**: RPRICE-02, RPRICE-03 (type/schema parts only — full precedence enforcement lands in 108)
**Success Criteria** (what must be TRUE):

  1. An `estimate_items` row can be persisted with `price_source = 'researched'` and loads/renders without error; the DB CHECK constraint accepts exactly `price_book | ai_estimate | researched` and rejects anything else
  2. The AI output schema (`lib/ai/schema.ts`, relaxing the D-15 preprocess) and `LineItemOutput` type (`lib/ai/types.ts`) accept `'researched'`; `price-anchoring.ts` is type-widened only so a price-book match still wins (precedence preserved at the type layer)
  3. The estimate editor (`item-row.tsx` + `item-card-mobile.tsx`) renders a distinct "Researched" badge as a third variant alongside "Price book" and "AI estimate"; editing an item still clears `price_source` to null (the existing `Edited` rule already covers it — confirmed, not re-implemented)
  4. The full unit/eval suite stays green with no item ever tagged `researched` yet (badge dormant) — proving the threading is additive and behavior-preserving

**Plans**: 2 plans (1 wave — parallel, disjoint files)
Plans:

- [x] 105-01-PLAN.md — DB CHECK widen migration + AI schema/types/anchoring type-widen for `'researched'` (RPRICE-02, RPRICE-03)
- [x] 105-02-PLAN.md — Dormant "Researched" editor badge (item-row + item-card-mobile) + editor `price_source` union widen (RPRICE-02, RPRICE-03)

**UI hint**: yes

### Phase 106: Cache Table + Tenant-Scoped Cache Module

**Goal**: A tenant-scoped, TTL-bounded cache for researched market prices exists and is unit-tested in isolation, so that once research is wired (Phase 108) a repeat lookup of the same service in the same region is free and never re-consumes the research allowance. The cache value is a neutral market datum — no company/client/margin data — so it can never leak across tenants.
**Depends on**: Nothing (parallelizable with Phase 105)
**Requirements**: RCACHE-01, RCACHE-02
**Success Criteria** (what must be TRUE):

  1. A `price_research_cache` table exists keyed by `(company_id, normalized_name, region, currency_code)` with an `expires_at` column and deny-all client RLS (service-role-only, mirroring the `pipeline_events` posture) — no normal Supabase client can read or write it
  2. The cache module (`cache.ts` + `normalize.ts`) exposes get/put where a put stamps `expires_at = now + 30d` and a get treats `expires_at < now` as a miss; the region normalizer canonicalizes "city|state" and the name normalizer reuses `normalizeNameForMatch` so "couch cleaning 8 seats" and "sofa cleaning, 8-seat" share an entry and quantity never leaks into the key
  3. A static leakage test asserts the cache value type carries no `company_id`/client/margin/job-text field — only `{ unit_price, currency, source, confidence?, expires_at }` (the neutral-datum discipline)
  4. A cache hit returns the stored price without any provider call (verified in a unit test with a stubbed provider that must NOT be invoked on a hit)

**Plans**: 2 plans

- [x] 106-01-PLAN.md — price_research_cache migration (RLS deny-all, zero policies) + normalize.ts (region + name key reusing normalizeNameForMatch)
- [x] 106-02-PLAN.md — cache.ts get/put (neutral datum, 30d TTL, expired=miss, service-role) + leakage/HIT-no-provider/TTL/normalization tests + static migration contract

### Phase 107: Provider Seam + First Source + Determinism Seam

**Goal**: The pricing-research source lives behind a swappable `PriceResearchProvider` port resolved from `platform_integrations`, with a real OpenRouter-web adapter (engine `exa`), a gated Anthropic quality-fallback adapter, AND a deterministic fixture adapter that the v4.5 eval harness injects — so the CI regression gate stays green and the source decision can flip via admin config without touching call sites. Every web snippet that reaches the LLM is injection-hardened in the same phase that introduces web content.
**Depends on**: Nothing for the interface; admin wiring reuses the existing `integrations-providers.ts` pattern. (Joins with 105 + 106 at Phase 108.)
**Requirements**: RSRC-01, RSRC-02, RSRC-03, RSRC-04, RFALL-04
**Success Criteria** (what must be TRUE):

  1. `getPriceResearchProvider()` reads the active source from `platform_integrations` and returns a `PriceResearchProvider` with a batched `lookup(items, region, currency)` contract — or `null` when unconfigured (so enrichment becomes a safe no-op), mirroring `getAIProviderWithFallback`
  2. The OpenRouter-web adapter runs price research as a SEPARATE OpenRouter call ahead of the unchanged forced `create_estimate` call, with the search engine configurable between `exa` (fixed cost) and `native`; the Anthropic web-search adapter (with `user_location` city/state) is wired as a pluggable, gated, non-default quality fallback
  3. A deterministic fixture adapter + golden `(service, region) → candidates` fixtures + a fixed clock drive the source in tests/CI with zero live network calls — the v4.5 eval harness + CI regression gate run green against it
  4. The adapter is evidence-gated by contract: it returns a price as researchable ONLY when a real `source_url` + snippet is present, so a citation-less guess can never be surfaced as `researched`
  5. Web-search content is sanitized through `sanitizeField` and wrapped in a `<search_result>` tag enumerated in the `buildSystemPrompt` `## Security` block before entering any prompt; a static test asserts research prompts are built through the hardened boundary, not an ad-hoc path

**Plans**: 3 plans in 2 waves
Plans:

- [x] 107-01-PLAN.md — Port + zod schema + evidence-gated isUsableCandidate + injection hardening (export sanitizeField, &lt;search_result&gt; in ## Security, buildResearchSearchPrompt) [Wave 1]
- [x] 107-02-PLAN.md — OpenRouter-web adapter (separate openrouter:web_search call, engine exa default/native configurable) + gated Anthropic-web adapter (user_location) [Wave 2]
- [x] 107-03-PLAN.md — Deterministic fixture adapter + golden (service,region)->candidates fixtures + fixed clock + gated eval source test (zero live network) [Wave 2]

### Phase 108: Orchestrator + Service Integration (the payoff)

**Goal**: The bug is actually fixed. `researchUnmatchedPrices` is wired into `generateEstimateForProject` immediately after `anchorAndClampSections` and before totals/persistence, so the vagueness gate sees real numbers. Research runs only on no-match items, never overrides a price-book item or an owner edit, is evidence-gated, is metered through the existing quota, and degrades to a non-zero `ai_estimate` (never $0) on any failure. The originating "Couch cleaning 8seats" case now produces a non-zero, non-vague estimate.
**Depends on**: Phase 105 (the `researched` enum/badge), Phase 106 (cache), Phase 107 (provider seam + fixtures)
**Requirements**: RPRICE-01, RPRICE-03, RPRICE-04, RFALL-01, RFALL-02, RFALL-03, RMETER-01, RMETER-02, RMETER-03
**Success Criteria** (what must be TRUE):

  1. For an estimate with a line item that has no price-book match, the system performs a regional lookup using the client's city + state and writes a non-zero researched price tagged `researched`, while price-book items are untouched and any owner-edited item is never re-researched (precedence `price_book > researched > ai_estimate` enforced by running only over the post-anchor `ai_estimate` set)
  2. An item is tagged `researched` ONLY when the lookup returned real evidence (source URL + snippet); without evidence the item falls back to a non-zero `ai_estimate` — never to a fake `researched` and never to $0
  3. No fallback rung is ever $0 (research → non-zero `ai_estimate` → flagged unpriced item routed to the existing `awaiting_details` path); the vagueness gate now distinguishes a fully empty estimate (block → needs-details) from a single flagged unpriced item (allow → estimate proceeds)
  4. The "Couch cleaning 8seats" regression fixture — including the empty-research-response variant — produces a non-zero, non-vague estimate, asserted in the eval harness
  5. Each research search is metered through `usage_events` / `recordUsage` via a new count-based `price_researched` event type (1 unit/search, idempotent), each tier has a monthly research allowance in `entitlements`, and when a company is over allowance `checkQuota` skips research and items fall back to a non-zero `ai_estimate` — the estimate still generates and never hard-fails; a cache hit consumes no allowance

**Plans**: 5 plans in 4 waves
Plans:

- [x] 108-01-PLAN.md — Metering primitives: usage_events CHECK widen migration + price_researched EventType/QUOTA mapping + maxPriceResearchPerMonth entitlement + checkQuota research gating (RMETER-01, RMETER-02, RMETER-03) [Wave 1] ✅ 2026-06-24
- [x] 108-02-PLAN.md — Vagueness-gate refinement: isVagueEstimate distinguishes empty/all-$0 (block) from a partially-priced estimate with a flagged unpriced line (allow) (RFALL-02) [Wave 1] ✅ 2026-06-24
- [x] 108-03-PLAN.md — Orchestrator researchUnmatchedPrices: never-throws, precedence (ai_estimate-only), cache→quota-gated batched provider→evidence-gated re-tag→metering→never-$0 ladder (RPRICE-01, RPRICE-03, RPRICE-04, RFALL-01) [Wave 2]
- [x] 108-04-PLAN.md — Integrate into generateEstimateForProject after anchoring/before totals; researched prices flow into totals; flaggedUnpriced→awaiting_details (RPRICE-01, RPRICE-03, RFALL-01) [Wave 3] ✅ 2026-06-24
- [x] 108-05-PLAN.md — Eval regression: "Couch cleaning 8seats" full-graph case non-zero/non-vague incl. empty-research variant; all-empty still blocks; zero live network (RFALL-03) [Wave 4]

### Phase 109: Durability + Cost-Control Hardening

**Goal**: Once a real source's latency and cost are observable, harden the research path: give it its own Inngest `step.run` so a research-source timeout retries in isolation without re-charging the already-paid generate call, add provider fallback ordering (OpenRouter-web → Anthropic quality fallback) mirroring the AI fallback, cap items researched per estimate, and memoize research across the auto-refine loop so a refine pass never re-pays for the same lookups. Kept minimal/foldable if Phase 108 already covers a given concern.
**Depends on**: Phase 108 (research is wired and its real latency/cost can be measured)
**Requirements**: (hardening of RMETER-01..03 + the durability/cost-control concerns surfaced in research; no net-new requirement — every RMETER requirement is satisfied in 108, this phase isolates and bounds them)
**Success Criteria** (what must be TRUE):

  1. Price research runs in its own `step.run('price-research')` via a real `StepRunner` threaded from `generate-estimate.ts`, so a research-source failure retries the research unit alone and never re-invokes the already-succeeded LLM generate step
  2. When the primary source (OpenRouter-web) fails or returns no evidence, the gated Anthropic quality-fallback source is attempted before degrading to `ai_estimate`, mirroring the existing AI provider-fallback ordering
  3. A per-estimate item cap bounds how many unmatched items are researched in one estimate (the rest degrade to non-zero `ai_estimate`), and research is memoized per `(item, region)` within a run so an auto-refine pass (Phase 96) does not re-pay for the same lookups
  4. The whole feature remains non-fatal: every hardening path preserves the never-throw contract — a slow/failed/capped research step never blocks or fails the estimate

**Plans**: 2 plans (1 wave — parallel, disjoint file sets)
Plans:

- [x] 109-01-PLAN.md — Widen the document/PDF/share/query/refine `price_source` unions to include `researched` (the carried 108 build-fix; `next build` type-checks clean)
- [x] 109-02-PLAN.md — Orchestrator hardening: per-estimate research item CAP (env-overridable, logged drops) + gated OpenRouter-web→Anthropic-web fallback ordering + in-run memo; step.run isolation documented-as-deferred

## 🚧 v4.7 Monetização — Credit-Based Billing + Estimate Payment Fee (Phases 110-116)

**Milestone Goal:** Transform billing from count-based tiers into a credit model with built-in margin — a monthly subscription grants AI credits consumed as `real OpenRouter/Whisper cost × markup` — and add a 1% platform application fee on estimate payments. Every billing parameter is super-admin-configurable via a new `billing_config` (no hard-coded numbers, no env vars). Stripe is the payment RAIL only; the credit ledger is OURS. Calibrate real cost in production BEFORE charging.

> **Numbering:** continues the GLOBAL phase counter. v4.6 ended at Phase 109. **v4.7 starts at Phase 110.** Do NOT reset to 1.
>
> **Coverage:** 28/28 v4.7 requirements mapped (COST-01..03, CREDIT-01..07, BILLCFG-01..03, TOPUP-01..03, FEE-01..04, PAYGATE-01..02, DISCLOSE-01, CREDITUI-01..02, CALIB-01..02, MIG-01). No orphans.
>
> **Locked scope guardrails (do NOT plan against):** Stripe is the rail only — the credit ledger is OURS, NOT Stripe metered billing (Stripe Connect infra already shipped phases 55/58/70/94). Everything billing reads from the runtime-encrypted `billing_config` (extends the `ai_config`/`platform_integrations` pattern) — no hard-coded billing numbers, no env vars, super-admin only (tenant has no access). Migrations idempotent + deploy via CI→GHCR→Coolify (never build on the VPS). Channel-neutral domain stays neutral; never-throw enrichment patterns preserved. "Calibrate before charging" — real billing must NOT be enabled before CALIB-02's measured numbers exist; cost capture runs measure-only (billing OFF) first. The estimate payment fee (FEE/PAYGATE/DISCLOSE) is independent of the credit work and can sequence in parallel.

### Phases

- [x] **Phase 110: Real Cost Capture Foundation + Measure-Only Mode** — Capture real USD cost per OpenRouter call + computed Whisper cost; correlate to `usage_events`/`pipeline_events`; runs measure-only (no charging) so production cost is collected before billing exists. The foundation that gates the entire ledger.
 (completed 2026-06-24)

- [x] **Phase 111: `billing_config` Store + Super-Admin Billing Panel** — A `billing_config` section in the encrypted runtime-config store + a super-admin "Billing" panel editing markup, denomination, per-tier grant, prices, top-up packs, Whisper rate, fee %, thresholds — applied at runtime, tenant has no access. Every downstream phase reads from it. **2 plans (2 waves).**
 (completed 2026-06-24)

- [x] **Phase 112: Credit Ledger + Consumption Metering** — Append-only tenant-scoped `credit_ledger` (grant/debit/topup/adjust) with fast-read cached balance; each instrumented `usage_events` op debits `real_cost × markup`; per-tier `monthlyCreditGrant`; idempotent debits; pre-op balance check with top-up path; zero-debit for non-spend ops (MCP conversation). (completed 2026-06-24)
- [x] **Phase 113: Stripe Rail — Grants, Top-Ups + Parallel-Run Transition** — `invoice.paid` grants the tier allowance idempotently; one-time top-up checkout credits the ledger; low/zero balance offers top-up + upgrade without silent mid-job block; credits run in parallel with count-based tiers so no existing account breaks (counts degrade to secondary guard-rails). (completed 2026-06-24)
- [x] **Phase 114: Estimate Payment Fee + Payment-UI Gating + Disclosure** — Fill the omitted `application_fee_amount` hook on both the invoice and Phase-70 checkout paths (fee % from `billing_config`, sane minimum/rounding); a single `usePaymentsEnabled` guard gates ALL payment UI to `stripe_connect_status = 'active'` (no orphan elements, both states tested); clear fee disclosure at the Stripe connection flow.
 (completed 2026-06-24)

- [x] **Phase 115: Credit Balance UX (owner-facing)** — Owner sees a simple credit balance (header/settings) with consumption history and rough per-action guidance (never token math); low/zero-balance states show a warning + top-up/upgrade CTA reusing the existing threshold-notification path.
 (completed 2026-06-24)

- [x] **Phase 116: Calibration & Charge-On Validation** — Derive grant/markup/price from the measured real cost collected since Phase 110 and validate the margin invariant (real cost of the full monthly grant ≤ ~30% of subscription price), documented. This LATE phase consumes CALIB-01's data + the ledger/config and gates turning real charging ON.
 (completed 2026-06-24)

### Phase Details — v4.7 Monetização

### Phase 110: Real Cost Capture Foundation + Measure-Only Mode

**Goal**: The system records the real USD cost of every AI operation — OpenRouter calls (read directly from the `usage.cost` field OpenRouter now returns automatically on every chat-completion response; no request flag, no second API call) and computed Whisper/STT cost (audio minutes × a module-const rate) — persisted in a new append-only `ai_cost_events` table correlated by the existing `attempt_id` lineage, and it runs in measure-only mode (no charging, no ledger, no debit) so weeks of real per-operation cost are collected in production before any billing logic is enabled. This is the prerequisite for the entire credit ledger: nothing can debit credits without it.
**Depends on**: Nothing (first phase of the milestone; the foundation everything else builds on)
**Requirements**: COST-01, COST-02, COST-03, CALIB-01
**Success Criteria** (what must be TRUE):

  1. Every OpenRouter AI call (estimate generation, photo analysis via OpenRouter, translation) records its real USD cost — read directly from the response `usage.cost` field (returned automatically; absent → recorded as null, never 0) — where today only tokens are captured for Langfuse
  2. Whisper/STT cost is computed from audio minutes × a rate read from config (the provider does not return a cost), and is recorded alongside the OpenRouter costs through the same path
  3. Real cost per AI operation is persisted and correlated to the existing `usage_events` / `pipeline_events` attempt instrumentation, so cost can be queried per operation type (estimate / photo_batch / audio_minutes / price_research) for calibration analysis
  4. Cost capture runs in measure-only mode — instrumented and recording, with zero charging or credit movement — so an operator can collect real production cost before any billing is switched on, and an operator-observable record of accumulated per-operation cost exists

**Plans**: 3 plans (2 waves)

- [x] 110-01-PLAN.md — ai_cost_events migration + never-throw recordAICost() helper + measure-only invariant (COST-03, CALIB-01)
- [x] 110-02-PLAN.md — OpenRouter usage.cost capture (estimate adapter + vision + translation) + costContext threading (COST-01)
- [x] 110-03-PLAN.md — computed Whisper cost (minutes × rate) wired into the transcribe job (COST-02)

### Phase 111: `billing_config` Store + Super-Admin Billing Panel

**Goal**: All billing parameters live in a new `billing_config` section of the encrypted runtime-config store (extending the `ai_config` / `platform_integrations` / `getIntegrationKey` pattern), and a super-admin "Billing" panel edits every knob at runtime without a deploy. Nothing billing-related is ever hard-coded or read from an env var, and the business owner (tenant) has no access to these controls. Every downstream billing phase reads its numbers from here.
**Depends on**: Nothing structurally (reuses the existing encrypted config + `integrations-providers.ts` admin pattern); sequenced before the ledger so markup/grant/fee reads have a source
**Requirements**: BILLCFG-01, BILLCFG-02, BILLCFG-03
**Success Criteria** (what must be TRUE):

  1. A `billing_config` section exists in the encrypted runtime-config store holding all billing parameters (markup multiplier, credit denomination, per-tier monthly grant, subscription prices, top-up packs, Whisper rate, fee %, low-balance thresholds) — no hard-coded values and no env vars anywhere in the billing code paths
  2. A super-admin can open a "Billing" panel, change any of those parameters, save, and the new value takes effect at runtime on the next operation with no redeploy
  3. The business owner (tenant) has no route to and no UI for these controls — the panel is super-admin-gated exactly like the existing `/admin/integrations` surfaces
  4. The billing logic helpers (`recordAICost` / `checkCredits` / grant / fee computation) read every parameter from `billing_config` at call time rather than from a constant or env var, verified by a static test asserting no hard-coded billing numbers in those paths

**Plans:** 6 plans
Plans:
- [x] 163-01-PLAN.md — Wave 0 test scaffolding (7 test files) unblocking RED->GREEN cycles for SENDHUB-01..06
- [x] 163-02-PLAN.md — Dormant-first migration widening estimate_deliveries (format column + channel/provider CHECK) (SENDHUB-03)
- [x] 163-03-PLAN.md — Resolver rollout across 6 renderers (classic/modern PDF + modern share + plain-text + WhatsApp) + close estimate-document.tsx:1602 sections gap (SENDHUB-04, SENDHUB-05)
- [x] 163-04-PLAN.md — SendHubDialog UI (3 format cards + Mark as Sent footer + LanguageFlagChip) + estimate-tab.tsx import swap (SENDHUB-01, SENDHUB-06)
- [x] 163-05-PLAN.md — Delivery-route + WhatsApp fallback + markAsSentAction/logDeliveryAction + SendHubDialog placeholder->real wiring (SENDHUB-02, SENDHUB-03)
- [x] 163-06-PLAN.md — Deletion sweep of retired channel-first surfaces (send-dialog, send-form, send-actions-menu, send-tab, estimate-preview) (SENDHUB-01)
**UI hint**: yes

### Phase 112: Credit Ledger + Consumption Metering

**Goal**: A tenant-scoped append-only `credit_ledger` records every credit movement, and each AI operation already instrumented in `usage_events` debits `real_cost × markup` credits (markup read from `billing_config`). A company's balance is derivable from the ledger via a fast-read cached path; debits are idempotent; a pre-operation balance check surfaces a top-up path rather than hard-failing mid-flow; and operations where we spend no AI budget (MCP external-assistant conversation) never debit. This is the metering core that maps onto the cost capture from Phase 110.
**Depends on**: Phase 110 (real cost capture — the debit basis), Phase 111 (`billing_config` — markup/grant/denomination source)
**Requirements**: CREDIT-01, CREDIT-02, CREDIT-03, CREDIT-04, CREDIT-05, CREDIT-06, CREDIT-07
**Success Criteria** (what must be TRUE):

  1. A tenant-scoped append-only `credit_ledger` table records every credit movement (grant / debit / topup / adjust) with the real cost, the markup applied, and the resulting balance, with RLS isolating each company's rows
  2. Each AI operation already instrumented in `usage_events` (`estimate`, `photo_batch`, `audio_minutes`, `price_research`) debits credits computed as `real_cost × markup`, with markup and denomination read from `billing_config`
  3. A company's current credit balance is derivable from the ledger via a fast-read cached balance that reconciles exactly to the sum of ledger deltas, and each tier grants a configurable `monthlyCreditGrant` on entitlements
  4. Credit debits are idempotent (reusing the existing `recordUsage` idempotency key) so a retried operation never double-charges; before an AI operation the system checks balance and an insufficient balance surfaces a top-up path rather than hard-failing mid-flow where avoidable
  5. Operations that do not spend our AI budget never debit — an MCP external-assistant conversation (which runs on the user's assistant, not our AI) and an absorbed lightweight web-chat conversation produce zero ledger movement — because metering happens at the point of real spend

**Plans**: 4 plans (3 waves)

- [x] 112-01-PLAN.md — credit_ledger migration (tenant-readable RLS) + companies.credit_balance column + static contract test [Wave 1]
- [x] 112-02-PLAN.md — billing_config enforcementEnabled flag (default false) + entitlements monthlyCreditGrant on 4 tiers [Wave 1]
- [x] 112-03-PLAN.md — lib/billing/credit-ledger.ts: recordCreditDebit / grantCredits / checkCredits / reconcileBalance (never-throw, idempotent, config-driven) [Wave 2]
- [x] 112-04-PLAN.md — wire the debit into generate-estimate / analyze-photos / transcribe-audio / price-research orchestrator [Wave 3]

### Phase 113: Stripe Rail — Grants, Top-Ups + Parallel-Run Transition

**Goal**: Stripe is wired as the payment rail for the credit model: a paid subscription invoice grants the tier's monthly credit allowance to the ledger idempotently, a one-time top-up checkout credits the ledger, low/zero balance offers a top-up (and an upgrade suggestion when the usage pattern justifies it) without silently blocking a job mid-flow, and the whole credit model runs in parallel with the existing count-based tiers so no existing account breaks during the transition.
**Depends on**: Phase 112 (the ledger must exist to grant/credit into)
**Requirements**: TOPUP-01, TOPUP-02, TOPUP-03, MIG-01
**Success Criteria** (what must be TRUE):

  1. On `invoice.paid` for a subscription, the system grants the tier's configured monthly credit allowance to the company's ledger, idempotently via the existing `stripe_processed_events` (a redelivered webhook never double-grants)
  2. A company can buy a one-time credit top-up pack via Stripe checkout, and the paid webhook credits the corresponding pack's credits to the ledger
  3. When credits run low or hit zero, the company is offered a top-up (and an upgrade suggestion when the usage pattern justifies it) and generation is not silently blocked mid-job
  4. Credits run in parallel with the existing count-based tiers during the transition — no existing account breaks, and the count-based limits continue to function as secondary guard-rails rather than being removed

**Plans**: 3 plans in `.planning/phases/113-stripe-rail-grants-top-ups-parallel-run-transition/`
Plans:

- [x] 113-01-PLAN.md — Wave 0 RED tests: invoice.paid grant + checkout top-up arm (webhook), top-up route, overage affordance + MIG-01 guard
- [x] 113-02-PLAN.md — Webhook wiring: invoice.paid grants tier allowance (TOPUP-01) + checkout.session.completed top-up arm before the subscription early-break (TOPUP-02)
- [x] 113-03-PLAN.md — create-topup-session route (TOPUP-02) + buildOverageAffordance + enriched 402 (TOPUP-03), count path untouched (MIG-01)

### Phase 114: Estimate Payment Fee + Payment-UI Gating + Disclosure

**Goal**: Xtimator earns a 1% platform application fee on every estimate payment via `application_fee_amount` on the Direct Charge (owner stays merchant of record; Xtimator never custodies funds), on both the Phase-94 invoice path and the Phase-70 checkout path, with the percentage read from `billing_config`. A single `usePaymentsEnabled` guard gates ALL payment UI so nothing payment-related renders unless Stripe Connect is `active`, and the connection flow clearly discloses the fee. This block is cohesive and independent of the credit work.
**Depends on**: Phase 111 (`billing_config.estimate_fee_pct`); reuses the already-shipped Stripe Connect infra (phases 70/94)
**Requirements**: FEE-01, FEE-02, FEE-03, FEE-04, PAYGATE-01, PAYGATE-02, DISCLOSE-01
**Success Criteria** (what must be TRUE):

  1. The Stripe Connect invoice path (`lib/billing/invoice-service.ts`, the deliberately omitted hook at line 17) and the Phase-70 estimate checkout path (`payment_intent_data.application_fee_amount`) both charge a platform application fee routed to the Xtimator platform account
  2. The fee percentage is read from `billing_config` (default 1%, never hard-coded) and is computed on the amount actually charged (deposit or full total) with a sane minimum/rounding so Stripe never receives an invalid (e.g. $0) fee
  3. A single `usePaymentsEnabled` guard gates every payment page, screen, button, and element so they render only when the company's Stripe Connect status is `active`; with Stripe disconnected, no payment-related element appears anywhere (no orphan) and the product otherwise works fully — both states covered by tests
  4. The Stripe connection flow shows a clear disclosure that Xtimator charges the platform fee (e.g. 1%), separate from Stripe's own fees, with the live percentage read from `billing_config` so the disclosed number never diverges from the charged number

**Plans**: 3 plans (2 waves)

- [x] 114-01-PLAN.md — application_fee_amount on the Connect invoice path + computeApplicationFee helper + fee read from billing_config (FEE-01..04)
- [x] 114-02-PLAN.md — single paymentsEnabled(company) predicate + gate the Generate-invoice affordance, no orphan when disconnected (PAYGATE-01, PAYGATE-02)
- [x] 114-03-PLAN.md — config-driven fee disclosure in the not_connected Connect card (live estimateFeePct × 100) (DISCLOSE-01)

**UI hint**: yes

### Phase 115: Credit Balance UX (owner-facing)

**Goal**: The business owner sees their credit balance in a simple, owner-friendly way — a balance widget in the header/settings, a consumption history, and rough per-action guidance ("an estimate ≈ 10-15 credits") — never raw token math. Low-balance and zero-balance states surface a warning and a top-up/upgrade CTA, reusing the existing threshold-notification path.
**Depends on**: Phase 112 (the ledger + balance read), Phase 113 (top-up path the CTA links to)
**Requirements**: CREDITUI-01, CREDITUI-02
**Success Criteria** (what must be TRUE):

  1. The business owner sees a simple credit balance (in the header and/or settings) showing the current balance plus a consumption history of recent debits, with rough per-action guidance — and never any token-level math
  2. A low-balance state shows a warning, and a zero-balance state shows a warning plus a clear top-up/upgrade CTA, reusing the existing threshold-notification path (`notifyQuotaThresholds`) rather than a new one
  3. The balance shown to the owner reconciles to the ledger (matches the Phase-112 cached balance), so the number the owner sees is the number the system meters against

**Plans**: 2 plans in `.planning/phases/115-credit-balance-ux-owner-facing/`
Plans:

- [x] 115-01-PLAN.md — owner-safe credit overview query (getCreditOverview, no real_cost_usd/markup in SELECT) + notifyLowCreditBalance hook in recordCreditDebit (CREDITUI-01, CREDITUI-02)
- [x] 115-02-PLAN.md — CreditBalanceCard + history list + TopUpButton + topbar credit chip on /settings/billing (CREDITUI-01, CREDITUI-02)

**UI hint**: yes

### Phase 116: Calibration & Charge-On Validation

**Goal**: Using the real per-operation cost collected in production since Phase 110, derive the grant, markup, and price for each tier from measured data (not guesses) and validate the margin invariant — the real OpenRouter/Whisper cost of a full monthly grant is ≤ ~30% of the subscription price — documenting the chosen numbers. This LATE phase consumes CALIB-01's measured data plus the Phase-111 config and Phase-112 ledger, and gates the decision to turn real charging ON.
**Depends on**: Phase 110 (CALIB-01 measured cost data), Phase 111 (`billing_config` to write the calibrated numbers into), Phase 112 (the ledger the numbers govern)
**Requirements**: CALIB-02
**Success Criteria** (what must be TRUE):

  1. Grant, markup, and subscription price for each tier are derived from the measured real per-operation cost collected since Phase 110 — not from the illustrative seed numbers
  2. The margin invariant is validated and documented: the real cost of a full monthly grant is ≤ ~30% of that tier's subscription price, so a power-user at 100% grant usage still profits and a typical user is near-pure margin
  3. The calibrated numbers are written into `billing_config` and the decision to enable real charging is explicitly gated on this validation existing — no real billing is switched on before the measured numbers and the documented invariant exist

**Plans**: 2 plans (2 waves)

- [x] 116-01-PLAN.md — pure calibration core: validateMarginInvariant (correct-FAIL trap) + recommendFromAggregate + aggregateAiCostByOperation over ai_cost_events (CALIB-02)
- [x] 116-02-PLAN.md — charge-on gate in saveBillingConfig (the CALIB-02 wiring proof) + analyze-ai-cost.mjs ops script + CALIBRATION-RUNBOOK (CALIB-02)

## Phases — v4.8 Industry Knowledge Base

- [x] **Phase 117: Knowledge Schema + pgvector + Dual RLS** - Enable pgvector and ship the `knowledge_entries` table with both RLS postures: industry entries neutral/shared (service-role-write, read scoped by industry, mirroring `price_research_cache`) and company-overlay entries tenant-scoped (`company_members` membership). The retrieval foundation — nothing embeds or retrieves without it. (completed 2026-06-24)
- [x] **Phase 118: Channel-Neutral `lib/knowledge/` Module — embed + retrieve + answer + injection-hardening + fixture** - The neutral domain module: `embed()`, `retrieve()` merging industry KB + company overlay over pgvector, `answer()` RAG with `sanitizeField` + `<knowledge>` injection-hardening, and a deterministic fixture adapter for CI. Imports no channel; never-throws.
 (completed 2026-06-24)

- [x] **Phase 119: Super-Admin Industry KB Curation + Bulk Import** - The super-admin panel CRUD that POPULATES the industry KB scoped by industry, (re)generating embeddings on save, plus a markdown/CSV bulk import to seed an industry in one operation.
 (completed 2026-06-24)

- [x] **Phase 120: Company KB Overlay (tenant settings)** - The company owner's OWN settings panel (distinct from super-admin — the two-panel rule) to add/edit/delete private overlay entries, embeddings generated the same way, scoped to the owning company; optional.
 (completed 2026-06-25)

- [x] **Phase 121: WhatsApp KNOWLEDGE Intent** - The 5th `classifyAndRoute` intent + QUERY-vs-KNOWLEDGE disambiguation (safe CREATE default preserved), dispatching to `lib/knowledge/answer` scoped by the company's `industries[]` + overlay and delivered via the existing chunked owner reply. The consumer that proves the module end-to-end.
 (completed 2026-06-25)

### Phase Details — v4.8 Industry Knowledge Base

### Phase 117: Knowledge Schema + pgvector + Dual RLS

**Goal**: The database can store and vector-search curated knowledge — pgvector is enabled, a `knowledge_entries` table exists with a similarity index, and the two RLS postures are live: industry entries are a neutral platform asset (service-role-write, read scoped by industry, mirroring `price_research_cache`) while company-overlay entries are tenant-scoped by `company_members` membership. This is the foundation; nothing in the module embeds or retrieves without it.
**Depends on**: Phase 106 (the `price_research_cache` neutral/service-role RLS posture this mirrors), v4.0 multi-tenancy (`company_members` membership for the overlay RLS)
**Requirements**: KB-01, KB-02, KB-03
**Success Criteria** (what must be TRUE):

  1. The pgvector extension is enabled and a `knowledge_entries` table exists (scope `'industry'|'company'`, nullable `industry_id`, nullable `company_id`, `title`, `body`, `source`, `embedding` vector, `created_at`, `updated_at`) with a vector similarity index — applied via an idempotent, authored-only migration deployed CI→GHCR→Coolify (never built on the VPS)
  2. An industry entry can be written only by the service role and is readable by any tenant whose `companies.industries[]` includes that industry; no tenant can INSERT/UPDATE/DELETE an industry entry (verified — the neutral/shared posture mirrors `price_research_cache`)
  3. A company-overlay entry can be read and written only by members of the owning company (`company_members` membership), and is invisible to every other tenant — proving the overlay is private while the industry KB is shared

**Plans**: 1 plan

Plans:

- [x] 117-01-PLAN.md — pgvector + knowledge_entries table (scope CHECK, vector(1536), HNSW cosine index) + dual RLS (industry service-role-write/read-to-all; company overlay via company_members) + static contract test

### Phase 118: Channel-Neutral `lib/knowledge/` Module — embed + retrieve + answer + injection-hardening + fixture

**Goal**: A channel-neutral `lib/knowledge/` domain module can embed text, retrieve the most similar passages by merging a company's industry KB(s) with its own overlay, and compose a short injection-hardened RAG answer — all without importing any channel, never throwing, and with a deterministic fixture adapter so CI/eval runs with zero live network. This is the core capability every consumer (WhatsApp now; web chat + MCP later) calls.
**Depends on**: Phase 117 (the `knowledge_entries` table + pgvector + dual RLS the module reads), Phase 107 (the `sanitizeField` + `<search_result>` injection-hardening pattern this mirrors for `<knowledge>`; the fixture-provider determinism pattern)
**Requirements**: KMOD-01, KMOD-02, KMOD-03, KMOD-04, KSEC-01
**Success Criteria** (what must be TRUE):

  1. `embed(text)` produces a vector via the configured provider (model-agnostic via the platform-config pattern, reusing `getIntegrationKey`) — the same function curation and overlay use to (re)generate embeddings
  2. `retrieve(question, { industries, companyId, k })` returns passages ranked by pgvector similarity that MERGE the company's industry KB(s) with its own company overlay; the module imports no channel (`lib/knowledge/` has zero `lib/whatsapp/*` imports) and never throws on failure (returns empty, logs)
  3. `answer(question, ctx)` composes a RAG prompt from the retrieved passages and returns a short conversational answer; every retrieved passage is run through `sanitizeField` and wrapped in a `<knowledge>` tag enumerated in the prompt-builder Security block — a static test asserts knowledge prompts are built through this hardened boundary, not ad-hoc concatenation (KSEC-01)
  4. A deterministic fixture adapter lets the CI/eval harness exercise `retrieve`/`answer` with zero live network (mirroring the price-research fixture provider), keeping the eval suite green and reproducible

**Plans**: 3 plans (3 waves)

Plans:

- [x] 118-01-PLAN.md — Foundations: KnowledgeProvider port + types, embed(text) (KMOD-01), match_knowledge_entries RPC migration, + all Wave-0 test stubs
- [x] 118-02-PLAN.md — retrieve() over the RPC merging industry KB + overlay, never-throws (KMOD-02) + deterministic fixture provider (KMOD-04) + channel-neutrality gate
- [x] 118-03-PLAN.md — answer() RAG via OpenRouter chat, never-throws (KMOD-03) + <knowledge> injection-hardening in the prompt-builder Security block (KSEC-01)

### Phase 119: Super-Admin Industry KB Curation + Bulk Import

**Goal**: A super-admin can populate and maintain the industry knowledge base from the super-admin panel — create, edit, and delete entries scoped to an industry, with each save (re)generating the entry's embedding, plus a one-shot markdown/CSV bulk import to seed an entire industry's KB at once. This is what makes the industry KB a real platform asset; curate once per industry, serve every tenant in it.
**Depends on**: Phase 117 (the `knowledge_entries` table + industry RLS), Phase 118 (`embed()` to generate embeddings on save)
**Requirements**: KCUR-01, KCUR-02, KCUR-03
**Success Criteria** (what must be TRUE):

  1. A super-admin can create, edit, and delete industry KB entries scoped to a chosen industry from the super-admin panel; the owner has no access to this surface
  2. Saving or editing an entry (re)generates and persists its embedding via the Phase-118 `embed()` so the new/edited content is immediately retrievable
  3. A super-admin can bulk-import entries from a markdown or CSV file to seed an industry's KB in a single operation, each imported entry getting its embedding generated

**Plans**: 3 plans

- [x] 119-01-PLAN.md — Curation actions (create/edit/delete) + embed-then-insert + embedMany helper (KCUR-01, KCUR-02) [Wave 1]
- [x] 119-02-PLAN.md — CSV parser + bulkImportEntries batch-embed + bulk-insert (KCUR-03) [Wave 2]
- [x] 119-03-PLAN.md — Super-admin /admin/knowledge UI (list, form, import card, nav) (KCUR-01, KCUR-03) [Wave 3]

**UI hint**: yes

### Phase 120: Company KB Overlay (tenant settings)

**Goal**: A company owner can add their own private knowledge entries ("our specific process") from the company's OWN settings panel — a surface DISTINCT from the super-admin industry-curation panel (the two-panel rule) — with embeddings generated the same way and scoped to the owning company. The overlay is optional: a company with none simply uses only the industry KB.
**Depends on**: Phase 117 (the company-scoped overlay RLS), Phase 118 (`embed()` to generate embeddings), Phase 119 (the curation surface pattern the overlay panel mirrors at tenant scope)
**Requirements**: KOVL-01, KOVL-02
**Success Criteria** (what must be TRUE):

  1. A company owner can add, edit, and delete private KB entries in the company's OWN settings panel — a surface distinct from the super-admin panel — and a company that creates no overlay entries still gets answers from the industry KB alone (the overlay is optional)
  2. Each overlay entry generates and persists an embedding the same way as industry curation, scoped to the owning company so it merges into that company's retrieval but never leaks to another tenant

**Plans**: 2 plans

- [x] 120-01-PLAN.md — Tenant overlay actions + schema + Wave-0 test (createCompanyEntry/updateCompanyEntry/deleteCompanyEntry; authed client, scope=company, embed-then-insert)
- [x] 120-02-PLAN.md — /settings/knowledge tenant UI sub-route (list + new + edit + delete) + settings-nav entry

**UI hint**: yes

### Phase 121: WhatsApp KNOWLEDGE Intent

**Goal**: WhatsApp gains a 5th KNOWLEDGE intent — the owner can ask a trade how-to question over WhatsApp and get a conversational answer drawn from the industry KB + their overlay. `classifyAndRoute` learns to disambiguate QUERY (the company's own records) from KNOWLEDGE (generic trade how-to) while keeping the safe CREATE default for unrecognized input, and a KNOWLEDGE message dispatches to `lib/knowledge/answer` scoped by the resolved company's `industries[]` + overlay, delivered via the existing chunked owner reply path. This is the consumer that proves the neutral module end-to-end.
**Depends on**: Phase 118 (the `lib/knowledge/answer` the dispatcher calls), Phase 117 (the populated KB to answer from), the existing WhatsApp `classifyAndRoute` + `sendOwnerReplyChunks` harness
**Requirements**: WAKB-01, WAKB-02
**Success Criteria** (what must be TRUE):

  1. `classifyAndRoute` recognizes a 5th KNOWLEDGE intent with a QUERY-vs-KNOWLEDGE disambiguation rule (QUERY = the company's own estimates/clients/projects; KNOWLEDGE = trade how-to/process), and an unrecognized message still falls back to the safe CREATE default (never a privileged action)
  2. A KNOWLEDGE message dispatches to `lib/knowledge/answer` scoped by the resolved company's `industries[]` plus its overlay, and the resulting answer is delivered to the owner through the existing chunked owner reply path (`sendOwnerReplyChunks`)

**Plans**: 1 plan

- [x] 121-01-PLAN.md - KNOWLEDGE intent (union/parseIntent/classify prompt) + dispatchKnowledge scoped by industries[]

## Phases — v4.9 Internal Web Chat Assistant

- [x] **Phase 122: Channel-Neutral Domain Extraction + WhatsApp Parity** - Pull `createEstimate` / `queryCompanyData` / `askKnowledge` / multimodal `normalize` out of `lib/whatsapp/` into neutral domain tools that WhatsApp KEEPS calling — a NON-DESTRUCTIVE refactor proven by WhatsApp behavioral-parity tests. The load-bearing foundation; nothing in the chat works until these neutral tools exist. (completed 2026-06-25)
- [x] **Phase 123: Chat Persistence Schema + History** - `chat_conversations` + `chat_messages` tables (tenant-scoped RLS mirroring `whatsapp_inbox`, idempotent + authored-only migration) plus the persist/reload path so a returning owner sees their chat history.
 (completed 2026-06-25)

- [x] **Phase 124: AI SDK + /api/chat Tool-Calling Backend (slots + credit reuse)** - Add the Vercel AI SDK (`ai` + `@ai-sdk/*`); an `/api/chat` `streamText` + native tool-calling route exposing the neutral tools, resolving the model via `ai_config` slots through an OpenRouter-compatible provider; estimate generation invoked as a tool over the unchanged LangGraph engine (async Inngest job); heavy ops debit credits by reusing the neutral functions.
 (completed 2026-06-25)

- [x] **Phase 125: Chat UI — useChat + Sidebar + Multimodal + Estimate Card** - The `useChat` streaming surface with per-tool-call progress, a conversation sidebar (new/switch + history load), multimodal input (text/audio/photo) routed through the extracted `normalize`, and an inline estimate card that opens in the existing editor.
 (completed 2026-06-25)

- [x] **Phase 126: Access/Entitlement Gate + Owner-Only Verification** - The chat is gated owner-only (authenticated, tenant-scoped) and by tier entitlement (Pro/Business), audited so it is never reachable by an end customer.
 (completed 2026-06-25)

### Phase Details — v4.9 Internal Web Chat Assistant

### Phase 122: Channel-Neutral Domain Extraction + WhatsApp Parity

**Goal**: The estimate-generation, company-data-query, knowledge, and multimodal-ingestion capabilities live as channel-neutral domain tools (`createEstimate`, `queryCompanyData`, `askKnowledge`, `normalize`) that import NO channel — and WhatsApp now calls those extracted tools with byte-identical behavior, proven by behavioral-parity tests. This is the load-bearing foundation of the whole milestone: it makes channel-neutrality real instead of aspirational, and nothing in the chat can work until these tools exist. The refactor is NON-DESTRUCTIVE — WhatsApp is rewired to the new tools, never forked.
**Depends on**: v4.8 Phase 118 (`lib/knowledge/answer` the `askKnowledge` tool wraps), v4.3 Phase 94 (`generateEstimateForProject` shared engine + `makeQueryTools`/adapter pattern the neutral tools mirror), the existing `lib/whatsapp/{normalize,query-tools,handler}` harness being extracted
**Requirements**: NEUT-01, NEUT-02, NEUT-03, NEUT-04, NEUT-05
**Success Criteria** (what must be TRUE):

  1. A neutral `createEstimate` tool exists that runs `generateEstimateForProject` with no channel-specific logic, and the WhatsApp CREATE path calls it (no duplicated generation logic remains in `lib/whatsapp/`)
  2. A neutral `queryCompanyData` tool (extracted from `lib/whatsapp/query-tools`) returns the same tenant-scoped results the WhatsApp QUERY path returned, and WhatsApp now calls the neutral tool
  3. A neutral multimodal `normalize` module (audio→transcript, photo→analysis) is extracted from `lib/whatsapp/normalize` and the WhatsApp inbound path consumes it with identical transcription/analysis output
  4. A neutral `askKnowledge` tool wraps `lib/knowledge/answer` scoped by the company's `industries[]` + overlay, and WhatsApp's KNOWLEDGE intent calls it — the same KB answer as v4.8
  5. The neutral modules import no channel (a grep gate proves zero `lib/whatsapp/*` imports in the neutral path), and WhatsApp behavioral-parity tests pass: same estimate, same query result, same knowledge answer, no regression

**Plans**: 3 plans in `.planning/phases/122-channel-neutral-domain-extraction/`
Plans:

- [x] 122-01-PLAN.md — Wave 0 RED test scaffolds: neutrality gate (lib/agent-tools/) + 4 capability RED tests (createEstimate/queryCompanyData/normalizeInput/askKnowledge) (NEUT-01..05)
- [x] 122-02-PLAN.md — Extract neutral query-company-data data-reads + normalizeInput (wraps ingestMultimodal); re-point WhatsApp query-tools/normalize/intent-router (NEUT-02, NEUT-03, NEUT-05)
- [x] 122-03-PLAN.md — Neutral createEstimate (EVENT_ESTIMATE_GENERATE dispatch) + askKnowledge (wraps lib/knowledge/answer); re-point dispatchKnowledge; full WhatsApp parity gate (NEUT-01, NEUT-04, NEUT-05)

### Phase 123: Chat Persistence Schema + History

**Goal**: The chat has durable, tenant-scoped storage — `chat_conversations` and `chat_messages` tables exist with RLS that mirrors `whatsapp_inbox` (a company's members read/write only their own conversations and messages), applied via an idempotent, authored-only migration deployed CI→GHCR→Coolify. Conversations and their messages persist and reload so a returning owner sees their history. This is the data backbone the UI persists into; it can be built in parallel with the AI SDK backend but is needed before any history renders.
**Depends on**: v4.0 multi-tenancy (`company_members` membership for the RLS posture), the existing `whatsapp_inbox` migration as the parity model
**Requirements**: CHATDB-01, CHATDB-02
**Success Criteria** (what must be TRUE):

  1. `chat_conversations` (id, company_id, user_id, title, created_at, updated_at) and `chat_messages` (id, conversation_id, role, parts jsonb, attachments jsonb, created_at) tables exist via an idempotent, authored-only migration (deployed CI→GHCR→Coolify, never built on the VPS)
  2. RLS is tenant-scoped: a company's members can read and write only their own company's conversations and messages; another tenant cannot see or modify them (mirrors `whatsapp_inbox`)
  3. A conversation and its messages persist across sessions — a returning owner re-opening the chat sees the saved conversation list and the full message history of a selected conversation

**Plans**: 2 plans (2 waves)

- [x] 123-01-PLAN.md — Migration + static contract test: chat_conversations + chat_messages, parts jsonb, denormalized company_id, company_members RLS owner-narrowed by user_id (CHATDB-01)
- [x] 123-02-PLAN.md — lib/queries/chat.ts helpers (list/get/create/append, service-client + getActiveCompanyId scoping, updated_at bump) + behavior test (CHATDB-02)

### Phase 124: AI SDK + /api/chat Tool-Calling Backend (slots + credit reuse)

**Goal**: The chat has a working streaming backend — the Vercel AI SDK is installed, an `/api/chat` route uses `streamText` + native tool-calling and exposes the Phase-122 neutral tools, the model is resolved from `ai_config` slots through an OpenRouter-compatible provider (never hard-coded), estimate generation is invoked as a tool that runs the unchanged `generateEstimateForProject` LangGraph engine as an async Inngest job returning a structured estimate (a tool-call boundary, NOT a streaming bridge — no LangChainAdapter in v1), and heavy operations debit credits by reusing the neutral functions that already debit per v4.7 (the lightweight conversation turn is absorbed). This is where the chat becomes capable; the UI in Phase 125 consumes it.
**Depends on**: Phase 122 (the neutral tools the route exposes), Phase 123 (the persistence the route reads/writes), v4.7 Phase 112 (the credit-debit seams the neutral functions already carry), the existing `ai_config` slot resolution + `getIntegrationKey('openrouter')`
**Requirements**: CHATBE-01, CHATBE-02, CHATBE-03, CHATMETER-01
**Success Criteria** (what must be TRUE):

  1. The Vercel AI SDK (`ai` + `@ai-sdk/*`) is added and the chat resolves its model via the `ai_config` slots (not hard-coded) through an OpenRouter-compatible provider
  2. `POST /api/chat` uses `streamText` + native tool-calling and exposes the neutral tools `createEstimate`, `queryCompanyData`, and `askKnowledge`; the model can chain them in one conversation
  3. The `createEstimate` tool runs the existing `generateEstimateForProject` engine as an async Inngest job and returns a structured estimate — the LangGraph engine is unchanged (a tool-call boundary, not a streaming bridge)
  4. Heavy chat operations (generation, transcription, photo analysis) debit credits via the v4.7 ledger exactly as the other channels do — by reusing the neutral functions that already debit — while the lightweight conversation turn is absorbed (zero credit)

**Plans**: 2 plans in 2 waves

- [x] 124-01-PLAN.md — Install AI SDK + OpenRouter provider; lib/chat/ provider + neutral-tool wrappers + system prompt (CHATBE-01/02/03)
- [x] 124-02-PLAN.md — POST /api/chat route (owner-auth → streamText(tools) → persist in onFinish) + static credit-reuse assertion (CHATBE-02, CHATMETER-01)

### Phase 125: Chat UI — useChat + Sidebar + Multimodal + Estimate Card

**Goal**: The owner has a rich chat surface inside the web app — a `useChat`-backed message stream that renders the assistant's tokens and each tool-call's progress ("generating estimate…", "looking up João's last quote…"), a conversation sidebar to start new and switch between prior conversations (loading the selected history from Phase 123), a multimodal input (text + audio + photo) routed through the extracted `normalize`, and an inline estimate card on generation completion with an action to open the result in the existing estimate editor. Built on the Vercel template's UX patterns (message-parts, tool-call rendering) ported onto our shadcn/Tailwind design system — not a raw template fork.
**Depends on**: Phase 124 (the `/api/chat` backend + tools `useChat` streams from), Phase 123 (the conversation/message history the sidebar loads), Phase 122 (the `normalize` the multimodal input routes through), the existing estimate editor the card opens into
**Requirements**: CHATUI-01, CHATUI-02, CHATUI-03, CHATUI-04
**Success Criteria** (what must be TRUE):

  1. A `useChat`-backed chat surface streams the assistant's tokens and renders each tool-call's live progress (e.g. "generating estimate…", "looking up João's last quote…")
  2. A conversation sidebar lists prior conversations with new-conversation and switch actions, and selecting a conversation loads its persisted message history
  3. The chat input accepts text, audio, and photo, all routed through the extracted neutral `normalize` (audio→transcript, photo→analysis) before generation
  4. When a generation tool completes, an inline estimate card renders in the conversation with an action that opens the estimate in the existing editor

**Plans**: 3 plans in 3 waves

- [x] 125-00-PLAN.md — Install @ai-sdk/react@6.0.209 + history mapper + normalizeChatInput action + Nyquist Wave-0 test scaffolds (CHATUI-01/02/03/04)
- [x] 125-01-PLAN.md — Route + sidebar + useChat thread + message-parts/tool-progress rendering (CHATUI-01, CHATUI-02)
- [x] 125-02-PLAN.md — Multimodal composer (audio/photo → normalize) + inline estimate card with open-in-editor (CHATUI-03, CHATUI-04)

**UI hint**: yes

### Phase 126: Access/Entitlement Gate + Owner-Only Verification

**Goal**: The chat is provably owner-only and tier-gated — reachable only by an authenticated, tenant-scoped owner whose company tier entitles the feature (a Pro/Business capability), and never reachable by an end customer. This is a thin verification/gating phase that closes the security fence around everything built in 122-125: the route, the UI surface, and the persistence are all behind the same authenticated owner + entitlement guard, audited so no customer-facing or cross-tenant path exists.
**Depends on**: Phase 124 (the `/api/chat` route gated here), Phase 125 (the chat UI surface gated here), v3.0/v4.7 entitlements (`lib/entitlements.ts` tier gating the feature reuses)
**Requirements**: CHATMETER-02
**Success Criteria** (what must be TRUE):

  1. The chat route and UI are reachable only by an authenticated, tenant-scoped owner (active-company resolved); an unauthenticated or cross-tenant request is rejected, and no customer-facing entry point exists
  2. The chat is gated by tier entitlement — a Pro/Business feature — so a Free/Trial company sees the feature gated (upgrade affordance) rather than a working chat, consistent with the existing entitlement pattern
  3. An audit confirms no path (route, persistence, or UI) lets an end customer reach the chat, and the owner-only + tenant-scoped invariant holds across every surface added in 122-125

**Plans**: 2 plans in `.planning/phases/126-chat-access-entitlement-gate/`
Plans:

- [x] 126-01-PLAN.md — chatEnabled flag (free false; trial/pro/business true) + the /api/chat 403 chat_not_on_plan security-boundary gate (CHATMETER-02)
- [x] 126-02-PLAN.md — chat page upgrade-prompt gate (own tier read) + the owner-only / never-customer-facing static scope test (CHATMETER-02)

## v4.10 MCP Channel Parity (Phases 127-128)

> Binds the v4.9 channel-neutral `lib/agent-tools/` capabilities as MCP tools over the EXISTING v4.1 MCP server (OAuth + `/api/mcp` + transport + annotations). A tool-binding milestone, NOT a new subsystem — the neutral functions already exist (`lib/agent-tools/`), the MCP infra already exists (`app/api/mcp/` + `lib/mcp/tools/`). Closes the WhatsApp = chat = MCP sibling-channels principle. Numbering continues the global counter — v4.9 ended at Phase 126, so v4.10 starts at **Phase 127**.

- [x] **Phase 127: MCP Read Tools — Knowledge + Query over the Neutral Core** — Bind `ask_knowledge` + the 5 query tools (`find_client`, `get_latest_estimate`, `get_project_status`, `list_recent_estimates`, `list_services`) as read-only MCP tools wrapping `lib/agent-tools/`, with `readOnlyHint: true` annotations and the companyId-trusted invariant (MKB-01, MQRY-01, MSEC-01, MSEC-02)
 (completed 2026-06-25)

- [x] **Phase 128: MCP Generation Reconciliation + Parity Verification** — Route the existing MCP `create_estimate` through the neutral `lib/agent-tools/createEstimate`, confirm all three channels share one generation entry, and prove the bindings non-destructive (the v4.1 MCP test suite stays green) (MGEN-01, MPAR-01)
 (completed 2026-06-25)

### Phase 127: MCP Read Tools — Knowledge + Query over the Neutral Core

**Goal**: A connected MCP client (Claude.ai / Claude Desktop / ChatGPT) can ask the owner's industry/company knowledge questions and read the owner's company data through the SAME neutral capabilities WhatsApp and the web chat already use — exposed as read-only MCP tools that the Claude.ai permission UI auto-groups, with the company always resolved from the OAuth token (never a tool input).
**Depends on**: v4.1 MCP server (OAuth + `/api/mcp` transport + tool-annotation infra, phases 86-90), v4.9 neutral extraction (`lib/agent-tools/ask-knowledge` + `lib/agent-tools/query-company-data`, phase 122), v4.8 `lib/knowledge/` (the KB `ask_knowledge` ultimately reads)
**Requirements**: MKB-01, MQRY-01, MSEC-01, MSEC-02
**Success Criteria** (what must be TRUE):

  1. An `ask_knowledge` MCP tool answers a trade how-to question by wrapping the neutral `lib/agent-tools/ask-knowledge`, scoped by the resolved company's `industries[]` (industry KB + company overlay) — no knowledge logic re-implemented in the MCP layer
  2. Five read-only query tools (`find_client`, `get_latest_estimate`, `get_project_status`, `list_recent_estimates`, `list_services`) each wrap the corresponding neutral `lib/agent-tools/query-company-data` data-read — one explicit MCP tool per read — and return the owner's company data
  3. For every new tool, `companyId` is resolved from the OAuth token -> company (trusted), and a test asserts no new tool's input schema accepts a tenant/companyId field (T-lrf-01)
  4. Each new read tool carries `readOnlyHint: true` (and `destructiveHint: false`) so Claude.ai's permission UI auto-groups it under the read-only "Always allow" toggle; a test asserts the annotations
  5. The new tools reuse the existing v4.1 OAuth/transport infra unchanged — they are registered onto the existing `/api/mcp` server, not a parallel one

**Plans**: 1 plan

- [x] 127-01-PLAN.md — Bind 6 read-only MCP tools (ask_knowledge + 5 query) over the neutral lib/agent-tools/ core; companyId-trusted, readOnlyHint:true, registry 6→12

### Phase 128: MCP Generation Reconciliation + Parity Verification

**Goal**: The existing MCP `create_estimate` runs through the SAME neutral generation entry point as WhatsApp and the web chat (the async `{jobId}` contract it pioneered), so all three sibling channels demonstrably share one core — and the whole binding is proven non-destructive by the existing v4.1 MCP test suite staying green unchanged.
**Depends on**: Phase 127 (the read-tool bindings + the companyId-trusted invariant pattern established), v4.9 neutral `lib/agent-tools/createEstimate` (phase 122), v4.1 MCP `create_estimate` async `{job_id}` + `check_job_status` (phase 89)
**Requirements**: MGEN-01, MPAR-01
**Success Criteria** (what must be TRUE):

  1. The MCP `create_estimate` tool routes through the neutral `lib/agent-tools/createEstimate` and returns the existing async `{jobId}` contract unchanged — behavior preserved, no estimate-generation logic re-implemented in the MCP layer
  2. All three channels (WhatsApp, web chat, MCP) converge on the same neutral generation entry point — verified by an explicit binding/grep test, not a re-implementation
  3. The MCP tools BIND the neutral `lib/agent-tools/` capabilities (a thin tool layer); nothing in `lib/agent-tools/` is re-extracted or modified to satisfy MCP
  4. The existing v4.1 MCP test suite stays green unchanged (non-destructive) — the parity guard confirming WhatsApp = chat = MCP over one core

**Plans**: 1 plan

- [x] 128-01-PLAN.md — Reconcile MCP create_estimate to delegate to the neutral createEstimate (channel-namespaced idempotency id keeps the MCP suite green) + add the MPAR-01 static binding/three-channel-convergence parity test (MGEN-01, MPAR-01)

## v4.11 Advanced Pricing Model — Per-Item Tax, Discounts, Deposit & Markup (Phases 129-134)

> Enrich the estimate's pricing MODEL (not the calculator) so the EXISTING server-side deterministic math engine (GUARD-03, `lib/services/generate-estimate.ts` ~L255-373) computes per-item tax, discounts, deposit and markup. ALL new arithmetic stays SERVER-SIDE + DETERMINISTIC — the AI provides inputs only (qty, unit_price or cost, labor/materials classification), NEVER computes; NO AI calculator tool (ENG-01, a regression fence). EXTEND the existing GUARD-03 block — do NOT create a parallel one. Retrocompat is the load-bearing invariant: with NO new fields present the result is BYTE-IDENTICAL to today's flat-rate engine (ENG-02), and it stays testable at EVERY phase. The math engine is the shared core, so the richer totals appear in all 3 channels (web/WhatsApp/MCP) with NO channel-adapter changes. Source: [SEED-032](seeds/SEED-032-advanced-pricing-model-tax-discount-deposit.md). Numbering continues the global counter — v4.10 ended at Phase 128, so v4.11 starts at **Phase 129**.

- [x] **Phase 129: Schema Foundation + GUARD-03 Engine Extension Scaffold + Retrocompat Lock** — Idempotent, authored-only migration (`estimate_items.taxable`/`tax_category`/`discount`/`cost`/`markup_pct`, `estimates.discount`/`deposit_type`/`deposit_value`, `companies.tax_config`) with retrocompat defaults; EXTEND the GUARD-03 math block so with NO new fields the result is byte-identical; a static test asserts the AI gets NO calculator tool and computes none of the new math; a regression test locks the byte-identical happy path (TAX-01, ENG-01, ENG-02)
 (completed 2026-06-25)

- [x] **Phase 130: Per-Item Taxability** — Land the `taxable`/`tax_category` AI classification inputs in the output schema/types (the AI classifies labor/materials, computes nothing) and compute tax PER-ITEM (Sum of taxable_base_per_category x rate_category) instead of flat `subtotal x rate`, byte-identical when `tax_config` is absent (TAX-02, TAX-03) (completed 2026-06-25)
- [x] **Phase 131: Discounts (line + global)** — Line-level + global discount (amount or percent); the server math applies line discount before the subtotal and the global discount before tax (configurable before/after per company), prorating the global discount into the taxable base (DISC-01, DISC-02)
 (completed 2026-06-25)

- [x] **Phase 132: Deposit + Markup + Deposit-Stripe Contract** — `deposit_type`/`deposit_value` -> server-computed `balance_due`; `cost` + `markup_pct` -> server-derived `unit_price` (never-trust-LLM, price book stores cost + markup); the deposit threads to the SEED-020/036 Stripe payment + 1% fee contract (the fee computes on the amount actually charged) (DEP-01, DEP-02, MARK-01)
 (completed 2026-06-25)

- [x] **Phase 133: Editor UI** — The estimate editor (`item-row.tsx` + `item-card-mobile.tsx`) gains per-line discount/taxable fields + global discount + deposit controls; server actions accept the new fields (PUI-01) (completed 2026-06-25)
- [x] **Phase 134: PDF + Plain-Text Totals** — The PDF + plain-text output render the new totals structure (subtotal -> discount -> tax -> total -> deposit -> balance due) across all 3 channels, surfacing the shared-engine numbers with no channel-adapter changes (PUI-02)
 (completed 2026-06-25)

### Phase 129: Schema Foundation + GUARD-03 Engine Extension Scaffold + Retrocompat Lock

**Goal**: The data model and the deterministic math authority are ready to carry the new pricing dimensions WITHOUT changing a single already-generated number — the migration adds every new field with retrocompat defaults, the GUARD-03 block is extended in a byte-identical-when-empty way, and the two load-bearing invariants (no AI calculator, byte-identical happy path) are locked by tests that stay green at every subsequent phase.
**Depends on**: v4.5 GUARD-03 server-side math block (`lib/services/generate-estimate.ts` ~L255-373), v4.5 `estimateOutputSchema` (`lib/ai/schema.ts`), the existing `estimate_items`/`estimates`/`companies` schema
**Requirements**: TAX-01, ENG-01, ENG-02
**Success Criteria** (what must be TRUE):

  1. An idempotent, authored-only migration adds `estimate_items.taxable` (boolean, default true), `tax_category` ('labor'|'materials'|'other', nullable), `discount`, `cost`, `markup_pct`; `estimates.deposit_type` ('none'|'percent'|'amount', default 'none'), `deposit_value`; and `companies.tax_config` — re-running the migration is a no-op and existing rows take retrocompat defaults; the GLOBAL discount REUSES the existing `estimates.discount_type`/`discount_value`/`discount_amount` columns (no new `estimates.discount` column)
  2. The GUARD-03 math block is EXTENDED in place (not duplicated) so that an estimate with no new fields set (taxable=true, discount=0, deposit=none, no tax_config) produces a subtotal/tax/total BYTE-IDENTICAL to the pre-milestone flat-rate engine
  3. A static test asserts the AI is given NO calculator tool and computes none of tax/discount/deposit/markup — the AI surface only gains input fields, never arithmetic (ENG-01)
  4. A regression test locks the byte-identical happy path on already-generated estimates (no number drift); it is structured to remain the standing retrocompat guard for phases 130-134 (ENG-02)

**Plans**: 2 plans

- [x] 129-01-PLAN.md — Idempotent authored-only advanced-pricing migration (all dormant columns, reusing estimates.discount_*) + ENG-01 no-AI-calculator static test (TAX-01, ENG-01)
- [x] 129-02-PLAN.md — Extract the GUARD-03 default-path math into a pure helper + default-coalescing scaffold + ENG-02 byte-identical golden regression (the standing retrocompat guard) (ENG-02)

### Phase 130: Per-Item Taxability

**Goal**: Tax is computed correctly per item (labor vs materials) by the server engine instead of a single flat rate on the whole subtotal, so the estimate is fiscally correct — while the AI only classifies each line and the happy path stays byte-identical whenever a company has no `tax_config`.
**Depends on**: Phase 129 (schema fields + extended GUARD-03 block + retrocompat lock)
**Requirements**: TAX-02, TAX-03
**Success Criteria** (what must be TRUE):

  1. The AI output schema/types carry `taxable` and `tax_category` per item; the AI classifies labor/materials but is given no way to compute tax — the arithmetic stays in the server engine
  2. The server math computes tax as the sum of (taxable_base_per_category x rate_category) per item, honoring `companies.tax_config` (per-category rate or a "labor exempt" rule), replacing the flat `subtotal x rate`
  3. When `tax_config` is absent the per-item computation produces a result byte-identical to today's flat-rate computation — the Phase-129 retrocompat regression stays green

**Plans**: 2 plans in `.planning/phases/130-per-item-taxability/`
Plans:

- [x] 130-01-PLAN.md — Wave 1: widen estimateOutputSchema + LineItemOutput with optional taxable/tax_category, advisory provider tool-schema fields, classification-only prompt instruction (AI classifies labor/materials, computes nothing) + schema acceptance/omission test (TAX-02)
- [x] 130-02-PLAN.md — Wave 2: activate the per-category tax branch in compute-totals.ts (flat fallthrough byte-identical), read companies.tax_config + persist per-item taxable/tax_category in the engine, hand-computed labor-exempt golden + ENG-02 retrocompat guard (TAX-03)

### Phase 131: Discounts (line + global)

**Goal**: A business owner can apply a per-line discount and a global discount (amount or percent), and the server engine reduces the subtotal and the taxable base correctly — discount before tax (US norm, configurable per company), with the global discount prorated into the taxable base.
**Depends on**: Phase 129 (schema + engine scaffold), Phase 130 (per-item taxable base the global discount prorates into)
**Requirements**: DISC-01, DISC-02
**Success Criteria** (what must be TRUE):

  1. An estimate item carries a line-level `discount` (amount or percent) and an estimate carries a global `discount` (amount or percent); both persist and round-trip
  2. The server math applies the line discount to compute `line_net` before the subtotal, and applies the global discount before tax (configurable before/after per company), prorating the global discount across the taxable base per the locked calculation sequence
  3. An estimate with discount=0 and no global discount produces numbers byte-identical to the pre-discount engine — the retrocompat invariant holds

**Plans**: 3 plans in `.planning/phases/131-discounts/`
Plans:

- [x] 131-01-PLAN.md — Widen the AI estimate schema/types with an OPTIONAL per-item line `discount` (amount) INPUT + acceptance/omission test (DISC-01, AI-input half)
- [x] 131-02-PLAN.md — Activate global discount (amount/percent) + discount-before-tax proration into the per-category taxable base in compute-totals.ts; return discountAmount; hand-computed goldens (1440/1890/1296) + retrocompat/active-tax goldens stay byte-identical (DISC-02)
- [x] 131-03-PLAN.md — Engine wiring: thread discountAmount + persist estimate_items.discount and estimates.discount_* (reusing existing columns, replacing hardcoded null/0/0) + static persistence test (DISC-01 persist, DISC-02 wire)

### Phase 132: Deposit + Markup + Deposit-Stripe Contract

**Goal**: An estimate can express a deposit/down-payment (so the owner shows balance due) and price items from cost + markup (so the server, never the AI, derives the price); the deposit becomes the natural value the Stripe payment link charges, threading into the existing SEED-020/036 payment + 1% fee contract.
**Depends on**: Phase 129 (deposit/cost/markup schema + engine scaffold), Phase 131 (the `grandTotal` the deposit and balance due derive from), v4.7 estimate-payment fee + Stripe Connect Direct Charge contract (SEED-036), SEED-020 customer payments
**Requirements**: DEP-01, DEP-02, MARK-01
**Success Criteria** (what must be TRUE):

  1. `estimates.deposit_type` ('none'|'percent'|'amount') + `deposit_value` drive a server-computed `balance_due = grandTotal - deposit`; deposit=none leaves the total unchanged (retrocompat)
  2. `estimate_items.cost` + `markup_pct` produce a server-derived `unit_price` (`cost x (1 + markup)`) — never-trust-LLM applied to markup; the price book can store cost + markup per item
  3. When a deposit is set, it is the amount the Stripe payment link charges (not the full total), and the existing 1% application fee computes on the amount actually charged — the SEED-020/036 payment contract is honored, not re-implemented

**Plans**: 3 plans in `.planning/phases/132-deposit-markup-stripe/`
Plans:

- [x] 132-01-PLAN.md — DEP-01: deposit + balance_due in compute-totals (LOCKED sequence) + engine persistence + hand-computed deposit golden
- [x] 132-02-PLAN.md — MARK-01: cost + markup_pct AI inputs + server-derived unit_price (never-trust-LLM) + persistence + markup golden
- [x] 132-03-PLAN.md — DEP-02: pure resolveChargeAmount (deposit-aware charge) + 1%-on-charged-amount fee contract wired into generateInvoice

### Phase 133: Editor UI

**Goal**: A business owner can see and edit the new pricing fields directly in the estimate editor — per-line discount and taxable, plus global discount and deposit controls — on both desktop and mobile, with server actions accepting the new fields; the displayed totals reflect the server engine, never client-side arithmetic.
**Depends on**: Phase 132 (all server math dimensions exist for the editor to surface), Phase 131 (discount fields), Phase 130 (taxable fields)
**Requirements**: PUI-01
**Success Criteria** (what must be TRUE):

  1. The estimate editor (`item-row.tsx` + `item-card-mobile.tsx`) renders per-line `discount` and `taxable` controls and a global discount + deposit control, on both desktop and mobile
  2. Editing those fields persists through the estimate server actions, which accept and validate the new fields, and the recomputed totals come from the server engine (not a parallel client calculation)
  3. An estimate with no new fields set renders and edits exactly as before — no regression to the existing editor flow

**Plans**: 3 plans in `.planning/phases/133-editor-ui/`
Plans:

- [x] 133-01-PLAN.md — Server-action contract: widen saveEstimate to accept per-item taxable/tax_category/discount/cost/markup_pct + estimate deposit_type/deposit_value; recompute totals server-side via computeEstimateTotals (GUARD-03); persist new columns; tested (PUI-01)
- [x] 133-02-PLAN.md — Per-line editor controls: discount input + taxable toggle on desktop (SortableDocumentItemRow) + mobile (ItemCardMobile); reducer/converter wiring; mobile-safe (PUI-01)
- [x] 133-03-PLAN.md — Summary panel: deposit controls (none/percent/amount) + Balance Due line + global-discount passthrough + i18n labels (en/pt/es) (PUI-01)

**UI hint**: yes

### Phase 134: PDF + Plain-Text Totals

**Goal**: The richer totals structure (subtotal -> discount -> tax -> total -> deposit -> balance due) appears in the PDF and the plain-text output, surfacing the shared-engine numbers consistently across all three channels (web/WhatsApp/MCP) with no channel-adapter changes.
**Depends on**: Phase 132 (the full totals structure exists), Phase 133 (editor produces estimates with the new fields)
**Requirements**: PUI-02
**Success Criteria** (what must be TRUE):

  1. The branded PDF renders the new totals block (subtotal -> discount -> tax -> total -> deposit -> balance due) with each line shown only when relevant (e.g. no discount line when discount is 0)
  2. The plain-text estimate output renders the same totals structure, consistent with the PDF and the editor
  3. The richer totals appear across all 3 channels because they read the shared math engine — no channel-adapter code changes are required; an estimate with no new fields renders the classic subtotal->tax->total block unchanged (retrocompat)

**Plans**: 4 plans in `.planning/phases/134-pdf-text-totals/`
Plans:

- [x] 134-01-PLAN.md — Shared read seam: deposit columns on Estimate type + deriveDepositDisplay() pure helper (reads persisted balance_due, never recomputes) + unit test (PUI-02)
- [x] 134-02-PLAN.md — PDF totals: Deposit + Balance Due rows in the ordered block via deriveDepositDisplay + en/pt/es labels + structural test; legacy byte-identical (PUI-02)
- [x] 134-03-PLAN.md — Public share view: view-mode Deposit row + persisted-read Balance Due in DocumentTotals (edit mode untouched) + view-mode test (PUI-02)
- [x] 134-04-PLAN.md — Plain-text/WhatsApp/MCP formatter: Deposit + Balance Due lines + en/pt/es labels + deposit columns added to feeding selects; existing tests stay green (PUI-02)

**UI hint**: yes

## 🚧 v4.12 Team Seats & Member Invites (Phases 135-140)

**Milestone Goal:** Turn the dormant multi-user foundation (`company_members`, Phase 79) into a real team-seats feature — invite teammates into the SAME organization (`company`), assign `owner`/`admin`/`member` roles with server-side authority, and bill per seat at a price that is FULLY configurable in the super-admin `billing_config` panel (nothing hardcoded), gated by `enforcementEnabled` so existing single-owner orgs see zero charge and zero behavior change. Reuse the existing `company_members`-based RLS — do NOT rebuild multi-tenancy.

> **Numbering:** continues the GLOBAL phase counter. v4.11 ended at Phase 134. **v4.12 starts at Phase 135.** Do NOT reset to 1.
>
> **Coverage:** 8/8 v4.12 requirements mapped (SEAT-01..SEAT-08). No orphans. Mapping: SEAT-01/02 → 135, SEAT-03 → 136, SEAT-04 → 137, SEAT-05 → 138, SEAT-06/07 → 139, SEAT-08 → 140.
>
> **Locked scope guardrails (do NOT plan against):** The org unit is `company`; a seat = one `company_members` row — NO new "organization" entity, and the existing `company_members`-based RLS already authorizes all org-owned data (clients, price book, estimates, credits, Connect payout) so a second member reads it for free (do NOT rebuild multi-tenancy). Roles are exactly `owner`/`admin`/`member` (`viewer` deferred to v2); exactly one `owner` per company; role authority is SERVER-SIDE only (a single `requireCompanyRole` helper + RLS), NEVER client-trusted. ZERO hardcoded billing numbers — `seatPriceCents` (global) + `tiers[tier].includedSeats` (per-tier) live in `billing_config` (`lib/billing/billing-config.ts`), read via `getBillingConfig()`, editable in the super-admin panel, applied without a deploy (30s TTL); no seat price / included-seat count / Stripe Price ID may be a constant. Billable seats = `max(0, activeMembers − includedSeats)`; the charge rides the EXISTING platform subscription (`companies.stripe_subscription_id`) as a quantity item (`unit_amount` from config), re-synced on membership change, **gated by `billing_config.enforcementEnabled` (calibrate before charging)**. A pending invite does NOT consume a billable seat (counted on ACCEPTANCE). Retrocompat is the load-bearing invariant: single-owner orgs sit within `includedSeats` → zero charge, zero behavior change, no single-user flow altered. Migrations are idempotent + authored-only — deploy via CI→GHCR→Coolify, NEVER applied to remote here / built on the VPS. Mobile-safe UI (iOS Safari / Android Chrome).

### Phases

- [x] **Phase 135: Schema + Roles + Authorization** — Idempotent authored-only migration widening the `company_members.role` CHECK from `('owner')` to `('owner','admin','member')` + creating `company_invites` (`id`/`company_id`/`email`/`role`/`token`/`status`/`invited_by`/`expires_at`/`created_at`) with RLS mirroring the Phase-79 posture (owner/admin manage their company's invites; token-accept via service role); the single server-side `requireCompanyRole(companyId, roles)` authorization helper. THE FOUNDATION — every other phase depends on it. (SEAT-01, SEAT-02) (completed 2026-06-25)
- [x] **Phase 136: Invite Lifecycle + Email** — `inviteMember(companyId, email, role)` + `revokeInvite` server actions (owner/admin only, gated by `requireCompanyRole`) creating a single-use, expiring `company_invites` row + a Resend invite email with the accept link; a pending invite does NOT consume a billable seat. (SEAT-03)
 (completed 2026-06-25)

- [x] **Phase 137: Accept Onboarding** — `acceptInvite(token)`: a valid/unexpired/pending token adds the `company_members` row + switches the active company. Existing-user → join directly; new-user → a signup-then-join branch that SKIPS company creation (the existing onboarding always creates a company — this path branches to JOIN the existing one). (SEAT-04)
 (completed 2026-06-25)

- [x] **Phase 138: Member Management UI** — `removeMember` + `changeMemberRole` server actions (gated) + a mobile-safe `Settings → Team` surface: list members (name/email/role), list pending invites, an Invite action (email + role), remove member, change role; removal revokes access immediately + decrements the seat quantity on the next sync. (SEAT-05)
 (completed 2026-06-25)

- [x] **Phase 139: Configurable Seat Billing** — Extend `BillingConfig`/`DEFAULT_BILLING_CONFIG` with `seatPriceCents` + `tiers[tier].includedSeats` (null-safe placeholders, deep-merge-tolerant) + super-admin panel fields; pure unit-tested `computeBillableSeats` / `computeSeatChargeCents` + a server `syncSeatBilling(companyId)` that syncs the Stripe subscription seat-quantity item, gated by `enforcementEnabled` (single-owner orgs → zero billable seats, no Stripe write). (SEAT-06, SEAT-07) (completed 2026-06-25)
- [x] **Phase 140: Seat-Cost Transparency UI** — The `Settings → Team` surface shows the org's current active seat count + the configured per-seat price + the projected monthly seat cost, all read from `billing_config` at runtime (never hardcoded) — same transparency principle as the 1%-fee disclosure. (SEAT-08) (completed 2026-06-25)

### Phase Details — v4.12 Team Seats & Member Invites

### Phase 135: Schema + Roles + Authorization

**Goal**: The data model and the single server-side authorization gate for team seats exist end to end: the `company_members.role` CHECK accepts `owner`/`admin`/`member`, a `company_invites` table with RLS mirroring the Phase-79 `company_members` posture is live, and one `requireCompanyRole(companyId, roles)` helper is the only place role authority is decided. Ships as the dormant foundation — no invite/UI/billing behavior yet, but everything downstream gates through this.
**Depends on**: Nothing (first phase of the milestone; the foundation everything else builds on). Reuses the Phase-79 `company_members` table + RLS pattern; does NOT rebuild multi-tenancy.
**Requirements**: SEAT-01, SEAT-02
**Success Criteria** (what must be TRUE):

  1. An idempotent, authored-only migration (NOT applied to remote — CI→GHCR→Coolify owns deploy) widens the named `company_members.role` CHECK from `('owner')` to `('owner','admin','member')` via DROP/ADD; existing `owner` rows are untouched and a static migration-contract test asserts the new matrix + idempotency (`DROP ... IF EXISTS` before `ADD`)
  2. The same migration creates `company_invites` (`id`, `company_id`, `email`, `role`, `token`, `status` ∈ `pending|accepted|revoked|expired`, `invited_by`, `expires_at`, `created_at`) with RLS mirroring the Phase-79 posture — owner/admin of the company can read/manage its invites (gated by a `company_members` subquery), and the token-based accept path is service-role only (no broad client write policy); the migration touches NO `companies` billing column
  3. A single `requireCompanyRole(companyId, roles)` server helper resolves the caller's membership row server-side (RLS-bound client, never a client-supplied role) and authorizes against the locked matrix — owner/admin for member management, owner-only for billing/seat/ownership — returning a typed allow/deny that callers narrow on; a unit test proves each role × capability cell and that an absent membership denies
  4. The role gate lives in EXACTLY ONE place: a static test asserts team/billing server actions resolve authority through `requireCompanyRole` and never re-derive a role inline or trust a role from the request body

**Plans**: 2 plans (Wave 1, both autonomous + parallel)
Plans:

- [x] 135-01-PLAN.md — Idempotent authored-only schema migration: widen company_members.role CHECK to owner/admin/member (named DROP/ADD) + create company_invites + RLS (Phase-79 mirror) + static SQL-contract test (SEAT-01)
- [x] 135-02-PLAN.md — requireCompanyRole(companyId, roles) single server-side authorization gate + requireCompanyManager/requireCompanyOwner wrappers + behavioral role-matrix test (SEAT-02)

### Phase 136: Invite Lifecycle + Email

**Goal**: An owner or admin can invite a teammate by email + role: the system creates a single-use, expiring `company_invites` row and sends a Resend email carrying the accept link, and can revoke a still-pending invite. A pending invite never consumes a billable seat — the seat is only counted on acceptance (Phase 137).
**Depends on**: Phase 135 (the `company_invites` table + RLS + `requireCompanyRole`)
**Requirements**: SEAT-03
**Success Criteria** (what must be TRUE):

  1. `inviteMember(companyId, email, role)` is gated by `requireCompanyRole(companyId, ['owner','admin'])`, creates a `company_invites` row with `status='pending'`, a cryptographically-random single-use `token`, and an `expires_at` in the future, and a `member` (or unauthenticated) caller is denied with no row written
  2. A Resend invite email is sent to the invited address containing the accept link with the token (the email is sent via the existing `lib/email/` Resend setup; no secret/token value is ever logged or committed — placeholders only in any doc)
  3. `revokeInvite` (owner/admin only) transitions a still-`pending` invite to `revoked` so its token can no longer be accepted; revoking an already-accepted/expired invite is a safe no-op
  4. Creating or revoking a pending invite causes ZERO change to billable seats or any Stripe write — a pending invite is free; the seat count is unaffected until acceptance

**Plans**: 2 plans in `.planning/phases/136-invite-lifecycle/`
Plans:

- [x] 136-01-PLAN.md — sendInviteEmail Resend template (mirrors account-emails.ts; absolute /invite/accept?token=… link; never-throws/no-key-skip) + behavioral test
- [x] 136-02-PLAN.md — inviteMember + revokeInvite server actions (lib/actions/team.ts) gated by requireCompanyManager; random+unique token, 7d expiry, email send, token never returned; reject paths + revoke tested

### Phase 137: Accept Onboarding

**Goal**: An invited person can accept and land inside the existing company as a member — without ever creating a new company. A valid, unexpired, pending token adds their `company_members` row and switches their active company; if the email already has an auth user they join directly, and if not, a signup-then-join branch reuses onboarding but SKIPS company creation (the current onboarding always creates a company — this path must branch to JOIN).
**Depends on**: Phase 135 (schema + `requireCompanyRole`), Phase 136 (the invite + token the accept consumes). Branches off the `lib/actions/active-company.ts` membership check + the `lib/actions/company.ts` onboarding that today always creates a company.
**Requirements**: SEAT-04
**Success Criteria** (what must be TRUE):

  1. `acceptInvite(token)` accepts ONLY a token that is `pending`, unexpired, and matches the invited email; it inserts the `company_members` row (via service role, with `role` from the invite, mirroring the Phase-79/80 membership-insert posture) and marks the invite `accepted` atomically — an expired/revoked/already-accepted/forged token is rejected and writes no membership
  2. An invited email that ALREADY has an auth user joins directly: after accept, their session's active company is switched to the invited company (reusing the `switchActiveCompany` membership-verified cookie write) and they immediately read the org's shared data via the existing `company_members` RLS — no new company is created
  3. An invited email with NO existing auth user goes through a signup-then-join branch that creates the user and then JOINS the existing company — it explicitly does NOT run the company-creation path of onboarding (the `mode:'first'`/`'add'` create-company branch is skipped); a test proves no second `companies` row is created for an invited signup
  4. On acceptance the active member count for the company increases by one (the basis Phase 139's seat billing reads on the next sync); a single-owner org that never accepts an invite is unchanged

**Plans**: 2 plans
Plans:

- [x] 137-01-PLAN.md — acceptInvite(token) server action: service-client token lookup, single-use atomic flip, expiry + email-match enforced, idempotent company_members insert with invite.role, switchActiveCompany (TDD)
- [x] 137-02-PLAN.md — /invite/accept route (authed join / unauthed signup-with-token) + signUp/signIn ?next=/invite/accept redirect so an invited new user JOINs and SKIPS company creation (test proves no /onboarding)

### Phase 138: Member Management UI

**Goal**: An owner/admin can manage the team from a mobile-safe `Settings → Team` surface — see members and pending invites, invite by email + role, change a member's role, and remove a member — backed by gated server actions. Removing a member revokes their access immediately (the membership row is deleted) and decrements the billable seat quantity on the next sync.
**Depends on**: Phase 135 (schema + `requireCompanyRole`), Phase 136 (invite action surfaced in the UI), Phase 137 (accept produces the members the list shows)
**Requirements**: SEAT-05
**Success Criteria** (what must be TRUE):

  1. `removeMember` and `changeMemberRole` are gated by `requireCompanyRole` (owner/admin; owner-only where the locked matrix requires it — e.g. you cannot remove or demote the sole `owner`), reject a `member` caller, and never trust a role from the request body
  2. A `Settings → Team` page lists current members (name/email/role) and pending invites, and exposes Invite (email + role), Change role, and Remove actions wired to the gated actions; the page is server-authorized so a `member` cannot reach the management controls
  3. Removing a member deletes their `company_members` row so they immediately lose access to the org's data (the existing RLS stops authorizing them), and the active member count drops — the basis for the seat-quantity decrement on the next Phase-139 sync
  4. The Team surface is mobile-safe — usable on iOS Safari and Android Chrome (the app runs on phones), following the existing mobile-safe Settings form idiom

**Plans**: 2 plans

- [x] 138-01-PLAN.md — removeMember + changeMemberRole (gated; last-owner/owner-target/role guards) + listCompanyRoster query (members + pending invites) + unit tests
- [x] 138-02-PLAN.md — Settings → Team page + TeamSection (roster, invite/change-role/remove/revoke for owner/admin, read-only for members) + nav entry; mobile-safe; i18n

**UI hint**: yes

### Phase 139: Configurable Seat Billing

**Goal**: Per-seat billing is fully super-admin-configurable and mechanically correct, with nothing hardcoded. `BillingConfig` gains `seatPriceCents` (global) + `tiers[tier].includedSeats` (per-tier) as null-safe placeholders surfaced in the super-admin panel; pure, unit-tested math computes billable seats and the seat charge; and `syncSeatBilling(companyId)` updates the Stripe subscription seat-quantity item from the live member count + config — but only RECORDS until `enforcementEnabled` is flipped on. Existing single-owner orgs within their included seats produce zero billable seats and no Stripe write.
**Depends on**: Phase 135 (the role/member schema that defines the active member count). Otherwise independent of the UI phases (136-138) — it reads the member count, not the management UI. Reuses the `billing_config` / `getBillingConfig` mechanism and the existing `companies.stripe_subscription_id`.
**Requirements**: SEAT-06, SEAT-07
**Success Criteria** (what must be TRUE):

  1. `BillingConfig` + `DEFAULT_BILLING_CONFIG` gain `seatPriceCents` (global) and `tiers[tier].includedSeats` (per-tier) as null-safe calibration placeholders (NOT final numbers, mirroring the existing `markup`/`estimateFeePct` placeholder discipline); the `getBillingConfig` deep-merge reader resolves them for a `billing_config` row written before the fields existed (the Pitfall-6 tolerance), and a static test asserts no seat price / included-seat count / Stripe Price ID is hardcoded in any seat-billing path
  2. A super-admin can edit `seatPriceCents` and each tier's `includedSeats` in the billing panel, save, and the new values take effect at runtime on the next sync with no redeploy (the 30s TTL flush); the tenant (business owner) has no route to these controls
  3. Pure functions `computeBillableSeats(activeMembers, includedSeats)` = `max(0, activeMembers − includedSeats)` and `computeSeatChargeCents(billableSeats, seatPriceCents)` keep all seat arithmetic in one I/O-free place and are unit-tested across boundary cases (members ≤ included → 0 billable; members > included → the difference; zero/placeholder price)
  4. `syncSeatBilling(companyId)` reads the live `company_members` count + `billing_config` and updates the Stripe subscription seat-quantity item (`unit_amount` from `billing_config.seatPriceCents`, `quantity` = billable seats, Stripe default proration) — but is gated by `billing_config.enforcementEnabled`: with enforcement OFF it RECORDS the computed quantity and performs no charge; a single-owner org within `includedSeats` computes zero billable seats and makes NO Stripe write in either mode (retrocompat)
  5. `syncSeatBilling` is invoked on every membership change (invite accepted, member removed, role change that flips billable status) so the seat quantity stays in sync, and is never-throw / non-fatal so a seat-sync failure never blocks the underlying membership operation

**Plans**: 3 plans
Plans:

- [x] 139-01-PLAN.md — SEAT-06: extend BillingConfig/DEFAULT with seatPriceCents (global) + tiers[tier].includedSeats (per-tier) calibration placeholders + admin zod schema + editable super-admin form fields + a static no-hardcode test (deep-merge tolerance for pre-existing rows)
- [x] 139-02-PLAN.md — SEAT-07 math+sync: pure computeBillableSeats/computeSeatChargeCents (TDD goldens) + server syncSeatBilling(companyId) reading member count + tier + billing_config, gated by enforcementEnabled, idempotent, never-throw, Stripe SDK isolated behind a thin mockable seat-item method; retrocompat single-owner = zero write
- [x] 139-03-PLAN.md — SEAT-07 wiring: invoke never-throw syncSeatBilling on the success path of acceptInvite (137) + removeMember/changeMemberRole (138); a billing failure never rolls back the membership change (wiring test)

**UI hint**: yes

### Phase 140: Seat-Cost Transparency UI

**Goal**: The owner can see exactly what seats cost. The `Settings → Team` surface shows the org's current active seat count, the configured per-seat price, and the projected monthly seat cost — all read from `billing_config` at runtime so the disclosed number never diverges from the configured/charged number, the same transparency principle as the 1%-fee disclosure.
**Depends on**: Phase 138 (the `Settings → Team` surface the summary lives on), Phase 139 (`seatPriceCents` / `includedSeats` config + the `computeBillableSeats`/`computeSeatChargeCents` math the projection reuses)
**Requirements**: SEAT-08
**Success Criteria** (what must be TRUE):

  1. The `Settings → Team` surface shows the org's current active seat count, the configured per-seat price, and the projected monthly seat cost, with the per-seat price and the included-seat count read from `billing_config` at runtime — never hardcoded copy (a static test asserts no hardcoded seat price/number in the component)
  2. The projected monthly cost is computed with the SAME `computeBillableSeats`/`computeSeatChargeCents` functions the billing sync uses, so the number the owner sees reconciles to what the seat-quantity sync would charge — one math source, no divergence
  3. A single-owner org sitting within `includedSeats` shows a $0 projected seat cost and no alarming charge — retrocompat: the transparency surface confirms zero charge rather than implying one

**Plans**: 1 plan in `.planning/phases/140-seat-cost-ui/`
Plans:

- [x] 140-01-PLAN.md — Pure seat-cost summary builder (reuses computeBillableSeats/computeSeatChargeCents + getBillingConfig) + team page server-compute wiring + TeamSection owner/admin-only cost line (i18n, mobile, truthful when enforcement off)

**UI hint**: yes

## 🚧 v4.13 Annual Billing (Phases 141-145)

**Milestone Goal:** Add a discounted ANNUAL subscription option while keeping AI credit distribution MONTHLY for every interval. Annual changes price + billing cadence only — never the rate at which credits flow. The load-bearing change is NOT the price field: it is decoupling the monthly credit grant from the invoice cadence. Today the grant is a side-effect of `invoice.paid`, which fires monthly for monthly subs but only once a year for annual subs. A monthly Inngest cron grants `monthlyCreditGrant` to active paying companies, idempotent on a company+month key `grant:{companyId}:{YYYY-MM}`; `invoice.paid` adopts the SAME key so the two converge to exactly one grant per company per calendar month for any interval. Annual price + seat price are fully configurable in `billing_config`/super-admin (nothing hardcoded; discount % derived); the base charge rides pre-created annual Stripe Price IDs (env placeholders only); seats use inline `price_data`. Default interval `'month'` keeps every existing monthly subscriber byte-identical. Source: SEED-038.

> **Numbering:** continues the GLOBAL phase counter. v4.12 ended at Phase 140. **v4.13 starts at Phase 141.** Do NOT reset to 1.
>
> **Coverage:** 5/5 v4.13 requirements mapped (ANN-01..ANN-05). No orphans. Mapping: ANN-01 → 141, ANN-02 → 142, ANN-03 → 143, ANN-04 → 144, ANN-05 → 145.
>
> **Locked scope guardrails (do NOT plan against):** Credits stay MONTHLY for EVERY interval — annual is only a price discount (same tier, same `monthlyCreditGrant`, same seats). The company-month key `grant:{companyId}:{YYYY-MM}` is the SINGLE dedup authority shared by the webhook AND the cron → exactly one grant per company per calendar month, NO double-grant. ZERO hardcoded billing numbers — `tiers[tier].subscriptionPriceAnnualCents` + `seatPriceAnnualCents` live in `billing_config`, read via `getBillingConfig()`, editable without a deploy; the discount % is DERIVED (`1 − annual/(12×monthly)`), never stored; no annual price / discount % / Stripe Price ID may be a constant. The base annual charge uses pre-created Stripe Price IDs (env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` — PLACEHOLDERS ONLY in every doc, never a real ID or key); seat annual uses inline `price_data` driven straight from `seatPriceAnnualCents` (no pre-created Price ID). Interval is selected at checkout (`billingInterval: 'month' | 'year'`, default `'month'`) and threaded through metadata; the seat sync reads the subscription interval and matches it (the hardcoded `recurring: { interval: 'month' }` becomes dynamic). Charging stays gated by the existing `enforcementEnabled` / live-mode discipline (display can ship anytime). Retrocompat is the load-bearing invariant: default interval `'month'`, the existing monthly path byte-identical, a regression test locks "monthly subs still get exactly one grant/month with no double-grant across webhook + cron." Mid-cycle proration on interval switch is v2. Mobile-safe UI (iOS Safari / Android Chrome); i18n en/pt/es.

### Phases

- [x] **Phase 141: Configurable Annual Pricing** — Extend `BillingConfig`/`DEFAULT_BILLING_CONFIG` with `tiers[tier].subscriptionPriceAnnualCents` (per-tier) + `seatPriceAnnualCents` (global) as null-safe, deep-merge-tolerant calibration placeholders; mirror them in the admin zod schema; surface both as editable super-admin billing-panel fields. Foundation for the annual price; nothing hardcoded; independent of the cron. (ANN-01)
 (completed 2026-06-25)

- [x] **Phase 142: Monthly Credit Grant Decouple** — THE load-bearing phase. Change the `invoice.paid` grant idempotency key from `event.id` to `grant:{companyId}:{YYYY-MM}`; add an Inngest monthly cron (`lib/inngest/functions/monthly-credit-grant.ts`, mirroring the `cleanup-audio` cron pattern) that grants `monthlyCreditGrant` to active paying companies once per company-month using the SAME key, reusing the idempotent never-throw `grantCredits`. Exactly one grant per company per calendar month for ALL intervals. Retrocompat regression test (monthly subs, no double-grant across webhook + cron) is the gate. (ANN-02) (completed 2026-06-25)
- [x] **Phase 143: Annual Checkout** — `create-checkout-session` accepts `billingInterval: 'month' | 'year'` (default `'month'`), selects the matching annual Stripe Price ID (new env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL`, placeholders only), and stores `billing_interval` in the subscription/session metadata. The no-interval / `'month'` path stays byte-identical. (ANN-03) (completed 2026-06-28)
- [x] **Phase 144: Interval-Aware Seat Billing** — Make `syncSubscriptionSeatItem` read the subscription's interval and set the seat item's `recurring.interval` to match (replacing the hardcoded `'month'`), using `seatPriceAnnualCents` (inline `price_data`) for annual subscriptions. Monthly orgs unchanged; gated by the same `enforcementEnabled` switch. Builds on the v4.12 seat billing. (ANN-04) (completed 2026-06-28)
- [x] **Phase 145: Pricing UI Toggle** — The pricing cards (`tier-cards-grid.tsx` + `tier-card.tsx`) gain a Monthly/Annual toggle showing the annual price, the DERIVED "save X%" badge, and the per-month equivalent; the selected interval threads into the upgrade/checkout action. Mobile-safe; i18n en/pt/es via runtime `t()`. (ANN-05) (completed 2026-06-28)

### Phase Details — v4.13 Annual Billing

### Phase 141: Configurable Annual Pricing

**Goal**: The annual price and annual seat price exist as super-admin-editable knobs with nothing hardcoded. `BillingConfig` + `DEFAULT_BILLING_CONFIG` gain `tiers[tier].subscriptionPriceAnnualCents` (per-tier) and `seatPriceAnnualCents` (global) as null-safe calibration placeholders; the admin zod schema accepts them; the super-admin billing panel surfaces both as editable fields. This is the foundation the annual Stripe Price (143), the interval-aware seat charge (144), and the UI discount badge (145) all read from. Ships as configurable data with no charging behavior yet.
**Depends on**: Nothing (first phase of the milestone). Reuses the existing `billing_config` / `getBillingConfig` mechanism + the v4.12 `seatPriceCents` / `includedSeats` placeholder discipline; does NOT touch the cron or checkout.
**Requirements**: ANN-01
**Success Criteria** (what must be TRUE):

  1. `BillingConfig` + `DEFAULT_BILLING_CONFIG` gain `tiers[tier].subscriptionPriceAnnualCents` (per-tier) and `seatPriceAnnualCents` (global) as null-safe calibration placeholders (NOT final numbers — mirroring the existing `subscriptionPriceCents` / `seatPriceCents` placeholder discipline), and the `getBillingConfig` deep-merge reader resolves them for a `billing_config` row written before the fields existed (the Pitfall-6 tolerance)
  2. A super-admin can edit each tier's `subscriptionPriceAnnualCents` and the global `seatPriceAnnualCents` in the billing panel, save, and the new values take effect at runtime with no redeploy (the 30s TTL flush); the admin zod schema validates the new fields and the tenant (business owner) has no route to these controls
  3. A static test asserts no annual price, discount %, or Stripe Price ID is a constant in any application-code billing path — every annual number resolves from `billing_config` at runtime
  4. No charging, checkout, cron, or seat behavior changes in this phase — the fields exist and are editable but nothing reads them to charge yet (the monthly path is byte-identical)

**Plans**: 1 plan

- [x] 141-01-PLAN.md — extend BillingConfig/DEFAULT + admin zod schema + super-admin billing form with seatPriceAnnualCents (global) + tiers[tier].subscriptionPriceAnnualCents (per-tier) calibration placeholders; deep-merge + no-hardcode static tests (ANN-01)

### Phase 142: Monthly Credit Grant Decouple

**Goal**: The monthly AI credit grant is decoupled from the invoice cadence so annual subscribers get credits every calendar month — not once a year — without ever double-granting monthly subscribers. The `invoice.paid` handler's grant idempotency key moves from `event.id` to `grant:{companyId}:{YYYY-MM}`, and a new monthly Inngest cron grants `monthlyCreditGrant` to active paying companies using that SAME company-month key, reusing the idempotent never-throw `grantCredits`. The company-month key is the single dedup authority, so the webhook and the cron converge to exactly one grant per company per calendar month for any interval. This is the heart of the milestone — get it right and the rest is mechanical.
**Depends on**: Nothing in this milestone (independent of the price field — can run in parallel with 141). Reuses the idempotent never-throw `grantCredits` (`lib/billing/credit-ledger.ts`), the `invoice.paid` grant in `app/api/webhooks/stripe/route.ts` (~line 194), and the Inngest `cron:` trigger pattern from `lib/inngest/functions/cleanup-audio.ts` (registered in `lib/inngest/functions/index.ts`).
**Requirements**: ANN-02
**Success Criteria** (what must be TRUE):

  1. The `invoice.paid` credit grant uses idempotency key `grant:{companyId}:{YYYY-MM}` (derived from the company id + the current calendar month) instead of `event.id`; a redelivered webbook in the same month is still a no-op, and the grant still fires immediately on first-subscribe and on renewal (the instant-UX path is preserved)
  2. A new Inngest monthly cron `lib/inngest/functions/monthly-credit-grant.ts` (mirroring the `cleanup-audio` `triggers: [{ cron: ... }]` pattern, registered in `lib/inngest/functions/index.ts`) grants `monthlyCreditGrant` to every active paying company (tier ≠ free / not trial-expired, subscription active) once per calendar month, using the SAME `grant:{companyId}:{YYYY-MM}` key and the idempotent never-throw `grantCredits`
  3. The company-month key is the SINGLE dedup authority across BOTH paths: a monthly subscriber's `invoice.paid` grants the month and the cron no-ops that month (key present); an annual subscriber's `invoice.paid` grants month 1 and the cron grants months 2-12 — NO company is ever granted twice in one calendar month, proven by a regression test that runs the webhook and the cron in the same month and asserts a single ledger grant
  4. Retrocompat: a regression test locks that every existing monthly subscriber still receives exactly one grant per calendar month with the new key, with no double-grant during the `event.id` → company-month transition; the grant remains never-throw so a grant failure never blocks the webhook ack or the cron run

**Plans**: 1 plan

- [x] 142-01-PLAN.md — add shared monthGrantKey(companyId,date) helper + re-key the invoice.paid grant from event.id to the company-month key; add + register the Inngest monthly-credit-grant cron ('0 5 1 * *') granting active paying companies via the idempotent grantCredits on the SAME key; load-bearing no-double-grant regression test (ANN-02)

### Phase 142.1: Settings Account Consolidation and Admin-Only WhatsApp Control (INSERTED)

**Goal:** Restore the platform-managed WhatsApp authority boundary and simplify tenant settings: personal profile and credential controls live together under Account; tenants cannot view or configure WhatsApp provisioning, inboxes, conversations, numbers, status, or delivery format; super-admins can provision and inspect WhatsApp by tenant account with server-side filters and audit coverage; inbound routing trusts only active admin-provisioned senders while opaque outbound estimate sending remains available to provisioned tenants.
**Requirements**: ACCT-01, WAADM-01, WAADM-02, WAADM-03, WAADM-04, WAADM-05
**Depends on:** Phase 79 (multi-company membership), Phase 93 (super-admin event log), Phase 104 (notification channels)
**Success Criteria** (what must be TRUE):

  1. Settings has no separate General entry; `/settings/account` contains profile photo, account name, personal phone, email, and password controls, and `/settings/general` redirects without losing saved profile behavior.
  2. No tenant route or project surface exposes WhatsApp configuration, linked numbers, status, inboxes, conversation previews, or history; direct legacy URL access returns no protected content, and no tenant-callable action writes WhatsApp provisioning through the service role.
  3. `/admin/whatsapp` provides server-side, paginated filters by tenant company/account, sender/member, phone/contact search, status, unread state, and date range, with read-only thread inspection and admin-only provisioning actions recorded in `admin_audit_log`.
  4. An authored, backward-compatible expand–migrate–contract migration preserves valid current routing data, flags ambiguous multi-number companies for admin review, and makes active admin-provisioned senders the sole owner-routing authority; onboarding/profile/company phone changes no longer alter WhatsApp routing.
  5. Provisioned tenants can still send estimates through an opaque WhatsApp action without seeing configuration/history; proactive WhatsApp notifications are disabled while historical consent data is preserved; account, admin, migration, routing, and cross-tenant isolation tests pass.

**Plans:** 6/6 plans complete
Plans:
**Wave 1**

- [x] 142.1-01-PLAN.md — Wave 1: normalized company config + authorized sender registry, non-destructive backfill, conflict classification, and server-only account registry (WAADM-03, WAADM-04)
- [x] 142.1-02-PLAN.md — Wave 1: consolidate General into Account, remove tenant WhatsApp profile writer, redirect legacy route, and align skeleton/tests (ACCT-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 142.1-03-PLAN.md — Wave 2: remove tenant inbox/history/previews/integration controls and disable proactive WhatsApp notification configuration while preserving outbound estimate sending (WAADM-01, WAADM-05)
- [x] 142.1-04-PLAN.md — Wave 2: server-side admin account/sender/status/unread/date/search filters, pagination, and scoped read-only thread inspection (WAADM-02)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 142.1-05-PLAN.md — Wave 3: audited super-admin provisioning actions and account management UI with E.164/uniqueness/status guards (WAADM-02, WAADM-03)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 142.1-06-PLAN.md — Wave 4: registry-only inbound routing, remove tenant/companies-phone authority, opaque outbound gate, notification shutdown, and legacy schema contraction (WAADM-01, WAADM-03, WAADM-04, WAADM-05)

### Phase 143: Annual Checkout

**Goal**: A business owner can start an ANNUAL checkout. `create-checkout-session` accepts `billingInterval: 'month' | 'year'` (default `'month'`), routes to the matching annual Stripe Price ID (new env, placeholders only), and records `billing_interval` in the session + subscription metadata so downstream sync (144) and reporting know the interval. The no-interval / `'month'` request stays byte-identical to today.
**Depends on**: Phase 141 (the annual price/Stripe linkage — the `subscriptionPriceAnnualCents` super-admin figure must be kept consistent with the pre-created annual Stripe Price the checkout charges). Reuses the existing checkout in `app/api/billing/create-checkout-session/route.ts` and its `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` env pattern.
**Requirements**: ANN-03
**Success Criteria** (what must be TRUE):

  1. `create-checkout-session` accepts a `billingInterval: 'month' | 'year'` field defaulting to `'month'`; for `'year'` it selects the annual Stripe Price ID from a new env (`STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL`) and returns a clear error if the relevant annual env is unset (mirroring the existing monthly missing-env guard)
  2. The created Checkout Session (and its `subscription_data.metadata`) carries `billing_interval` alongside the existing `companyId` + `plan`, so the seat-billing sync (144) and any reporting can read the interval from the subscription without a line-items expand call
  3. A request with no `billingInterval` (or `'month'`) produces a Checkout Session byte-identical to today — same monthly Price ID, same metadata shape plus `billing_interval: 'month'` — so existing monthly checkout is unchanged
  4. New annual env vars are documented in `.env.local.example` / `.env.production.example` with PLACEHOLDERS ONLY (e.g. `price_<your-annual-pro-price-id>`) — never a real Stripe Price ID or key in any doc

**Plans**: TBD

### Phase 144: Interval-Aware Seat Billing

**Goal**: Seat billing follows the subscription's interval. `syncSubscriptionSeatItem` reads the subscription's interval (instead of the hardcoded `recurring: { interval: 'month' }`) and matches the seat item to it, using `seatPriceAnnualCents` (inline `price_data`, config-driven — never a pre-created Price ID) for annual subscriptions. A monthly org's seat billing is unchanged, and the whole behavior stays gated by `enforcementEnabled`.
**Depends on**: Phase 141 (the `seatPriceAnnualCents` config it reads). Builds on the v4.12 seat-billing machinery (`syncSubscriptionSeatItem` / `syncSeatBilling`, `lib/billing/stripe-client.ts` ~line 79). Independent of checkout (143) — it reads the live subscription's interval, not the checkout request.
**Requirements**: ANN-04
**Success Criteria** (what must be TRUE):

  1. `syncSubscriptionSeatItem` reads the subscription's recurring interval from the retrieved Stripe subscription and sets the seat item's `recurring.interval` to match — the hardcoded `recurring: { interval: 'month' }` is gone; a monthly subscription still produces a monthly seat item and an annual subscription produces an annual seat item
  2. For an annual subscription the seat item's `unit_amount` comes from `billing_config.seatPriceAnnualCents` via inline `price_data` (config-driven, never a pre-created Price ID), and for a monthly subscription it comes from `seatPriceCents` exactly as today — both resolved at runtime from `getBillingConfig()`, nothing hardcoded
  3. Retrocompat: a monthly org's seat-billing sync is byte-identical to v4.12 (same interval, same price source, same quantity math), and a single-owner org within `includedSeats` still makes no Stripe seat write in either interval
  4. The interval-aware seat sync stays gated by `billing_config.enforcementEnabled` (records with enforcement off, charges only when on) and remains never-throw / non-fatal so a seat-sync failure never blocks the underlying membership or checkout operation

**Plans**: TBD

### Phase 145: Pricing UI Toggle

**Goal**: A business owner sees a Monthly/Annual toggle on the pricing cards and can choose annual to start a discounted annual checkout. The annual view shows the annual price, a DERIVED "save X%" badge (`1 − annual/(12×monthly)`, never a stored number), and the per-month equivalent; the selected interval threads into the upgrade/checkout action so picking Annual starts an annual checkout (143). Mobile-safe and localized en/pt/es.
**Depends on**: Phase 141 (the annual price the cards display) and Phase 143 (the checkout interval the toggle threads into). Reuses the existing pricing cards `components/billing/tier-cards-grid.tsx` + `tier-card.tsx` and their `T`/`t()` i18n idiom.
**Requirements**: ANN-05
**Success Criteria** (what must be TRUE):

  1. The pricing cards render a Monthly/Annual toggle; selecting Annual switches each card to show the annual price, the per-month-equivalent (annual ÷ 12), and a "save X%" badge whose percentage is DERIVED at render time from `1 − annual/(12×monthly)` using the `billing_config` annual + monthly figures — no discount % or annual price is hardcoded in the component (a static test asserts this)
  2. Choosing Annual and clicking the upgrade/CTA threads `billingInterval: 'year'` into the checkout action so the annual Checkout Session (Phase 143) is created; choosing Monthly threads `'month'` (default) and the checkout is byte-identical to today
  3. The toggle + annual card layout is mobile-safe (usable on iOS Safari and Android Chrome) and every new string (toggle labels, "save X%", per-month equivalent, period) routes through runtime `t()` with en/pt/es coverage — no hardcoded copy
  4. A tier with no configured annual price (placeholder unset) degrades gracefully — the Annual toggle either hides that tier's annual option or shows a clear unavailable state rather than rendering a broken/zero price

**Plans**: TBD
**UI hint**: yes

## 🚧 v4.14 Admin Sales Mode (Phases 146-149)

**Milestone Goal:** Give the super-admin user the ability to create demo company accounts on-the-fly during in-person sales demos — picking up a prospect's info, configuring a branded workspace in under 2 minutes, generating a live estimate with their logo and industry defaults, then handing the account off via email invite. The role system must live in Supabase (`is_super_admin` flag on `profiles`); no email or user ID may be hardcoded anywhere in the codebase. New companies created by the admin start with a 3-estimate quota; after that a paywall appears unless the admin grants more credits. Handoff reuses the v4.12 invite flow.

> **Numbering:** continues the GLOBAL phase counter. v4.13 ended at Phase 145. **v4.14 starts at Phase 146.** Do NOT reset to 1.
>
> **Locked scope guardrails:** Role authority is SERVER-SIDE only (`requireSuperAdmin()` helper + `is_super_admin` column on `profiles`); never client-trusted. Nothing hardcoded — the super-admin email/user list is managed in Supabase, editable without a deploy. The 3-estimate quota rides the existing credit/billing infrastructure (nothing new billed — it's a demo quota). Handoff uses the existing `company_invites` flow from Phase 136 — do NOT build a separate transfer mechanism. Mobile-safe (iOS Safari / Android Chrome).

### Phases

- [x] **Phase 146: Super-Admin Role System** — Add `is_super_admin boolean DEFAULT false` to `profiles` via idempotent authored-only migration + RLS policy; single `requireSuperAdmin()` server helper that reads the column (never a client-supplied flag); remove ALL hardcoded email checks from the codebase. (ADMIN-01) (completed 2026-07-05)
- [x] **Phase 147: Admin Company Creation Modal** — Show "Add new company" button in `CompanySelector` only when `is_super_admin` is true; clicking opens a quick-creation modal (not a new page) with minimal fields (company name, industry, phone, email, optional logo); creates the company + switches to it; the new company starts with a 3-estimate quota. (ADMIN-02, ADMIN-03) (completed 2026-07-05)
- [x] **Phase 148: Demo Estimate Quota** — New companies created via the admin modal start with `estimate_quota = 3`; a server-side guard tracks usage and blocks generation when exhausted showing a paywall; super-admin panel exposes a manual quota-grant control per company. (ADMIN-04) (completed 2026-07-05)
- [x] **Phase 149: Account Handoff** — Admin can share the demo company with the prospect by entering their email in a Handoff modal; reuses the Phase 136 `inviteMember` flow with role `'owner'`; the client receives the Resend invite email and joins via the existing Phase 137 `acceptInvite` path. (ADMIN-05) (completed 2026-07-05)

### Phase Details — v4.14 Admin Sales Mode

### Phase 146: Super-Admin Role System

**Goal**: The `is_super_admin` flag lives in Supabase on the `profiles` table (idempotent authored-only migration), a single `requireSuperAdmin()` server helper enforces it, and every hardcoded email/user-ID check in the codebase is replaced with a DB-driven lookup. No deploy needed to add/remove super-admins — a Supabase update to the `profiles` row is enough.
**Depends on**: Nothing (first phase of milestone). Builds on the `profiles` table from Phase 1 and the `requireCompanyRole` pattern from Phase 135.
**Requirements**: ADMIN-01
**Success Criteria** (what must be TRUE):

  1. An idempotent authored-only migration adds `is_super_admin boolean NOT NULL DEFAULT false` to `profiles` with an RLS policy ensuring only a service-role caller or the super-admin themselves can set it to true — no client can self-promote
  2. A single `requireSuperAdmin()` server helper reads `is_super_admin` from the caller's `profiles` row (RLS-bound, never from a client-supplied parameter) and throws a typed `ForbiddenError` when false; a unit test proves the allow/deny matrix
  3. A static test (grep/AST) asserts that ZERO files in the codebase contain a hardcoded email address or user ID used for authorization decisions — all such checks route through `requireSuperAdmin()` or `requireCompanyRole()`
  4. The first super-admin is activated by a one-time SQL update in Supabase (documented in `docs/setup/super-admin.md` with placeholder `<user_id>` — no real IDs in the doc)

**Plans**: TBD

### Phase 147: Admin Company Creation Modal

**Goal**: The super-admin sees "Add new company" in the company selector and clicking it opens a compact modal (not a full-page route) to enter company name, industry, phone, email, and optional logo. On submit the company is created, assigned 3 estimate credits, and the app switches to it — ready to generate an estimate.
**Depends on**: Phase 146 (requireSuperAdmin gate). Reuses the existing company-creation server action and the v4.12 `company_members` setup. Reuses the existing modal/sheet pattern in the UI.
**Requirements**: ADMIN-02, ADMIN-03
**Success Criteria** (what must be TRUE):

  1. The "Add new company" item in `CompanySelector` is rendered only when the current user's `is_super_admin` is `true`; non-admin users see the button removed from the DOM entirely (not just hidden via CSS)
  2. Clicking the button opens a modal dialog with fields: company name (required), industry (required, dropdown matching existing industry options), phone (optional), email (optional), logo upload (optional); the form is usable on iOS Safari and Android Chrome in under 2 minutes
  3. On successful submit: company is created in Supabase, the current user is added as `owner` in `company_members`, the active company is switched, and the modal closes — no full-page navigation
  4. The newly created company starts with exactly 3 estimate credits (the quota set in Phase 148 infrastructure); this is verifiable in the super-admin panel

**Plans**: TBD
**UI hint**: yes

### Phase 148: Demo Estimate Quota

**Goal**: Every company created via the admin modal starts with a 3-estimate quota. A server-side guard checks remaining quota before each generation and, when exhausted, returns a paywall response instead of generating. The super-admin panel exposes a manual grant control to add more estimates to any company.
**Depends on**: Phase 147 (the modal that creates companies with the quota). Builds on the existing credit/billing infrastructure.
**Requirements**: ADMIN-04
**Success Criteria** (what must be TRUE):

  1. New companies created by an admin start with `estimate_credits = 3` (or equivalent in the existing credits schema); existing companies are unaffected (zero migration-time data change)
  2. A server-side guard runs before every estimate generation: if `remaining_credits <= 0`, the action returns a structured paywall error (not an exception); the UI surfaces a clear "You've used your free estimates — upgrade to continue" message
  3. A super-admin panel control allows adding N credits to any company by company ID; the change takes effect immediately without a deploy
  4. A company on a paid subscription bypasses the quota guard entirely (existing billing entitlement logic remains authoritative)

**Plans**: TBD

### Phase 149: Account Handoff

**Goal**: After a successful live demo, the admin can hand off the demo company to the prospect by entering their email in a Handoff modal. The system sends a Resend invite email using the existing Phase 136 `inviteMember` flow with role `'owner'`; the client accepts via the Phase 137 `acceptInvite` path and takes ownership of the company.
**Depends on**: Phase 136 (inviteMember) and Phase 137 (acceptInvite) from v4.12. Phase 146 (requireSuperAdmin gate on the handoff action).
**Requirements**: ADMIN-05
**Success Criteria** (what must be TRUE):

  1. A "Hand off account" action is available in the super-admin UI for any company they created; entering a prospect email triggers `inviteMember(companyId, email, 'owner')` gated by `requireSuperAdmin()` — a non-admin caller is rejected
  2. The prospect receives the standard Resend invite email from Phase 136 and can accept via the Phase 137 flow; on acceptance they become `owner` of the company and the admin's membership is optionally retained as `admin` (configurable)
  3. No new invite or email infrastructure is added — the handoff exclusively reuses Phase 136/137 mechanisms; a static test asserts no duplicate invite-send code exists
  4. The handoff is mobile-safe and completes in under 3 taps on the admin's phone

**Plans**: TBD
**UI hint**: yes

## ✅ v4.15 Credit UX Polish & Admin Support Tooling (Phases 150-153) — SHIPPED 2026-07-05

Full phase details archived: [milestones/v4.15-ROADMAP.md](milestones/v4.15-ROADMAP.md)

**Milestone Goal:** Replace the raw numeric credit counter with a Claude-Console-style usage progress bar (tenants see only a % consumed, never $/credit math), move exact $ cost visibility to a super-admin-only surface, rework the top-up purchase flow to dollar packs with auto-top-up, and give the super admin an audited way to enter a tenant's live app view for support plus a properly paginated/searchable/filterable Companies admin screen. Source: [SEED-039](seeds/SEED-039-usage-progress-bar-dollar-topup.md) + [SEED-040](seeds/SEED-040-super-admin-tenant-impersonation-companies-overhaul.md).

> **Numbering:** continues the GLOBAL phase counter. v4.14 ended at Phase 149. **v4.15 starts at Phase 150.** Do NOT reset to 1. Phase 1001 (SEO, shipped out-of-band via quick-tasks) is NOT part of this counter.
>
> **Coverage:** 13/13 v4.15 requirements mapped (CREDITUI-03..07, SUPPORT-01..04, ADMINCO-01..04). No orphans. Mapping: ADMINCO-01/02/03/04 → 150, SUPPORT-01/02/03/04 → 151, CREDITUI-03/04/05 → 152, CREDITUI-06/07 → 153.
>
> **Locked scope guardrails (do NOT plan against):** No new credit ledger — the `credit_ledger`, markup math, and low-balance logic from SEED-035/CREDITUI-01/02 (Phase 115) stay exactly as they are; this milestone is the UI + purchase-flow layer on top. Tenants NEVER see a raw credit count or a $ figure anywhere (Plans page, topbar chip, notifications) — only a % bar and qualitative low/critical states. Exact $ cost visibility is super-admin-only, extending the existing `measured-cost-card.tsx` pattern — never exposed to a tenant, even indirectly via a network payload a tenant page fetches. Top-up pack sizes and auto-top-up thresholds are configurable in `billing_config`, never hardcoded (the SEED-035 "everything configurable" principle). Support Mode is NOT a real identity switch — it is a signed, time-boxed "acting-as-company" session claim layered on the admin's own session, RLS-safe, revocable, never persisted beyond the browser session. Support Mode ≠ `HandoffButton` (Phase 149) — the two must not be conflated or merged; Support Mode is a live, audited, admin-eyes-only viewing capability, while `HandoffButton` sends a real owner-invite email to transfer a demo account to a prospect. Every Support Mode session is audit-logged via the existing `lib/admin/audit-log.ts` (who, which company, when, how long).

### Phases

- [x] **Phase 150: Companies Admin Screen Overhaul** — Add search (name/email), filters (tier, AI model override set, demo vs. real account), and server-side pagination with a visible total count to `app/admin/companies/page.tsx`, while the existing "Demo Accounts" grouping, `HandoffButton`, and "Configure →" per-row actions continue to work unchanged. No dependency on the credit/billing track — this phase also becomes the stable list UI that Support Mode (Phase 151) launches from. (ADMINCO-01, ADMINCO-02, ADMINCO-03, ADMINCO-04)
 (completed 2026-07-05)
- [x] **Phase 151: Super-Admin Support Mode (Tenant Impersonation)** — From the Phase 150 Companies screen, the super admin enters a tenant-scoped app view ("Support Mode") for any company without needing the tenant's credentials, via a signed, time-boxed "acting-as-company" session claim (not a real identity switch); every page shows a persistent banner identifying the acting admin and the viewed company; every session (entry, company, admin identity, duration, exit) is recorded in the existing admin audit log; access respects existing RLS and is automatically revoked on session end/expiry. (SUPPORT-01, SUPPORT-02, SUPPORT-03, SUPPORT-04)
 (completed 2026-07-05)
- [x] **Phase 152: Usage Progress Bar + Super-Admin Cost Visibility** — Replace the tenant-facing raw numeric "N credits" display (Settings > Plans + the topbar credit chip) with a single color-escalating % bar; no tenant surface (page, chip, low-balance copy) shows a raw credit count or $ figure anywhere; the super admin gains a per-company view of exact credit balance, real USD cost, and applied markup, extending the existing `measured-cost-card.tsx` pattern and never renderable by a tenant session. Independent of the admin-support track — a pure display change on top of the existing SEED-035 ledger. (CREDITUI-03, CREDITUI-04, CREDITUI-05)
 (completed 2026-07-05)
- [x] **Phase 153: Dollar-Pack Top-Up + Auto-Top-Up** — Rework the top-up purchase flow so the tenant buys credits by choosing a dollar amount ($20/$50/$100, sizes configurable in `billing_config`) charged via a Stripe one-time checkout and converted to credits using the existing markup/denomination; add optional auto-top-up (configurable dollar threshold + purchase amount + saved default payment method), mirroring Anthropic Console's Auto Top-Up UX. Builds on Phase 152's progress-bar surface (the top-up entry point lives next to the usage bar) and is the riskiest phase (Stripe checkout rework) — sequenced last. (CREDITUI-06, CREDITUI-07)
 (completed 2026-07-05)

## ✅ v4.16 Admin Inbox Consolidation (Phases 154-155) — SHIPPED 2026-07-06

Full phase details archived: [milestones/v4.16-ROADMAP.md](milestones/v4.16-ROADMAP.md)

**Milestone Goal:** Consolidate the three scattered super-admin WhatsApp surfaces (`/admin/whatsapp` conversations+accounts, `/admin/whatsapp-templates`, and the `/admin/integrations/whatsapp` credentials) into a single coherent **Inbox** — one nav item, a two-pane master-detail conversation viewer (list + thread on the same page, Xphere-style, replacing the drawer overlay), and an Inbox "Settings" area folding in Accounts + Templates. Read-only; credentials stay in Integrations. Design reference: the Xphere inbox at `C:\Users\Vanildo\Dev\xphere` (same stack — Next + shadcn + Tailwind + Supabase).

> **Numbering:** continues the GLOBAL phase counter. v4.15 ended at Phase 153. v4.16 starts at Phase 154.
>
> **Coverage:** 4/4 v4.16 requirements mapped (INBOX-01, INBOX-02, INBOX-03, INBOX-04). No orphans, no duplicates.
>
> **Locked scope guardrails:** Read-only Inbox — visualize conversations, NEVER reply/send (two-way replies deferred to INBOXX-01). Inbox = operations (conversations + Accounts + Templates); Integrations = credentials, unchanged. Layout = two-pane master-detail, NOT a modal drawer. User-facing rename ONLY — the data layer (`lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp*.ts`) and DB tables (`whatsapp_*`) keep their WhatsApp names.

### Phases

- [x] **Phase 154: Inbox Route Consolidation & Settings** — Collapsed the two super-admin nav items ("WhatsApp" + "WA Templates") into a single **Inbox** item; renamed the route `/admin/whatsapp` → `/admin/inbox` while initially preserving the existing table + right-side `Sheet` UI (low-risk structural move); added redirect stubs for the two old routes; built `/admin/inbox/settings` (Accounts + Templates tabs); retargeted every hardcoded path reference; left Integrations credentials and internal `whatsapp_*` naming untouched; updated all affected test files. (INBOX-01, INBOX-03, INBOX-04) (completed 2026-07-05)
- [x] **Phase 155: Inbox Master-Detail Viewer** — Replaced the table + right-side `Sheet` overlay with a two-pane master-detail layout: Xphere-style conversation list on the left, conversation thread on the right pane on the same page; selection via shallow `?conversation=<id>`, SSR deep-link, empty-state, mobile single-column collapse with back affordance; e2e spec updated for the new two-pane. (INBOX-02) (completed 2026-07-06)

## ✅ v4.17 Admin Polish & Credit UX Compliance (Phases 156-159) — SHIPPED 2026-07-06

Full phase details archived: [milestones/v4.17-ROADMAP.md](milestones/v4.17-ROADMAP.md)

**Milestone Goal:** Fix a real regression against a locked v4.15 decision (tenant-facing surfaces still leak raw credit numbers), then polish the super-admin experience — clearer navigation with sensible grouping, better naming for two features the owner flagged as confusing, a credit-model-centric admin Billing page, and a visually premium Inbox redesign matching the rest of the admin's Phase-71 glassmorphism design system.

> **Numbering:** continues the GLOBAL phase counter. v4.16 ended at Phase 155. v4.17 starts at Phase 156.
>
> **Coverage:** 15/15 v4.17 requirements mapped (CREDITFIX-01..03, NAV-01..03, NAMING-01..02, BILLADMIN-01..03, INBOX-05..08). No orphans, no duplicates.
>
> **Locked scope guardrails:** No new backend/ledger logic — 100% reuse of existing v4.7/v4.15 credit functions. User-facing renames only (Legal Pages→Pages, Support Mode→View as Company) — internal naming, public routes, DB tables, audit-log literals, cookie names all unchanged.

### Phases

- [x] **Phase 156: Tenant Credit UX Compliance Fix** — Eliminated 3 confirmed raw-credit-number leaks on `/settings/billing`, added a real visual progress bar to the topbar `CreditChip`, and reconciled `TierCardsGrid`'s pricing/features against `billing_config`/`lib/entitlements.ts`. Highest priority — repaired a violated v4.15 locked decision. (CREDITFIX-01, CREDITFIX-02, CREDITFIX-03) (completed 2026-07-06)
- [x] **Phase 157: Admin Nav Reorg & Naming Fixes** — Reordered the super-admin sidebar (Dashboard/Companies/Inbox first), built a new "Content" grouped-nav pattern, renamed "Legal Pages"→"Pages" (incl. slug), tenant Settings "Message"→"Message Template", and super-admin "Support Mode"→"View as Company" — all user-facing copy only. (NAV-01, NAV-02, NAV-03, NAMING-01, NAMING-02) (completed 2026-07-06)
- [x] **Phase 158: Admin Billing Page Credit-Model Overhaul** — Replaced the admin `/admin/billing` page's tier/MRR-first view with a credit-model-centric view per company (credit balance, real AI cost, effective markup), keeping force-tier/grant-credits as secondary actions; replaced the hardcoded MRR math with a real aggregated cost summary. (BILLADMIN-01, BILLADMIN-02, BILLADMIN-03) (completed 2026-07-06)
- [x] **Phase 159: Inbox Visual Redesign — "Premium Xtimator"** — Applied the Phase-71 glassmorphism design system to the v4.16 Inbox: deterministic-color initials avatars, glass-surface list rows + thread pane, a visually rich unread accent system, and matching glass treatment on the Inbox Settings sub-page. (INBOX-05, INBOX-06, INBOX-07, INBOX-08) (completed 2026-07-06)

## ✅ v4.18 Estimate Document & Send Experience Refresh (Phases 160-163) — SHIPPED 2026-07-09

**Milestone Goal:** Give business owners full control and polish over the estimate document itself — a per-estimate settings panel, a format-first send flow with friendlier client links, mobile line-item parity with desktop, and a complete alignment/inline-editing pass on the document (including editable Bill To). Server-side math stays authoritative via `lib/estimate/compute-totals.ts` at all times — the settings panel only changes inputs/preferences, never bypasses the deterministic engine (GUARD-03 invariant carries forward unchanged). Source: SEED-041 + SEED-042 + SEED-043 + SEED-044.

> **Numbering:** continues the GLOBAL phase counter. v4.17 ended at Phase 159. **v4.18 starts at Phase 160.** Do NOT reset to 1.
>
> **Coverage:** 24/24 v4.18 requirements mapped (PUBURL-01..06, PRESENT-01..05, DOCUX-01..07, SENDHUB-01..06). No orphans, no duplicates. Mapping: PUBURL-01..06 → 160, PRESENT-01..05 → 161, DOCUX-01..07 → 162, SENDHUB-01..06 → 163.
>
> **Locked scope guardrails (do NOT plan against):** Friendly URL shape is `/estimate/{companySlug}/{estimateSlug}-{shortToken}` with `shortToken` ≥10 base62 chars from `crypto.randomBytes(...).toString('base64url')` stored in a NEW `estimates.public_slug_token` column (own unique index) — never a truncated/reused `share_token` UUID; old `/estimate/{share_token}` links keep working forever, both routes coexist permanently, no forced migration. NO new anon RLS policy on `estimates`, ever — the friendly-URL lookup mirrors `getEstimateByShareToken`'s exact service-role + exact-match posture (this exact table already shipped and reverted one anon-RLS PII leak, `20260606000002_drop_estimates_anon_select_policy.sql` — do not recreate that bug class). Non-destructive hiding is the ONLY hiding mechanism going forward — the new presentation-settings toggles never clear field content, REPLACING today's destructive `toggleField()` for Summary/Sections/Payment Terms/Timeline/Warranty/Notes (no dual system). "Tax Off" preserves the default rate — a separate enabled/disabled flag on top of the existing rate, not a mutation to `tax_rate = 0`, so re-enabling restores the original value. Section visibility is honored on ALL channels from day one — editor, both share templates (classic/modern), both PDF templates, plain-text, and WhatsApp; deferring any channel recreates the milestone's #1 structural risk (settings-drift). Coarse toggles only — no granular per-field hiding in v1 (no "show quantities but hide unit price"). No reusable settings presets/templates in v1 (per-estimate only). Client picker: switch or unlink, no inline creation in v1 — a compact popover (not a full command dialog) from a hover-reveal pencil icon beside the Bill To client name. Inline-edit affordance for the project name is a thin solid underline on hover/focus (replacing the dotted underline), reconciled with `ProjectTitle`'s validation/error-retry behavior; the Bill To block gets a pencil icon instead (a different entity-switch action, not inline text edit). Mobile line-item editor stays fully inline-editable (no collapse-behind-expand); existing 44px touch targets are preserved even as visual density increases. `estimate_deliveries` gains explicit `format` + widened `channel` columns (mirroring the existing `20260526000005` precedent) so every send/copy/open/download action is auditable, not just email/SMS sends. Send Hub always defaults to "Online Estimate" — no remembered-last-used state in v1. PDF/Plain Text via SMS/WhatsApp falls back to the Online Estimate link — no new attachment-delivery channel is built. Email/SMS/WhatsApp copy stays fixed (reuses existing `estimate_template_*` company fields) — no new per-estimate template layer. ALL new arithmetic stays server-side and deterministic — the settings panel only changes inputs/preferences read by `lib/estimate/compute-totals.ts`, never bypasses it (GUARD-03 carries forward unchanged).

### Phases

- [x] **Phase 160: URL Contract & Public Access Security** — A shared estimate opens via a friendly branded URL (`/estimate/{companySlug}/{estimateSlug}-{shortToken}`) that coexists permanently with the existing `/estimate/{share_token}` link; the friendly lookup mirrors the existing service-role + exact-match posture (no new anon RLS policy on `estimates`); one shared path-builder replaces all 7 inline URL-construction call sites (including the 2 inside the Stripe Connect webhook), preserving the `?stripe=success`/`?stripe=canceled` redirect contract; view-logging/accept-decline and the custom-domain white-label behavior are verified identical regardless of which URL was used. (PUBURL-01, PUBURL-02, PUBURL-03, PUBURL-04, PUBURL-05, PUBURL-06)
 (completed 2026-07-08)
- [x] **Phase 161: Presentation Settings Data Model & Persistence** — Every estimate gets a persisted, dormant-first `presentation_settings` JSONB record (NULL = today's fully-visible behavior) covering section visibility, plus independent per-estimate Tax/Discount/Deposit overrides; one pure resolver module is the sole place that decides visibility; hiding a section never deletes its content; a non-blocking notice appears when editing settings on an already-sent/viewed estimate. (PRESENT-01, PRESENT-02, PRESENT-03, PRESENT-04, PRESENT-05) (completed 2026-07-08)
- [x] **Phase 162: Estimate Document Consolidated Pass** — A gear icon on the floating Photos/Send pill opens a Pricing/Sections/Client Presentation settings panel; the Bill To block becomes hover-to-edit via one consolidated client-picker component (replacing 4 existing implementations); the project name's inline-edit affordance is reconciled with `ProjectTitle`; a full alignment pass removes spacing/offset inconsistencies across the document; the mobile line-item editor matches the desktop document-native table language; two confirmed-dead components are removed. Internally sequenced 3a (client-picker/alignment) → 3b (settings UI wiring) → 3c (mobile parity) since 3 of 4 seeds touch the same `estimate-document.tsx` file. (DOCUX-01, DOCUX-02, DOCUX-03, DOCUX-04, DOCUX-05, DOCUX-06, DOCUX-07)
 (completed 2026-07-08)
- [x] **Phase 163: Format-First Send Hub & Cross-Surface Settings Rollout** — Clicking Send opens a hub organized around Online Estimate (default)/PDF/Plain Text, each with its own delivery actions, replacing the channel-first Email/SMS tabs and the separate Share & Export menu; PDF/Plain Text via SMS/WhatsApp falls back to the Online Estimate link; `estimate_deliveries` gains `format` + a widened `channel`; the Phase 161 settings resolver is wired into every remaining render/format path (both PDF templates, both share templates, plain-text, WhatsApp) and proven identical by a cross-surface test; Mark as Sent + language selection remain as secondary actions. (SENDHUB-01, SENDHUB-02, SENDHUB-03, SENDHUB-04, SENDHUB-05, SENDHUB-06) (completed 2026-07-08)

### Phase Details — v4.18 Estimate Document & Send Experience Refresh

### Phase 160: URL Contract & Public Access Security

**Goal**: A shared estimate can be opened via a short, friendly, branded URL that coexists permanently with the existing token-based link — with zero regression to security posture, view-logging, accept/decline behavior, or the Stripe Connect redirect contract for any link already sent to a real client.
**Depends on**: Nothing (first phase of the milestone; file-disjoint from Phase 161 — could run in parallel with it). Reuses the existing `getEstimateByShareToken` service-role + exact-match pattern (`lib/queries/share.ts`) and the existing `slugify()` idiom (`blog_posts.slug`).
**Requirements**: PUBURL-01, PUBURL-02, PUBURL-03, PUBURL-04, PUBURL-05, PUBURL-06
**Success Criteria** (what must be TRUE):

  1. A shared estimate opens correctly via both the new friendly URL (`/estimate/{companySlug}/{estimateSlug}-{shortToken}`, generated for every existing and new estimate) and the legacy `/estimate/{share_token}` URL, with identical view-logging and identical accept/decline behavior regardless of which URL was used to reach it
  2. Every estimate link already sent to a real client before this phase shipped keeps working completely unchanged — same expiration via `share_expires_at`, no broken bookmarks, no forced migration
  3. A test proves the new friendly-route lookup uses the exact same service-role + exact-match posture as `getEstimateByShareToken` — no new `anon`-accessible RLS policy is added to `estimates` under any condition (this table already shipped and reverted one anon-RLS PII leak, `20260606000002`)
  4. One shared isomorphic path-builder is the sole source of estimate share URLs across the codebase — all 7 existing inline URL-construction call sites (including the 2 inside the Stripe Connect webhook) are replaced by it, and the `?stripe=success`/`?stripe=canceled` redirect contract is verified unbroken after a Stripe Connect payment
  5. The existing custom-domain white-label behavior (SEED-009) is confirmed compatible with the new friendly route through direct verification — or, if the underlying `x-white-label` header logic is found dead, that finding is documented rather than assumed working

**Plans:** 5/5 plans complete
Plans:
- [x] 160-01-PLAN.md — Schema migration (companies.slug + estimates.public_slug_token) + lib/estimate/public-url.ts generator/builder/parser
- [x] 160-02-PLAN.md — getEstimateByPublicToken/getShareLinkStateByPublicToken query layer + live RLS negative-regression test
- [x] 160-03-PLAN.md — New friendly-URL route (page/layout/error/loading) + live e2e parity test
- [x] 160-04-PLAN.md — Migrate all 5 inline share-URL call sites (SMS, WhatsApp x2, Stripe Connect webhook x2) to buildEstimatePublicPath + permanent no-hardcode sweep test
- [x] 160-05-PLAN.md — Wire public_slug_token into new-estimate creation + one-time idempotent backfill script for existing rows

### Phase 161: Presentation Settings Data Model & Persistence

**Goal**: Every estimate carries its own persisted presentation and pricing-override settings — section visibility (Summary, Sections, Payment Terms, Timeline, Warranty, Notes, Photos) plus independent Tax/Discount/Deposit overrides — computed by exactly one pure resolver module, with zero interaction with the deterministic totals engine and zero data loss when a section is hidden.
**Depends on**: Nothing (file-disjoint from Phase 160 — could run in parallel with it). Must land before Phase 163 (Send Hub) and before the settings-UI sub-step of Phase 162. Mirrors the existing `companies.tax_config`/`isTaxConfig()` dormant-first JSONB + type-guard pattern.
**Requirements**: PRESENT-01, PRESENT-02, PRESENT-03, PRESENT-04, PRESENT-05
**Success Criteria** (what must be TRUE):

  1. Every estimate has a persisted `presentation_settings` record (dormant-first JSONB; `NULL` = today's behavior = everything visible) covering visibility of Summary, Line Sections/Scope Details, Payment Terms, Timeline, Warranty, Notes, and Attached Photos — existing estimates render identically to today with no migration-time behavior change
  2. Toggling a section's visibility off and back on preserves its underlying generated content exactly — no content is ever deleted or cleared by the new mechanism, replacing today's destructive `toggleField()` for the same five fields (no dual hiding system)
  3. An estimate can independently override Tax (Default/Custom/Off — "Off" preserves the original rate rather than zeroing it, so re-enabling restores the exact value), Discount, and Deposit, scoped to that estimate only, without altering the company's stored defaults
  4. A single pure resolver module (`resolvePresentationSettings`/`isSectionVisible`) is the one place in the codebase that decides section visibility — a test proves no renderer reimplements its own visibility check
  5. Changing an already-sent/already-viewed estimate's presentation or pricing settings shows a non-blocking inline notice that the client has already seen the estimate

**Plans:** 2/2 plans complete
Plans:
- [x] 161-01-PLAN.md — Migration (estimates.presentation_settings JSONB) + lib/estimate/presentation-settings.ts pure resolver (TDD) + unit tests (PRESENT-01..05)
- [x] 161-02-PLAN.md — Thread PresentationSettings type through Estimate query interface, saveEstimate() pass-through, and the editor reducer (PRESENT-01, PRESENT-03)

### Phase 162: Estimate Document Consolidated Pass

**Goal**: The estimate document itself is fully overhauled in one internally-sequenced pass — a gear-triggered settings panel wired to the Phase 161 model, in-canvas Bill To editing through one consolidated client picker, a reconciled project-name inline-edit affordance, a full alignment pass, and mobile line-item parity with desktop — since 3 of the 4 seeds touch the same 2018-line `estimate-document.tsx` file.
**Depends on**: Phase 161 (the settings model the gear-panel UI wires into for its 3b sub-step). Internally sequenced 3a (client-picker consolidation + alignment pass) → 3b (settings UI wiring) → 3c (mobile parity, verified against the final desktop state) — not parallelized across sub-steps.
**Requirements**: DOCUX-01, DOCUX-02, DOCUX-03, DOCUX-04, DOCUX-05, DOCUX-06, DOCUX-07
**Success Criteria** (what must be TRUE):

  1. A gear icon on the left side of the floating `Photos / Send` pill opens a settings panel (a popover on desktop, a bottom sheet on mobile) exposing the Pricing, Document Sections, and Client Presentation controls from Phase 161
  2. The `Bill To` block is editable in place — hovering/focusing it in edit mode reveals a pencil icon that opens a compact popover to search/switch the linked client or unlink it — powered by one consolidated client-picker component that replaces `LinkClientInline`, `LinkClientButton`, `LinkClientCard`, and the 4th implementation inside `estimate-document.tsx`, reused everywhere a client can be linked
  3. The project name's inline-edit affordance shows a thin solid underline on hover/focus (replacing the dotted/serrated underline) and reconciles with `ProjectTitle`'s validation/error-retry behavior
  4. The full document — company header, estimate title band, project/bill-to grid, summary, section headers, and line-item table — shows no accidental spacing/offset inconsistencies, verified on both desktop and mobile against the same estimate; the mobile line-item editor at 360px/390px/430px matches the desktop document-native table language (no standalone glass card) with no text clipping and no regression to existing touch targets
  5. `section-card.tsx` and `item-row.tsx` are removed from the codebase with no remaining imports

**Plans:** 5/5 plans complete
Plans:
- [x] 162-01-PLAN.md — Wave 0 test scaffolding (7 test files, 63 it.todo markers) unblocking RED->GREEN cycles for DOCUX-01..07
- [x] 162-02-PLAN.md — Consolidated ClientPicker (4 variants) + call-site swap; delete link-client-{button,card}.tsx; DocumentClient.id plumbing (DOCUX-03)
- [x] 162-03-PLAN.md — Bill To pencil affordance + InlineProjectName reconciliation + full alignment pass (SECTION_PX + unified vertical rhythm) + regenerated share visual baselines (DOCUX-02, DOCUX-04, DOCUX-05)
- [x] 162-04-PLAN.md — PresentationSettingsPanel (Popover/Sheet, 3 groups, GUARD-03) + gear icon in floating pill + atomic retirement of revealed/toggleField/isFieldVisible/AddDetailsPopover with resolver-driven visibility (DOCUX-01)
- [x] 162-05-PLAN.md — Mobile line-item rebuild (doc-native transparent inputs, 44px touch targets) + delete section-card.tsx + item-row.tsx + price-badge.test.tsx (DOCUX-06, DOCUX-07)
**UI hint**: yes

### Phase 163: Format-First Send Hub & Cross-Surface Settings Rollout

**Goal**: A format-first Send hub (Online Estimate / PDF / Plain Text) fully replaces the channel-first Email/SMS tabs and separate Share & Export menu, and the Phase 161 settings resolver is wired into every remaining render/format path so a single presentation-settings toggle is honored identically everywhere a client can view the estimate — closing the milestone's #1 structural risk (settings-drift).
**Depends on**: Phase 161 (the settings resolver whose cross-surface rollout this phase completes) and Phase 160 (the friendly URL surfaced in the Online Estimate tab). File-disjoint from Phase 162, so it could start in parallel with it once Phase 161 is done.
**Requirements**: SENDHUB-01, SENDHUB-02, SENDHUB-03, SENDHUB-04, SENDHUB-05, SENDHUB-06
**Success Criteria** (what must be TRUE):

  1. Clicking `Send` opens a hub organized around three primary formats — Online Estimate (default), PDF, and Plain Text — each exposing its own delivery actions (copy/open/email/SMS/WhatsApp/download as applicable), and the old channel-first Email/SMS tabs plus the separate "Share & Export" menu are gone
  2. Sending PDF or Plain Text via SMS/WhatsApp falls back to delivering the Online Estimate link — no new attachment-delivery channel is built
  3. Every send/copy/open/download action is recorded in `estimate_deliveries` with both `format` (online_link/pdf/plain_text) and the widened `channel` (email/sms/whatsapp/copy/open/download/manual)
  4. Toggling a single presentation-settings option produces identical section visibility across all 6 render/format outputs (classic PDF, modern PDF, classic share, modern share, the plain-text template, and the WhatsApp formatter) — proven by a dedicated cross-surface verification test, not just the editor preview
  5. `Mark as Sent` and language selection remain available in the new Send hub as secondary actions, visually subordinate to the three primary format choices

**Plans**: TBD
**UI hint**: yes

## ✅ v4.19 Integrity & Reliability Hardening (Phases 164-170) — SHIPPED 2026-07-17

**Milestone Goal:** Close every finding from the 2026-07-17 six-track adversarial deep audit of the estimate generation & editing system ([audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md)) — restoring the legal contract (what was signed stays what was signed), the financial contract (what you see is what saves; what you pay matches what you use), and the capture contract (your recording never gets lost). Pure hardening: no new AI features. The audit doc is required reading for every phase plan; its "Verified strengths" section is a regression contract (Inngest durability, GUARD-03 server math, price-research evidence gate, prompt-injection hardening, cross-tenant scoping must not be weakened).

**Sequencing:** 164 → 165 are strictly sequential (both rewrite `lib/actions/estimate.ts` — the freeze guard lands first as a pre-check, then the atomic RPC absorbs it). 166, 167, 168, 169 are file-disjoint from 164/165 and from each other (166: `lib/ai/providers/*`; 167: transcribe/billing; 168: analyze-photos/vision; 169: capture client/storage) — parallelizable in any combination. 170 depends on 165 (the apply/merge logic builds on the temp-id remap). Note one light contention: 166's AIREL-04 and 168's PHOTO-01 both touch `lib/services/generate-estimate.ts` — coordinate or sequence those two plans.

### Phase 164: Sign/Send Trust Boundary

**Goal**: A delivered estimate is tamper-evident and tamper-proof — what the client signed is immutably captured and is what every surface renders afterward, in-place edits to sent/signed/responded estimates are rejected server-side with a "Create new version" path forward, and every content edit is visible in the audit trail.
**Depends on**: Nothing. Must land before Phase 165 (both touch `lib/actions/estimate.ts`; the freeze guard added here is absorbed into the 165 RPC).
**Requirements**: TRUST-01, TRUST-02, TRUST-03
**Success Criteria** (what must be TRUE):

  1. After a client signs, editing the estimate through ANY surface (editor save, refine, direct server-action/RPC call) is rejected with a typed `estimate_locked` error — and the public share page + PDF continue to render the exact signed content (sections, items, totals) from the immutable snapshot stored at signing time
  2. The owner attempting to edit a sent/signed/responded estimate is offered "Create new version" and that path works — the new draft version is editable while the delivered version and its share link remain intact
  3. Presentation-settings changes (v4.18 gear panel) remain allowed on delivered estimates — the freeze locks priced content, not display preferences
  4. Every content-changing save writes an `estimate_updated` row to `estimate_activity`, visible in the estimate's activity trail
  5. A regression test proves the pre-freeze behavior for drafts is unchanged: a never-sent draft saves exactly as today

**Plans**: 2 — 164-01 COMPLETE 2026-07-17 (TRUST-01: signature snapshot capture + share/PDF render-from-snapshot, see [164-01-SUMMARY.md](phases/164-sign-send-trust-boundary/164-01-SUMMARY.md)); 164-02 COMPLETE 2026-07-17 (TRUST-02/03: freeze-on-send/sign guards in saveEstimate + refine route, estimate_updated activity emission, editor lock UX + presentation-settings carve-out, see [164-02-SUMMARY.md](phases/164-sign-send-trust-boundary/164-02-SUMMARY.md)). **Phase 164 COMPLETE.**

### Phase 165: Atomic Save & Version Authority

**Goal**: Saving an estimate is a single atomic transaction with server-enforced version authority — partial writes, false-conflict session poisoning, stranded keystrokes, temp-id churn, silent writes to superseded versions, unbounded inputs, and preview/total divergence are all structurally impossible.
**Depends on**: Phase 164 (same file; the RPC absorbs the freeze guard).
**Requirements**: SAVE-01, SAVE-02, SAVE-03, SAVE-04, SAVE-05, SAVE-06, SAVE-07
**Success Criteria** (what must be TRUE):

  1. A save that fails at any point leaves the estimate byte-identical to before the attempt (single RPC transaction), and a subsequent save from the same session succeeds — the audit's session-poisoning scenario (transient failure → false "changed elsewhere" → forced discard) can no longer occur
  2. A stale tab holding a superseded version cannot write to it: the server rejects non-current writes, and the supersede flip bumps `updated_at` via trigger so the optimistic check also fails closed
  3. After a successful save the editor holds server-assigned ids and server-computed totals — saving twice in a row produces zero row churn (verified by row-id stability), and a keystroke typed during an in-flight save leaves the editor dirty and re-saves
  4. On a genuine two-tab conflict, autosave pauses, exactly one non-stacking notice appears, and the resolution path lets the user keep their edits (no forced destructive reload)
  5. Negative quantity/unit-price/discount/cost/markup are rejected server-side, and the editor's displayed grand total equals the persisted total for the same inputs in every tax mode (flat and per-category `tax_config`), with the `taxable` toggle doing something visible in both

**Plans**: 2 of 2 — **Phase 165 COMPLETE 2026-07-17.** 165-01 (SAVE-01/02/06/07-server: `save_estimate_atomic` SECURITY INVOKER RPC folding the lock/is_current/compare-and-set guards + all section/item upserts + orphan deletes + project total into one transaction, `trg_estimates_set_updated_at` version-authority trigger, zod negative-value bounds + realistic caps, flat-tax-path `taxable` fix, see [165-01-SUMMARY.md](phases/165-atomic-save-version-authority/165-01-SUMMARY.md)). 165-02 (SAVE-03/04/05 + SAVE-07's client half: `MARK_SAVED` remaps temp-ids from the RPC's `id_map`, adopts server-computed totals, gates `isDirty` clearing on a monotonic `editEpoch`; the reducer's flat-tax preview now honors per-line `taxable` + discount proration matching the server; a `conflictPending` latch pauses autosave with a non-destructive "Reload latest"/"Keep my changes" resolution, and `estimate_not_current` is handled as a terminal lock-like state — see [165-02-SUMMARY.md](phases/165-atomic-save-version-authority/165-02-SUMMARY.md)). SAVE-01..07 all shipped.

### Phase 166: AI Reliability & Output Integrity

**Goal**: The generation path cannot hang, cannot silently truncate, asks the primary provider for the full pricing schema, refuses internally-inconsistent output, and produces deterministic prices run-to-run.
**Depends on**: Nothing (file-disjoint from 164/165). Light contention with Phase 168 on `lib/services/generate-estimate.ts` (AIREL-04 vs PHOTO-01) — coordinate those plans.
**Requirements**: AIREL-01, AIREL-02, AIREL-03, AIREL-04, AIREL-05
**Success Criteria** (what must be TRUE):

  1. Every AI fetch (primary generation `openrouter.ts`, needs-details, both price-research web adapters) aborts on a bounded timeout, proven by a test that a hung upstream triggers the Gemini fallback instead of pinning the job
  2. A length-truncated generation surfaces as a distinct typed error (finish_reason read) driving a targeted retry — and a large 40+ item estimate generates completely within the raised token ceiling
  3. On the primary OpenRouter path, generated items carry `taxable`/`tax_category`/`cost`/`markup_pct` when applicable — per-category tax and cost+markup no longer require the Gemini fallback
  4. An estimate with duplicate lines, qty-0-priced lines, or a total above the configurable ceiling is not silently persisted — it is flagged or routed to needs-details, with the discrepancy visible
  5. Generation runs at a pinned low temperature on both providers; two runs on identical input produce materially consistent pricing

**Plans**: 2 — 166-01 COMPLETE 2026-07-17 (AIREL-01/02/03/05: 120s/300s AbortSignal timeouts on every AI fetch, a typed `TruncatedOutputError` on `finish_reason==='length'`, the primary OpenRouter tool schema now requests `taxable`/`tax_category`/`cost`/`markup_pct`, both providers pinned to temperature 0.3 with symmetric 8192-token budgets, see [166-01-SUMMARY.md](phases/166-ai-reliability-output-integrity/166-01-SUMMARY.md)); 166-02 COMPLETE 2026-07-17 (AIREL-04: a deterministic post-generation consistency gate — exact-duplicate collapse, qty-0-with-price flags, a configurable absurdity ceiling — routing over-ceiling estimates through the existing non-destructive `awaiting_details` path, see [166-02-SUMMARY.md](phases/166-ai-reliability-output-integrity/166-02-SUMMARY.md)). **Phase 166 COMPLETE.**

### Phase 167: Billing & Cost Integrity

**Goal**: Every AI operation is correctly gated, correctly priced from server-derived facts, charged exactly once, and attributed to the provider that actually served — the duration exploit, the unmetered refine path, the dead photo cost roll-up, and retry double-spend are all closed.
**Depends on**: Nothing (file-disjoint; parallelizable with 166/168/169).
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06
**Success Criteria** (what must be TRUE):

  1. A zero-balance company is blocked from refine with the same 402 + upgrade affordance as generation
  2. Declaring a 1-second duration on a 10-minute upload results in cost/debit computed from the server-derived duration (Whisper-reported or byte-clamp), not the declared value — the audit's "one credit funds unlimited transcription" exploit no longer works
  3. Vision cost rows carry the real attemptId/companyId/projectId and the photo-batch credit debit records actual summed cost (no more permanently-null read-backs)
  4. A user Retry after a generate-stage failure does not re-call Whisper when a transcript already exists, and `ai_cost_events` cannot hold duplicate rows for the same attempt+operation (unique index); fallback-served transcriptions are attributed to the provider that served
  5. Per-plan audio-minute limits are enforced against server-derived duration (or the dead entitlement is removed with a documented decision) — total transcription spend per plan is bounded

**Plans**: 2 — 167-01 COMPLETE 2026-07-17 (BILL-01/02/04/05/06: refine credit gate, server-derived audio duration + entitlement enforcement, transcribe retry short-circuit + provider attribution + cost-event dedup, see [167-01-SUMMARY.md](phases/167-billing-cost-integrity/167-01-SUMMARY.md)); 167-02 COMPLETE 2026-07-17 (BILL-03: analyzePhotoOR's per-photo call threads `{ attemptId, companyId, projectId }` so vision cost rows and the photo-batch credit-debit read-back record real cost, see [167-02-SUMMARY.md](phases/167-billing-cost-integrity/167-02-SUMMARY.md)). **Phase 167 COMPLETE.**

### Phase 168: Photo Pipeline Fidelity

**Goal**: Every photo the user captured informs the estimate — captions included, all photos analyzed with visible coverage truth, one bad photo never kills the batch, and no description is silently truncated.
**Depends on**: Nothing (file-disjoint; parallelizable). Light contention with Phase 166 on `lib/services/generate-estimate.ts`.
**Requirements**: PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-04
**Success Criteria** (what must be TRUE):

  1. A caption typed on a photo ("north wall, 12ft ceiling") demonstrably appears (sanitized) in the generation prompt context and can influence the estimate
  2. A 35-photo project gets all 35 photos analyzed (chunked batching), and when coverage is partial the user sees "N of M photos analyzed"; unanalyzed photos can be re-analyzed without re-charging analyzed ones
  3. A batch with one corrupt photo completes with the survivors (skip-and-continue), generates the estimate, and reports the skipped photo — the job hard-fails only when zero photos succeed
  4. No vision description is persisted mid-sentence-truncated: finish_reason is checked, and primary + Gemini fallback produce comparable-length descriptions under equivalent caps

**Plans**: 2 — 168-01 COMPLETE 2026-07-17 (PHOTO-02 backend/PHOTO-03/PHOTO-04: full-coverage chunked photo analysis replacing the 20-photo cutoff, skip-and-continue failure policy, vision truncation handling + cap parity, see [168-01-SUMMARY.md](phases/168-photo-pipeline-fidelity/168-01-SUMMARY.md)); 168-02 COMPLETE 2026-07-17 (PHOTO-01: user captions folded into the generation prompt through the existing sanitizeField boundary; PHOTO-02 UI half: "N of M photos analyzed" threaded from the journal into the capture processing overlay, see [168-02-SUMMARY.md](phases/168-photo-pipeline-fidelity/168-02-SUMMARY.md)). **Phase 168 COMPLETE.**

### Phase 169: Capture & Upload Resilience

**Goal**: The moment of capture is protected end-to-end — transient network failures retry themselves, the recording survives a failed upload or accidental close via local persistence with resume, orphaned storage is reconciled, and the offline/draft UX stops lying.
**Depends on**: Nothing (file-disjoint; parallelizable).
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05
**Success Criteria** (what must be TRUE):

  1. A simulated network flap during audio/photo upload recovers automatically via backoff retry without user action; only exhausted retries surface an error
  2. Closing the tab during upload/dispatch triggers an unsaved-work warning; after an upload failure or accidental close, reopening the capture surface offers "Resume upload" from the locally-persisted blob, and completing it produces a normal estimate
  3. The IndexedDB persistence fails soft (private mode / iOS eviction) — capture still works exactly as today when local storage is unavailable
  4. A scheduled reconciliation removes storage objects with no DB row (audio AND photos buckets), including the out-of-credits orphan path, without ever touching objects that have rows
  5. The false "showing cached data" banner is gone (or truthful), and a text draft typed in ANY of the three capture flows survives closing and reopening that flow

**Plans**: 2 — 169-01 COMPLETE 2026-07-17 (CAPT-01/02/03/05: upload retry wrapper with exponential backoff on both call sites, IndexedDB persist-before-upload with a "Resume upload / Discard" recovery card, `beforeunload` extended across the full upload/dispatch window, honest offline copy + drafts persisting in all three capture flows, see [169-01-SUMMARY.md](phases/169-capture-upload-resilience/169-01-SUMMARY.md)); 169-02 COMPLETE 2026-07-17 (CAPT-04: scheduled daily reconciliation sweeping row-less storage objects in both the audio and photos buckets, including the out-of-credits orphan path, see [169-02-SUMMARY.md](phases/169-capture-upload-resilience/169-02-SUMMARY.md)). **Phase 169 COMPLETE.**

### Phase 170: Refine Safety & Review

**Goal**: AI refinement is a reviewable, non-destructive operation — it always refines what the user is looking at, presents its changes for review before touching the document, and preserves the identity of untouched rows.
**Depends on**: Phase 165 (apply/merge builds on the temp-id remap and RPC save).
**Requirements**: REFINE-01, REFINE-02
**Success Criteria** (what must be TRUE):

  1. Opening refine with unsaved edits flushes a save first (or explicitly confirms) — the refine result always reflects the user's latest visible content, in both branches of the old race
  2. The refine result appears as a change summary (changed/added/removed lines, old→new prices) with Apply/Discard — nothing touches the document until Apply
  3. Applying preserves ids/created_at of rows the refinement didn't change (verified by row-id stability across a refine that touches one line); only genuinely new rows insert
  4. Refine remains preview-only server-side (no persistence before Apply+save), and the refine credit gate from Phase 167 is verified still in place end-to-end

**Plans**: 1 — 170-01 COMPLETE 2026-07-17 (REFINE-01/02: shared pure `mergeRefinement` util with two-pass item matching (exact normalized-description, then similarity-guarded positional pairing of leftovers) replacing the blanket temp-id regeneration; `onBeforeRefine` flush-before-refine gate; a post-POST review screen (changed/added/removed + field-level flags) with Apply/Discard, see [170-01-SUMMARY.md](phases/170-refine-safety-review/170-01-SUMMARY.md)). **Phase 170 COMPLETE.**

## ✅ v4.20 Structured Photo Extraction (Phase 171) — SHIPPED 2026-07-17

**Milestone Goal:** Photo analysis produces typed, structured intelligence — a vision tool-call extraction (surfaces, measurements with units + confidence, materials, damage, trade signals) persisted per photo in `photos.ai_extraction` JSONB and serialized compactly into the generation prompt, so measurement-heavy trades get quantities as data instead of prose. Design: v4.19 audit § E5 (FUT-02). All v4.19 photo-pipeline semantics (chunked coverage, skip-and-continue, N-of-M, checkpointing, captions, costContext) are regression contracts.

### Phase 171: Structured Photo Extraction

**Goal**: A job-site photo's measurements, surfaces, materials and damage reach the estimator as validated, typed data — with graceful prose fallback at every failure point, provider parity, and full cost attribution.
**Depends on**: Nothing (v4.19 fully shipped). Internally: 171-01 (schema+migration) → 171-02 (providers+worker) ∥ 171-03 (prompt serialization) — 02 and 03 are file-disjoint and parallelizable after 01.
**Requirements**: PEXT-01, PEXT-02, PEXT-03, PEXT-04, PEXT-05
**Success Criteria** (what must be TRUE):

  1. A measurement-heavy photo produces a persisted structured extraction (measurements with units + confidence) AND its ai_description (from overall_description) renders unchanged on every existing surface (share, PDF, prompt fallback)
  2. The generation prompt for an extracted photo contains the compact measurements/materials/damage block, sanitized through the existing sanitizeField path; a prose-only photo's prompt output is byte-identical to today
  3. A failing/invalid/truncated structured call degrades that photo to the prose pipeline with zero user-visible failure, and PHOTO_STRUCTURED_EXTRACTION=off reverts the whole feature byte-identically — chunked coverage, skip-and-continue, N-of-M and checkpointing provably intact in both modes
  4. Both providers produce the same schema through one zod gate, locked by a parity test
  5. Structured vision calls carry the job costContext, their real cost is visible in ai_cost_events, and photo_batch debits keep summing correctly

**Plans**: 3 of 3 — **Phase 171 COMPLETE 2026-07-17.** 171-01 (PEXT-01: versioned `photoExtractionSchema` zod gate with the `dropInvalid` array-level element-drop preprocess, `photoExtractionToolSchema()` JSON-schema mirror, dormant `photos.ai_extraction` JSONB column, see [171-01-SUMMARY.md](phases/171-structured-photo-extraction/171-01-SUMMARY.md)). 171-02 (PEXT-03/04/05: `analyzePhotoStructuredOR` forced tool-call + `analyzePhotoStructuredGemini` functionDeclarations fallback, both through one shared `validatePhotoExtraction` zod gate with cost-ordering-before-validation; the analyze-photos worker's structured(OR)→structured(Gemini)→prose ladder gated by `PHOTO_STRUCTURED_EXTRACTION`, with every pre-existing v4.19 regression suite left byte-identical, see [171-02-SUMMARY.md](phases/171-structured-photo-extraction/171-02-SUMMARY.md)). 171-03 (PEXT-02: pure `serializePhotoContext` module folding typed extraction data into the generation prompt, byte-identical when no extraction exists, see [171-03-SUMMARY.md](phases/171-structured-photo-extraction/171-03-SUMMARY.md)). PEXT-01..05 all shipped.

## 🚧 v4.21 Notification Center (Phases 172-179) — ROADMAP CREATED 2026-07-21 (Phase 179 added 2026-07-22)

**Milestone Goal:** Unify all outbound messaging into a single admin-manageable Notification Center serving three distinct audiences — platform admins (new Telegram channel), tenants (in-app/email/WhatsApp/SMS with per-channel selection), and end customers (email/SMS only) — with every message template editable with variables from the super-admin panel instead of hardcoded copy. Three structurally-separate pipelines that never share a table: the existing tenant-scoped `notify()`, the existing platform-scoped `notifyOps()`, and a new synchronous confirmation-gated agentic-send capability. Research: `research/{SUMMARY,ARCHITECTURE,PITFALLS,STACK,FEATURES}.md`.

**Coverage:** 26/26 requirements mapped (PLAT-01..03, TMPL-01..07, TNT-01..03, CUST-01..05, AGENT-01..03, TMPLCOMP-01..05), **0 orphans, 0 duplicates.** Numbering continues the global counter — v4.20 ended at Phase 171, so v4.21 starts at **Phase 172**. Phase 179 (WhatsApp Template Composer & Meta Approval Panel) is a net-new, owner-requested extension added 2026-07-22 after Phases 172-178 shipped, pulling in the deferred FUT-01.

**Dependency spine (research-backed):** The template-engine foundation (172: schema + resolver + per-channel escaping) is the root for the editor (173), the tenant call-site sweep (174), and ALL end-customer template work (177). The end-customer consent/STOP/quiet-hours gate (176, CUST-03) is a HARD prerequisite that must land before the end-customer send path (177) and agentic send (178) ship to any real tenant. Agentic send (178) depends on the real end-customer send path (177) existing — the tool is a thin wrapper that cannot be built usefully first. The **Telegram track (175, PLAT-*) shares no code with the template-engine track and runs in parallel.** Tenant WhatsApp re-enable (TNT-03, in 174) uses the EXISTING HSM registry and is independent of the new editor. Critical path: **172 → 176 → 177 → 178.** Parallel-friendly starts: 172, 175, and 176 are file-disjoint and can begin together; 173 and 174 follow 172.

### Phases (summary checklist)

- [ ] **Phase 172: Template Engine Foundation** — DB-driven `notification_templates` + `{{var}}` resolver with per-channel escaping + DB→built-in→never-block fallback, wired into `notify()` as strictly additive (zero day-one behavior change)
- [ ] **Phase 173: Super-Admin Template Editor UI** — Notification Center admin page: browse/edit every template, per-event variable catalog + live preview, unknown-variable rejection, test-send
- [ ] **Phase 174: Tenant Notification Cutover & WhatsApp Re-enable** — sweep the 9 `notify()` call sites onto the resolver (preference matrix unchanged) + re-enable proactive tenant WhatsApp via the existing HSM registry
- [ ] **Phase 175: Telegram Platform-Event Catalog & Per-Event Toggles** — typed platform-event catalog through `notifyOps()`, admin per-event toggle matrix, `locked` critical events always deliver
- [ ] **Phase 176: End-Customer Consent, Opt-Out & Quiet Hours (hard prerequisite gate)** — `clients`-scoped consent/suppression + inbound Twilio STOP/START/HELP webhook + suppression check before every send + platform-wide quiet-hours guard
- [ ] **Phase 177: End-Customer Email/SMS Send Path & Audit Log** — friendly-from templated email + dedicated Twilio Messaging Service SMS + `customer_messages` audit table
- [ ] **Phase 178: Agentic Send** — owner asks WhatsApp assistant / MCP to message a client; confirmation-gated state machine, injection-resistant recipient resolution, per-company rate limit
- [ ] **Phase 179: WhatsApp Template Composer & Meta Approval Panel** — compose HSM body in-system with ordered {{n}} variables, submit REAL components to Meta, verify approval in-panel (webhook + on-demand GET), edit + resubmit rejected templates (owner-requested 2026-07-22, pulls in FUT-01)

### Phase Details

### Phase 172: Template Engine Foundation
**Goal**: DB-driven, super-admin-editable notification copy becomes possible with a bulletproof fallback and per-channel escaping — changing zero behavior on day one (empty table → 100% fallback to today's `copy.ts`).
**Depends on**: Nothing in-milestone (dependency root). Generalizes the already-shipped `whatsapp-registry.ts` DB→static-fallback pattern to 3 more channels and 2 scopes.
**Requirements**: TMPL-01, TMPL-06, TMPL-07
**Success Criteria** (what must be TRUE):

  1. Every existing notification event has a seeded DB template row byte-identical to today's hardcoded copy, and a CI check fails if any `EventType` lacks a template row (closes the lost-exhaustiveness gap)
  2. A stored template row renders through `notify()`, interpolating `{{variables}}` with per-channel output escaping — HTML-escape for email/Telegram HTML, plain text for SMS, sanitized (newline-stripped) ordered params for WhatsApp HSM (closing the existing `sendWhatsAppTemplate()` sanitization gap)
  3. When a template row is missing, unpublished, or a variable substitution fails, `notify()` silently falls back to the built-in `copy.ts` and never blocks or blanks the send — proven by a test that corrupts a template and asserts delivery still happens
  4. A variable value containing `<`, `>`, `&`, or `"` renders escaped in HTML channels and never injects markup — proven with a client literally named `<script>`
  5. With the `notification_templates` table empty, every notification is byte-identical to pre-milestone behavior (strictly additive rollout, zero call-site changes required)

**Plans**: 3 — 172-01 (TMPL-07: hand-rolled {{var}} interpolator + per-channel escaping module, closes the sendWhatsAppTemplate() sanitization gap), 172-02 (TMPL-01: notification_templates migration + day-one seed byte-derived from copy.ts, TypeScript-exhaustive against EventType), 172-03 (TMPL-06/07: resolveNotificationCopy() DB-first/copy.ts-fallback resolver + the additive optional copyContext seam wired into notify() — zero call-site cutover, see [172-01-PLAN.md](phases/172-template-engine-foundation/172-01-PLAN.md), [172-02-PLAN.md](phases/172-template-engine-foundation/172-02-PLAN.md), [172-03-PLAN.md](phases/172-template-engine-foundation/172-03-PLAN.md)).
**Pitfalls addressed**: #1 (lost exhaustiveness guard — seed every `EventType` + CI diff), #2 (no missing-template fallback — DB→built-in→skip, never throw/blank), #4 (HTML injection via un-escaped variable substitution — escape values not template text, two renderers by channel type)
**Research flag**: none — direct generalization of the shipped `whatsapp-registry.ts` pattern (skip `/gsd:research-phase`)

### Phase 173: Super-Admin Template Editor UI
**Goal**: A super-admin can safely browse, edit, preview, and test every message template from one platform-wide Notification Center admin page, with per-event variable whitelists that make cross-audience data leaks impossible.
**Depends on**: Phase 172 (the `notification_templates` table + variable catalog must exist). Reuses the shipped `whatsapp-templates-panel.tsx` + `admin-whatsapp-templates.ts` CRUD/server-action pattern.
**Requirements**: TMPL-02, TMPL-03, TMPL-04, TMPL-05
**Success Criteria** (what must be TRUE):

  1. Super-admin can browse and edit every template (filtered by audience, event, channel) from a Notification Center admin page
  2. The editor shows the per-event variable catalog inline (only the whitelisted variables valid for that event — never a global "insert any variable" picker) and renders a live preview with sample data before save
  3. Saving a template that references an unknown variable (not in that event's catalog) is rejected with a clear error — a template that would render `{{client_name}}` literally can never be activated
  4. Super-admin can test-send any template to themselves (email/SMS/Telegram) with sample data directly from the editor
  5. The locked tenant-neutrality invariant holds through the DB era (e.g., the `admin.bonus_credits_granted` event never exposes a raw credit-count variable) — proven by the `copy-tenant-neutrality` regression test re-pointed at the DB seed/default staying green

**Plans**: 2 plans in `.planning/phases/173-super-admin-template-editor/`

Plans:
- [ ] 173-01-PLAN.md — Data + validation layer: per-event sample-data fixtures, client-safe variable catalog, the unknown-variable rejection gate (TMPL-04, re-points CREDITUI-04 at the DB era), and requireAdmin-gated server actions (list/save/test-send) (TMPL-02, TMPL-04, TMPL-05)
- [ ] 173-02-PLAN.md — Notification Center UI: /admin/notifications browse-by-audience/event/channel page, the editor (variable chips + live preview + save + 3-target test-send), sidebar nav entry (TMPL-02, TMPL-03, TMPL-04, TMPL-05)
**Pitfalls addressed**: #5 (cross-audience data leak / CREDITUI-04-class regression — event-scoped variable whitelist, not a global picker; every save is an instant platform-wide production change so preview + test-send are load-bearing)
**Research flag**: none — direct reuse of the shipped admin-whatsapp-templates CRUD pattern (skip `/gsd:research-phase`)
**UI hint**: yes

### Phase 174: Tenant Notification Cutover & WhatsApp Re-enable
**Goal**: Every tenant notification renders through the template resolver so an admin's DB edit actually takes effect, and proactive tenant WhatsApp is switched back on — with the existing per-category channel-preference matrix untouched.
**Depends on**: Phase 172 (the call-site sweep needs the resolver's `copyContext` extension). TNT-03 (WhatsApp re-enable) is independent of the new editor — it uses the EXISTING HSM registry.
**Requirements**: TNT-01, TNT-02, TNT-03
**Success Criteria** (what must be TRUE):

  1. All existing `notify()` call sites pass a context object into `notify()` instead of pre-computing title/body inline, so an admin's DB template edit takes effect for that event (`copy.ts` survives only as the fallback source)
  2. The existing per-category channel preference matrix (in_app/email/whatsapp/sms) keeps working unchanged through the cutover — proven by the existing preference tests staying green
  3. A tenant who has opted in to WhatsApp receives proactive WhatsApp notifications again (the forced-off gate is lifted), driven by approved HSM templates from the existing registry, respecting the tenant's opt-in preference
  4. A WhatsApp send whose resolved parameter count doesn't match the approved HSM template's `variables_schema` is refused (and logged) rather than delivered garbled

**Plans**: 7 plans in `.planning/phases/174-tenant-cutover-whatsapp-reenable/`

Plans:
- [ ] 174-01-PLAN.md — buildFullCopyContext: carry-forward-(a) sparse-ctx default enrichment, mirrors copy.ts exhaustively (TNT-01)
- [ ] 174-02-PLAN.md — Email digest double-escape fix (carry-forward b): preEscaped flag on DigestEmailItem + buildDigestItem() prefers metadata.email_copy (TNT-01)
- [ ] 174-03-PLAN.md — Lift D-15 forced-off WhatsApp gate + expectedVariableCount on NotificationTemplate (variables_schema-sourced) (TNT-02, TNT-03)
- [ ] 174-04-PLAN.md — dispatch.ts wiring: per-channel copy resolution (in_app enrichment + email/sms) + metadata.email_copy stash + WhatsApp param-count guard (TNT-01, TNT-03)
- [ ] 174-05-PLAN.md — Sweep lib/quota.ts + lib/billing/credit-ledger.ts + lib/billing/connect-webhook.ts onto copyContext (TNT-01)
- [ ] 174-06-PLAN.md — Sweep the 3 AI-job Inngest functions onto copyContext (TNT-01)
- [ ] 174-07-PLAN.md — Sweep lib/whatsapp/handler.ts + app/admin/billing/actions.ts + app/estimate/[token]/actions.ts onto copyContext — completes TNT-01
**Operational gate**: WhatsApp HSM templates must be authored AND **APPROVED in Meta WhatsApp Manager** before TNT-03's proactive WhatsApp actually delivers (non-code, human/Meta-review-latency task).
**Pitfalls addressed**: #3 (WhatsApp positional `{{n}}` mismatch — the runtime count/order guard on the send path; note WhatsApp body EDITING in the new editor stays deferred to FUT-01)
**Research flag**: none — the call-site sweep is mechanical (each site already has `ctx` in scope)

### Phase 175: Telegram Platform-Event Catalog & Per-Event Toggles
**Goal**: Every platform event reaches Xtimator admins on Telegram, with a per-event admin toggle and unskippable critical alerts — extending the already-shipped `notifyOps()`/`lib/telegram/client.ts` pipeline (never routing Telegram through `notify()`).
**Depends on**: Nothing in-milestone — depends only on the already-shipped Telegram infra (`getTelegramConfig`, `sendTelegramMessage`). Parallel track, shares no code with 172-174/176-178.
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):

  1. A typed platform-event catalog (tenant signup, payment received, job failure, quota exhaustion, critical platform errors) exists as a new union distinct from the tenant-scoped `EventType`, and every cataloged platform event routes through `notifyOps()` to Telegram (sibling `notifyOps()` calls added at the 3 net-new signup/payment/quota sites alongside the 6 already covered)
  2. Super-admin can toggle each platform event's Telegram delivery on/off from the admin panel (per-event toggle matrix persisted in `platform_notification_preferences`)
  3. Events flagged `locked` (critical) always deliver to Telegram regardless of the toggle matrix
  4. Turning an event off stops its Telegram message while Sentry still records it unconditionally (the toggle gates Telegram only, never the technical record)

**Plans**: 3 plans in `.planning/phases/175-telegram-platform-events-toggles/`
Plans:

- [ ] 175-01-PLAN.md — Platform-event catalog (10-kind union, incl. distinct tenant_payment_received/subscription_payment_received) + platform_notification_preferences migration (20260721000002 — renumbered off the Phase-172 collision) + isTelegramAlertEnabled() toggle gate wired into notifyOps() (PLAT-01, PLAT-03)
- [ ] 175-02-PLAN.md — Sibling notifyOps() calls at tenant_signup/tenant_payment_received (Connect)/subscription_payment_received (platform)/tenant_quota_exhausted + revives notifyQuotaThresholds() into the live generate-estimate.ts usage path (dead since Phase 77) (PLAT-01)
- [ ] 175-03-PLAN.md — Admin per-event Telegram toggle matrix UI in /admin/integrations, parallel with 175-02 (PLAT-02)
**Pitfalls addressed**: #7 (Telegram two-way/serverless/MarkdownV2 traps — scope explicitly outbound-only, stay on `parse_mode: 'HTML'` with `formatOpsMessage` escaping, no polling/webhook; keep the single-chat model; add lightweight rate-limit/backoff so an incident burst doesn't 429 against the per-chat limit; any new Telegram secret goes in `platform_integrations`, never env)
**Research flag**: none for v1 outbound-only scope — any future two-way interactivity is a separate deeper-research phase
**UI hint**: yes

### Phase 176: End-Customer Consent, Opt-Out & Quiet Hours (hard prerequisite gate)
**Goal**: An end customer's consent state is tracked and honored so no suppressed or out-of-hours message can ever be sent by any path — the legal gate that must land before any end-customer send ships to a real tenant.
**Depends on**: Nothing in-milestone (can start early, in parallel with 172/175). Is itself a HARD prerequisite gate before Phase 177 and Phase 178.
**Requirements**: CUST-03, CUST-04
**Success Criteria** (what must be TRUE):

  1. End-customer contact records (`clients`) carry consent/suppression state — opt-in provenance, opt-out timestamp, and the consent text shown — as net-new columns (NOT a reuse of the owner-scoped `notification_preferences`)
  2. A new inbound Twilio webhook processes STOP/START/HELP keyword replies and writes them to that suppression state (there is no inbound Twilio webhook in the codebase today)
  3. A suppressed recipient can never be messaged by any path — manual or agentic — because an application-level suppression check runs before EVERY send, independent of carrier-level filtering (proven by a test asserting a STOP'd number is never dispatched)
  4. A platform-wide quiet-hours guard blocks end-customer SMS outside acceptable local hours

**Plans**: 5 plans in `.planning/phases/176-end-customer-consent-optout-quiet-hours/`
Plans:

- [ ] 176-01-PLAN.md — clients consent/suppression columns + client_message_events audit table migration + database.types.ts hand-add (CUST-03 schema foundation)
- [ ] 176-02-PLAN.md — TDD: Twilio webhook HMAC-SHA1 signature verification + STOP/START/HELP keyword classification (CUST-03 primitives)
- [ ] 176-03-PLAN.md — TDD: recipient-local-timezone derivation (state -> area code -> company state -> fail-closed) + 8am-8pm quiet-hours window check (CUST-04)
- [ ] 176-04-PLAN.md — TDD: assertSendAllowed() pre-send gate composing suppression -> consent -> quiet-hours, the one function Phase 177/178 must call before every end-customer send (CUST-03, CUST-04)
- [ ] 176-05-PLAN.md — Inbound Twilio webhook route (signature-verified, idempotent, sender-agnostic cross-company suppression fan-out, never drops an unresolved event) (CUST-03)
**Operational/legal gate**: An explicit legal/operator decision on the TCPA consent basis (transactional vs. broadened agentic content), required disclosure language, quiet-hours policy, and the **Toll-Free vs A2P 10DLC registration** path for the end-customer sending number — flagged for human sign-off, not silent resolution. (Carrier-level Twilio Advanced Opt-Out rides the dedicated Messaging Service provisioned in Phase 177; the app-level suppression built here is self-contained and does not depend on it.)
**Pitfalls addressed**: #10 (HIGH/legal — no end-customer consent/opt-out infra exists today; carrier filtering alone does not discharge the sender's own TCPA obligation)
**Research flag**: **needs deeper research during planning** — TCPA consent basis, quiet-hours enforcement, and Toll-Free vs A2P 10DLC are legal/operator decisions research could not fully resolve

### Phase 177: End-Customer Email/SMS Send Path & Audit Log
**Goal**: The system can actually send a templated email or SMS to an end customer — honestly branded as the tenant's business, on a dedicated sending number, with every send audited and gated by the Phase 176 consent/quiet-hours checks.
**Depends on**: Phase 172 (`scope='customer'` template rows) AND Phase 176 (consent/suppression gate must exist first). No end-customer copy exists anywhere today, so the resolver + consent gate are hard prerequisites, not parallel tracks.
**Requirements**: CUST-01, CUST-02, CUST-05
**Success Criteria** (what must be TRUE):

  1. The system sends a templated email to an end customer whose sender identity reads as the tenant's business (`{{business_name}} via Xtimator` friendly-from — honest, never deceptive), via a new generic `sendEmail()` primitive sibling to `sendSms()`
  2. The system sends a templated SMS to an end customer through a dedicated Twilio Messaging Service (separate from the shared owner-notification number that 6 apps share), with the tenant's business name leading the body
  3. Every end-customer message is logged in a `customer_messages` audit table (company, recipient, channel, provider, template/free-form, trigger source, status) — modeled on `estimate_deliveries`
  4. Every end-customer send passes the Phase 176 consent/suppression + quiet-hours gate before dispatch — a suppressed or out-of-hours recipient is never messaged

**Plans**: 7 plans in `.planning/phases/177-end-customer-send-path/` (3 waves)
Plans:

- [ ] 177-01-PLAN.md — TDD: symbol-harden SendPermit (mandatory hardening) + widen assertSendAllowed() for the email channel (CUST-01, CUST-02)
- [ ] 177-02-PLAN.md — customer_messages audit table migration + hand-maintained types + logCustomerMessage() writer (CUST-05)
- [ ] 177-03-PLAN.md — TDD: dedicated Twilio Messaging Service config + sendCustomerSms() primitive + admin panel field (CUST-02)
- [ ] 177-04-PLAN.md — TDD: customerEmailFrom() honest friendly-from + sendCustomerEmail() primitive (CUST-01)
- [ ] 177-05-PLAN.md — TDD: customer-scoped copy fallback + DB-first template resolver, parallel to the tenant resolver (CUST-01, CUST-02)
- [ ] 177-06-PLAN.md — TDD: sendCustomerMessage() neutral orchestrator wiring gate + primitives + resolver + audit log (CUST-01, CUST-02, CUST-05)
- [ ] 177-07-PLAN.md — legacy send-sms route migration onto the gate + dedicated Messaging Service (mandatory carry-forward) (CUST-02, CUST-05)
**Operational gate**: **Provision the dedicated Twilio Messaging Service** for end-customer SMS in the Twilio Console (separate from the shared owner-notification number) and configure it via the admin panel (`platform_integrations`, never env) with Advanced Opt-Out enabled — a non-code task that gates CUST-02 shipping to real tenants.
**Pitfalls addressed**: #6 (shared Twilio number reputation blast-radius across 6 apps — a dedicated `from`/Messaging Service for this new traffic class; explicit owner/operator sign-off on A2P scope before shipping), #4 (the shared HTML-escaping renderer also covers the least-reversible customer-facing email channel)
**Research flag**: **needs deeper research during planning** — confirm Twilio Advanced Opt-Out's exact dependency on a Messaging Service and re-verify Toll-Free/A2P pricing-timeline against the live Twilio Console before committing

### Phase 178: Agentic Send
**Goal**: The owner can ask — via the WhatsApp assistant or MCP — for Xtimator to send an SMS/email to one of their clients, with a confirmation gate, injection-resistant recipient resolution, and per-company rate limits. The milestone's highest-risk new surface: the first LLM-authored message sent to a real third party.
**Depends on**: Phase 177 (the underlying end-customer send capability must be real, not stubbed) AND Phase 176 (consent gate). Binds the same neutral `sendCustomerMessage()` from both channel adapters.
**Requirements**: AGENT-01, AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):

  1. The owner can ask the WhatsApp assistant to send an SMS or email to one of their clients; the assistant drafts the message and requires explicit owner confirmation (confirm-gated state machine mirroring `confirm.ts`, NOT `manage-tools.ts`'s immediate-write) that echoes the DB-resolved recipient and exact body before anything is sent
  2. The same send capability is exposed as an MCP tool (non-`readOnlyHint`) with the same confirmation and validation gates as the WhatsApp path
  3. The agentic recipient must resolve to an existing client of the owner's company — arbitrary phone numbers/emails are rejected, and recipient + body are re-validated server-side at send time so prompt injection cannot redirect a message; any dollar figure is sourced from server-authoritative `estimates`/`compute-totals.ts`, never LLM free text
  4. Agentic sends are rate-limited per company (companyId-scoped, not user-session-scoped), still pass the Phase 176 consent/suppression gate, and every send lands in the `customer_messages` audit log with its `source` (agentic_whatsapp/agentic_mcp)

**Plans**: 4 plans in `.planning/phases/178-agentic-send/` (3 waves)
Plans:

- [ ] 178-01-PLAN.md — TDD: agentic_send_confirmations migration + confirmation state machine (create/resolve/confirm/cancel/refuse, hash binding, multilingual confirm/cancel classifier, per-company rate limit config) (AGENT-01, AGENT-02, AGENT-03)
- [ ] 178-02-PLAN.md — TDD: lib/agent-tools/send-customer-message.ts neutral capability (recipient resolution scoped to clients, rate limit, gate-then-dispatch through Phase 177's sendCustomerMessage()) + barrel export (AGENT-01, AGENT-02, AGENT-03)
- [ ] 178-03-PLAN.md — WhatsApp adapter: draft_customer_message MANAGE tool + confirmation-echo, pending-confirmation pre-check ahead of debounce/batching and the LLM classifier (AGENT-01, AGENT-03)
- [ ] 178-04-PLAN.md — MCP adapter: draft_customer_message + send_customer_message tool pair, token-only send schema closes the injection surface (AGENT-02, AGENT-03)
**Pitfalls addressed**: #8 (no confirmation-gate precedent — use the `confirm.ts` session-state-machine shape, not immediate-write), #9 (prompt injection into recipient/amount — resolve `to` from `clients` records and amounts from `estimates`, mismatch triggers explicit confirmation), #6 (agentic volume must ride the dedicated Messaging Service from Phase 177, not the shared number)
**Research flag**: resolved during planning — MCP elicitation primitive not required; a two-call draft/token/send round-trip achieves the same distinct-propose/distinct-commit guarantee using ordinary tool calls every MCP client already supports

### Phase 179: WhatsApp Template Composer & Meta Approval Panel
**Goal**: A super-admin can compose a real WhatsApp HSM template body with ordered, labeled variables entirely in-panel, submit it to Meta for real (not the historical `components: []` stub), verify its approval status in-system without waiting on the webhook, and edit + resubmit a rejected template in place — making the Phase 174 `expectedVariableCount` send-time guard live end-to-end for the first time.
**Depends on**: Phase 174 (TNT-03, the existing HSM registry + `expectedVariableCount` guard this phase makes real) and Phase 104.3 (the existing `whatsapp_notification_templates` table + admin panel this phase extends). Owner-requested extension pulling in the deferred FUT-01 after Phases 172-178 shipped; research completed 2026-07-22 (`179-RESEARCH.md`, HIGH confidence — verified live against `developers.facebook.com`).
**Requirements**: TMPLCOMP-01, TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04, TMPLCOMP-05
**Success Criteria** (what must be TRUE):

  1. A super-admin composes a body with ordered `{{n}}` variables (label + example) entirely by clicking "Add variable" — never free-typing braces — with one ordered array driving the body text, Meta's `example.body_text`, and `variables_schema` (order-mismatch-by-construction impossible)
  2. Submitting sends REAL, non-empty `components` to Meta with pre-submit validation mirroring Meta's documented auto-reject rules (sequential variables, no leading/trailing variable, char limits, every variable has an example) — an incomplete or invalid draft is refused before any network call
  3. Approval status is verifiable in-system via the existing webhook sync AND a "Check status now" button doing a direct Meta GET; the FULL status enum is handled (PAUSED/DISABLED/FLAGGED/LOCKED/etc. resolve to distinct, non-approved statuses, never a silent lowercase fall-through)
  4. A rejected (or approved) template can be edited and resubmitted in place via `POST /{template_id}` — the SAME Meta template id, re-triggering review — with its rejection reason shown in the panel
  5. On a successful submission, `variables_schema` is written as a byproduct of that submission (never edited independently), making the Phase 174 `expectedVariableCount` guard live for real approved templates for the first time; `lib/actions/admin-whatsapp-templates.ts` gains the unit coverage the research found missing (Wave 0 gap — the existing test file never exercised a real submission success path)

**Plans**: 4 plans in `.planning/phases/179-whatsapp-template-composer/` (3 waves)
Plans:

- [ ] 179-01-PLAN.md - TDD: `lib/whatsapp/template-composer.ts` — client-safe ordered-array validation (mirrors Meta's auto-reject rules) + BODY component derivation (TMPLCOMP-01, TMPLCOMP-02)
- [ ] 179-02-PLAN.md - TDD: `lib/whatsapp/meta-templates-client.ts` — real Meta create/status/update HTTP wrapper + defensive rejection-field reading + widened `mapMetaEventToStatus` full event vocabulary (TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04)
- [ ] 179-03-PLAN.md - `body_text` migration + `lib/actions/admin-whatsapp-templates.ts`: real `submitTemplateToMeta` payload, `variables_schema` write-through, new `checkTemplateStatus`/`updateTemplateAndResubmit` actions, extends the existing test file's Wave-0 gap (TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04, TMPLCOMP-05)
- [ ] 179-04-PLAN.md - Composer UI (`whatsapp-template-composer.tsx`) + panel wiring: full status badge map, Check status now, Edit & Resubmit (TMPLCOMP-01, TMPLCOMP-02, TMPLCOMP-03, TMPLCOMP-04)

**Pitfalls addressed**: #1/#2 (missing/malformed `example.body_text`, leading/trailing variable — Meta auto-reject triggers caught by client-side pre-submit validation before any API call), #3 (order mismatch is silent at Meta's send-time validation — the single-ordered-array design makes it structurally impossible, not just conventionally discouraged), #4 (`mapMetaEventToStatus` only handled 4 of Meta's real event vocabulary — widened to the full documented set with PAUSED/DISABLED/FLAGGED/LOCKED resolving distinctly), #5 (API version pinning drift — reuses the existing `META_WHATSAPP_API_VERSION` env expression, no new hardcoded literal)
**Research flag**: none — full research completed 2026-07-22 (`179-RESEARCH.md`, HIGH confidence, all load-bearing claims verified live against official Meta docs)
**UI hint**: yes

### v4.21 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 172. Template Engine Foundation | 0/? | Not started | - |
| 173. Super-Admin Template Editor UI | 0/? | Not started | - |
| 174. Tenant Notification Cutover & WhatsApp Re-enable | 0/? | Not started | - |
| 175. Telegram Platform-Event Catalog & Per-Event Toggles | 0/? | Not started | - |
| 176. End-Customer Consent, Opt-Out & Quiet Hours | 0/? | Not started | - |
| 177. End-Customer Email/SMS Send Path & Audit Log | 0/7 | Not started | - |
| 178. Agentic Send | 0/4 | Not started | - |
| 179. WhatsApp Template Composer & Meta Approval Panel | 0/4 | Not started | - |

## 🚧 v4.22 Product-Native Demo (Phases 180-181) — ROADMAP CREATED 2026-07-26

**Milestone Goal:** Replace the separate public demo with a safe, host-isolated, read-only experience inside the real authenticated Xtimator product, without touching a visitor's normal apex-domain session.

**Coverage:** 14/14 requirements mapped (ENTRY-01..04, PARITY-01..03, SAFE-01..04, CUTOVER-01..03), **0 orphans, 0 duplicates.** Numbering continues directly after Phase 179 at **Phase 180**; parking-lot and legacy entries 999.1/1000/1001 are ignored for sequencing.

**Dependency spine:** Phase 180 establishes the isolated demo identity, host-only cookies, local-host parity, and deny-write boundaries. Phase 181 depends on that foundation, moves the demo onto the shared product surfaces, runs the automated/browser cutover gate, switches public entry points, and removes the duplicate standalone UI. The existing standalone `/demo/*` implementation remains available until Phase 181's verification gate passes.

**Production topology:** GitHub Actions → Docker/GHCR → Coolify. The stale `.vercel/project.json` is not production configuration. DNS, Supabase redirect allow-list changes, and Coolify domain creation remain explicit operator actions rather than repository mutations.

### Phases (summary checklist)

- [x] **Phase 180: Isolated Demo Session & Read-Only Foundation** — establish host-only demo authentication and active-company selection with deny-write enforcement at server, side-effect, and RLS boundaries (completed 2026-07-27)
- [x] **Phase 181: Real-Product Cutover & Verification** — expose deterministic demo data through the shared app UI, prove session isolation across responsive browsers, cut entry points over, and retire the duplicate demo surface
 (completed 2026-07-27)

### Phase Details

### Phase 180: Isolated Demo Session & Read-Only Foundation
**Goal**: Visitors can enter a dedicated demo-host session that is isolated from their normal Xtimator login and cannot mutate data or trigger external effects.
**Depends on**: Nothing in-milestone; sequencing follows Phase 179 in the global counter.
**Requirements**: ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, SAFE-01, SAFE-02, SAFE-03, SAFE-04
**Success Criteria** (what must be TRUE):

  1. Opening the public demo entry transfers a visitor to the configured demo host without changing an existing Supabase session on the apex domain.
  2. The demo host creates a host-only session for the dedicated demo user, selects the deterministic demo company in a host-only `active_company_id` cookie, and reaches the real `/dashboard`; repeat entry and stale or partial cookies recover without loops.
  3. The same isolated-host contract works on the configured local development host and port without relaxing production cookie rules.
  4. Any attempted demo mutation is denied when either the demo user or demo company is active, no AI/upload/send/billing/job/webhook side effect is triggered, and database/RLS remains the final deny-write boundary even if an upstream guard is missed.
  5. Automated tests prove allowed read navigation, denied mutation and side-effect paths, host-only cookie isolation, stale-cookie recovery, and absence of redirect loops.

**Plans**: TBD
**UI hint**: yes

### Phase 181: Real-Product Cutover & Verification
**Goal**: Demo visitors can explore the real Xtimator product safely, and the verified product-native flow becomes the only public demo experience.
**Depends on**: Phase 180
**Requirements**: PARITY-01, PARITY-02, PARITY-03, CUTOVER-01, CUTOVER-02, CUTOVER-03
**Success Criteria** (what must be TRUE):

  1. A demo visitor sees the same authenticated layout, navigation, components, styling, and responsive behavior as a real tenant.
  2. The visitor can navigate the exposed dashboard, projects, clients, price book, estimates, and settings surfaces using deterministic demo-tenant data, while a visible demo/read-only state removes or disables mutation and paid/external-effect controls.
  3. After the verification gate passes, every landing-page demo entry uses the product-native flow and the obsolete standalone `/demo/*` UI is removed without broken internal links.
  4. An operator can configure local and production demo hosts from repository documentation covering environment values, Supabase redirect allow-list entries, DNS, and Coolify domains without treating Vercel as production.
  5. Browser verification at desktop and responsive widths proves the real product renders on the demo host and that an existing apex-domain session remains intact before and after the visit.

**Plans**: 5 plans

Plans:
- [x] 181-01-PLAN.md — Filter SettingsNav for demo, render the real SettingsLayoutClient shell unconditionally, un-hide the Settings entry point
- [x] 181-02-PLAN.md — Wire read-only rendering into Company/Team/Notifications tabs (new NotificationsForm readOnly prop; reuse existing CompanyInfoForm/TeamSection props)
- [x] 181-03-PLAN.md — Add isDemoCompany redirect guards to the 15 settings pages not exposed to the demo
- [x] 181-04-PLAN.md — Verify demo data richness (Supabase MCP) and extend the e2e isolation spec with PARITY-01..03/CUTOVER-03 browser assertions
- [x] 181-05-PLAN.md — Switch landing CTAs to /demo/entry, delete the standalone /demo/* UI, rewrite DEMO-WORKSPACE.md

**UI hint**: yes

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 180. Isolated Demo Session & Read-Only Foundation | 15/15 | Complete    | 2026-07-27 |
| 181. Real-Product Cutover & Verification | 5/5 | Complete    | 2026-07-27 |

## 🚧 v4.23 Unified Estimate Document Engine (Phases 182-186) — ROADMAP CREATED 2026-07-27

**Milestone Goal:** Unify the estimate webview and PDF onto one shared document structure/design — the webview is the benchmark, the PDF copies it — with a single deterministic page-break rule powering a new fully-editable paginated editor mode that mirrors the PDF.

**Coverage:** 18/18 requirements mapped (ENGINE-01..03, PDFPAR-01..04, PGBRK-01..05, PGMODE-01..05, POLISH-01), **0 orphans, 0 duplicates.** Numbering continues the global counter — v4.22 ended at Phase 181, so v4.23 starts at **Phase 182**.

**Dependency spine:** Phase 182 (shared document engine + standalone send-path fix) is the foundation every later phase inherits — no other phase should re-derive labels/formatters/tokens against the current 4-independently-diverged files. Phase 183 (PDF parity content — signature block + captions) depends on 182 and must land BEFORE Phase 184, not in parallel with it: both phases modify the same two PDF template files (`components/pdf/estimate-pdf.tsx`, `estimate-pdf-modern.tsx`), and Phase 184's pagination engine needs the signature block defined as an atomic block kind before finalizing its block inventory. Phase 184 (consolidated pagination engine, opening with the browser-vs-fontkit measurement-drift spike) depends on 182 and 183. Phase 185 (paginated editable editor mode) depends on 184's rule engine being provably correct before UI is layered on top. Phase 186 (webview design polish) only strictly needs 182's shared tokens, but touches the same webview document files (`estimate-document.tsx`, `estimate-document-modern.tsx`) that Phases 183 and 185 also modify — sequence it LAST to avoid redoing polish work or merge conflicts, even though it has no hard requirement dependency on 184/185.

**Parallelizable work:**
- Within Phase 182: the shared-model extraction (`lib/estimate/document/*`) and the send-path fix (`send/route.ts`, `lib/whatsapp/pdf-delivery.ts`) are file-disjoint and can be planned/executed concurrently — the send-path fix has zero dependency on the extraction landing first (it copies an already-proven pattern from `pdf/route.ts`).
- Phases 183 and 184 should NOT run in parallel — both touch the same PDF template files; sequence 183 → 184.
- Phase 186 could theoretically start as soon as Phase 182 ships (it only needs the token source), but is recommended to run LAST/sequentially after Phase 185 rather than in parallel with 183-185, since all three touch the same webview document components.

**Key context (locked, from research):** PDF stack stays `@react-pdf/renderer` only (Alpine container, no puppeteer). Pixel-perfect DOM↔PDF parity is explicitly rejected — the bar is "same page-break decisions, same content per page," verified structurally. The webview does NOT currently render a signature block or photo captions either — both are net-new on all four surfaces (Phase 183), not a copy-from-webview task. `lib/whatsapp/pdf-delivery.ts` must resolve the PDF via a plain importable function, never an HTTP fetch to the PDF route (no cookies in the webhook context).

### Phases (summary checklist)

- [x] **Phase 182: Shared Document Engine + Send-Path Fix** — extract one shared document model/labels/formatters/tokens consumed by all four renderers; fix the email/WhatsApp PDF send paths to honor template choice + signed snapshot
 (completed 2026-07-28)
- [x] **Phase 183: PDF Parity Content** — signature block + photo captions + full structural parity with the webview benchmark, across both templates and both send-adjacent surfaces
 (completed 2026-07-28)
- [x] **Phase 184: Consolidated Pagination Engine** — one deterministic page-break rule module, opening with the browser-vs-fontkit measurement-drift spike, wired into both PDF templates
 (completed 2026-07-28)
- [x] **Phase 185: Paginated Editable Editor Mode** — header toggle (full-width/paginated), live DOM measurement provider, fully editable letter-size page preview, legacy viewMode toggle retired
 (completed 2026-07-28)
- [x] **Phase 186: Webview Design Polish** — design refinement pass on the benchmark webview (both templates, mobile included), propagated to the PDF through the shared engine
 (completed 2026-07-28)

### Phase Details

### Phase 182: Shared Document Engine + Send-Path Fix
**Goal**: All four document renderers (workspace editor, share webview, classic PDF, modern PDF) read from one shared document model/labels/tokens/formatters source, and every PDF send path (download, email, WhatsApp) renders the tenant's actual chosen template with the signed snapshot honored.
**Depends on**: Nothing in-milestone (first phase; sequencing follows Phase 181 in the global counter)
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, PDFPAR-04
**Success Criteria** (what must be TRUE):

  1. Downloading a PDF, viewing the public share webview, and viewing the workspace editor document all show identical labels, formatted addresses, and formatted dates for the same estimate — sourced from one shared module, not four independently-diverged copies.
  2. Both PDF page geometry and the pt-to-px conversion are read from one shared module by both the DOM and PDF renderers — no hand-copied raw literal exists in a second place.
  3. Emailing an estimate PDF and receiving one via WhatsApp both render the company's actually-configured template (classic or modern), matching what the existing "Download PDF" route produces for the same estimate.
  4. After an estimate is signed, the PDF sent by email or WhatsApp shows the frozen, signed content — never any edit made after signing (closing the live TRUST-01 violation).
  5. Every existing estimate's rendered output is unchanged after this phase's extraction (byte-identical regression proof) — this phase ships zero visible change on its own.

**Plans**: 4 plans

Plans:
- [x] 182-01-PLAN.md — Shared document engine module (model/labels/format/tokens) + Wave-0 validation tests
- [x] 182-02-PLAN.md — Adopt shared module in all 4 renderers, delete duplicate label/format/geometry copies
- [x] 182-03-PLAN.md — Shared in-process PDF resolver (lib/pdf/render-estimate-pdf.ts) + acceptance test
- [x] 182-04-PLAN.md — Wire download/email/WhatsApp PDF paths to the resolver + send-hub attachPdf fix

### Phase 183: PDF Parity Content
**Goal**: The PDF (both templates) matches the webview benchmark's full document structure, and both the webview and PDF gain the signature block and visible photo captions neither surface renders today.
**Depends on**: Phase 182 (shared document model, labels, tokens)
**Requirements**: PDFPAR-01, PDFPAR-02, PDFPAR-03
**Success Criteria** (what must be TRUE):

  1. A signed estimate's PDF (classic and modern) displays the signer's name, signed date, and the signature image.
  2. A signed estimate's webview (classic and modern) also displays the signer's name, signed date, and the signature image — net-new, not previously rendered anywhere.
  3. A photo with a caption shows that caption as visible text beneath the photo, in both the webview photo grid and the PDF photo grid, for both templates.
  4. The PDF (both templates) mirrors the webview's full structure — company header/branding, title, project/bill-to, summary, sections with per-section subtotals, items tables, the locked totals order (subtotal→discount→tax→total→deposit→balance due), and terms.

**Plans**: 7 plans

Plans:
- [x] 183-01-PLAN.md — Wave-0 shared fixtures + pre-refactor PDF baseline-order test
- [x] 183-02-PLAN.md — Signature + discount-display data plumbing (shared query, model types, predicate)
- [x] 183-03-PLAN.md — Font asset sourcing + Font.register + design-tokens widening
- [x] 183-04-PLAN.md — PDF shared components pt1 (header/info-grid/footer/section+Classic banner fix/terms)
- [x] 183-05-PLAN.md — Webview signature block + photo captions (Classic + Modern)
- [x] 183-06-PLAN.md — PDF shared components pt2 (totals variant/photos+captions/signature block)
- [x] 183-07-PLAN.md — Cross-surface integration test + baseline update + manual visual checkpoint

### Phase 184: Consolidated Pagination Engine
**Goal**: One deterministic pagination module computes page-break decisions from the shared document model, is the single source of truth consumed by the PDF renderer (and, in Phase 185, the web paginated preview), and is validated by an early measurement-drift spike before being finalized.
**Depends on**: Phase 182 (shared model), Phase 183 (signature block defined as an atomic block kind; also avoids concurrent edits to the same PDF template files)
**Requirements**: PGBRK-01, PGBRK-02, PGBRK-03, PGBRK-04, PGBRK-05
**Success Criteria** (what must be TRUE):

  1. In a multi-page PDF, a line-item row is never split across a page break; a section header always renders on the same page as its first item row; a section's subtotal always renders on the same page as that section's last item row.
  2. The totals block, the signature block, and each terms card each render fully on one page — never split across a break.
  3. Every PDF page after page 1 repeats the items-table column header, and every page shows "Page N of M".
  4. The browser-vs-fontkit measurement-drift spike has run, produced a documented go/no-go decision, and its resulting safety margin is applied in the shipped height-estimation formula.
  5. For the same estimate and template, the pagination module (`lib/estimate/pagination/`) is the one function both the PDF renderer and the web measurement provider call — verified by fixture/unit tests that the same block inputs always produce the same page/block assignment regardless of which renderer invokes it.

**Plans**: 5 plans across 3 waves

Plans:
- [x] 184-01-PLAN.md — Wave 1: measurement-drift spike + SAFETY_MARGIN_LINES (stated per-page semantics) + hand-calculated arithmetic proof + LINE_HEIGHT/ESTIMATE_PAGE_GEOMETRY tokens
- [x] 184-02-PLAN.md — Wave 2: pure pagination type contracts (PageBlockRef, safetyMarginPt) + computePageBreaks() engine (maximal keep-together chains, per-page margin) + rules (fake measurement provider)
- [x] 184-04-PLAN.md — Wave 2: component restructure (split PdfSectionBlock; row-chunk PdfPhotoGrid + photosPerRow; per-card-atomic PdfTermsSection + PdfTermsCard; totals wrap={false} fix)
- [x] 184-03-PLAN.md — Wave 3: server-only fontkit/linebreak estimator + blocksFromModel() (empty-description filter, visibility gates, ref population, token-sourced geometry)
- [x] 184-05-PLAN.md — Wave 4: wire both PDF templates to N explicit <Page>s via one uniform block dispatcher; repeated continuation headers; real-PDF-byte page count + determinism + renderToBuffer smoke; durable UAT artifacts + manual visual checkpoint

### Phase 185: Paginated Editable Editor Mode
**Goal**: The workspace estimate editor gains a paginated view mode — letter-size pages styled like a PDF preview, mirroring the PDF's page breaks — that stays fully editable, alongside the existing full-width mode, with the legacy width/page toggle retired.
**Depends on**: Phase 184 (the pagination rule engine must exist and be proven correct before UI is layered on top)
**Requirements**: PGMODE-01, PGMODE-02, PGMODE-03, PGMODE-04, PGMODE-05
**Success Criteria** (what must be TRUE):

  1. The estimate editor header shows two icon toggle buttons to the left of "Edit with AI"; clicking the paginated icon instantly switches the document into letter-size, PDF-preview-styled pages (centered, gapped, shadowed) matching the active template's page breaks.
  2. In paginated mode, a user can edit any field inline, add/remove items and sections, and drag-reorder items exactly as in full-width mode — no editing capability is lost.
  3. Editing content that pushes an item across a page boundary triggers a debounced repagination with no loss of cursor focus or scroll position, and no per-keystroke full-tree reflow lag.
  4. The old floating-pill "Full page/Full width" toggle and its CSS-zoom mechanism no longer appear anywhere in the editor — there is exactly one page-view control, in the header.
  5. The public share webview for the same estimate is unchanged — still a normal single-page scroll, at the same URL, with no pagination controls.

**Plans**: 4 plans across 3 waves

Plans:
- [x] 185-01-PLAN.md — Mirror foundation: shared computeEstimatePageConstraints() + browser-safe fontkit estimator + deep-equal parity test (wave 1)
- [x] 185-02-PLAN.md — Header view-mode toggle (PGMODE-01) + legacy floating-pill toggle retirement (PGMODE-04) (wave 1)
- [x] 185-03-PLAN.md — Paginated canvas: usePaginatedPreview hook + PaginatedDocumentOverlay, server data threading (wave 2)
- [x] 185-04-PLAN.md — Repagination triggers (immediate/debounced), focus + dnd-kit regression proof, PGMODE-05 boundary guard, PGBRK-01/04 closure (wave 3)

**UI hint**: yes

### Phase 186: Webview Design Polish
**Goal**: The benchmark webview (both templates, desktop and mobile) receives a general design refinement pass, and because it reads from the shared token source, the refinement propagates to the PDF without a separate manual pass.
**Depends on**: Phase 182 (shared design tokens); sequenced after Phase 185 to avoid repeated edits to the same webview document files Phases 183 and 185 also modify
**Requirements**: POLISH-01
**Success Criteria** (what must be TRUE):

  1. Both webview templates (classic and modern) show a visibly refined design pass — spacing, typography, and visual hierarchy — correctly on both desktop and mobile viewports.
  2. The refined values are read from `lib/estimate/document/tokens.ts`, not reintroduced as one-off literals per surface, so the same refinement appears in the PDF output for both templates without a separate manual edit.
  3. The public share webview and the workspace editor webview remain visually consistent with each other after polish — no new drift is reintroduced.

**Plans**: 2 plans

Plans:
- [x] 186-01-PLAN.md — Classic typography hierarchy, table zebra-contrast, and grand-total emphasis (webview-only)
- [x] 186-02-PLAN.md — Terms/signature/photo/mobile-list card polish + Classic PDF token propagation + milestone close-out
**UI hint**: yes

### v4.23 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 182. Shared Document Engine + Send-Path Fix | 4/4 | Complete    | 2026-07-28 |
| 183. PDF Parity Content | 6/7 | Complete    | 2026-07-28 |
| 184. Consolidated Pagination Engine | 5/5 | Complete    | 2026-07-28 |
| 185. Paginated Editable Editor Mode | 4/4 | Complete    | 2026-07-28 |
| 186. Webview Design Polish | 2/2 | Complete    | 2026-07-28 |


## 🚧 v4.24 Same-Origin Storage on R2 (Phases 187-192) — ROADMAP CREATED 2026-08-06

**Milestone Goal:** Serve every user-uploaded and platform asset from the app's own origin, backed by Cloudflare R2, so images land on the CDN that already fronts `xtimator.com` and Supabase Storage egress goes to zero.

**Coverage:** 20/20 requirements mapped (PROXY-01..05, PROV-01..03, UPLOAD-01..04, URL-01..04, MIG-01..04), **0 orphans, 0 duplicates.** Numbering continues the global counter — v4.23 ended at Phase 186, so v4.24 starts at **Phase 187**. (The out-of-band parking-lot directories 999.1 / 1000 / 1001 are not part of the counter.)

### Scale note — read this before sizing any phase

Production storage today is **51 objects / 14.3 MB** (photos 11 MB, platform-brand 2.8 MB, logos 55 kB, audio 55 kB, pdfs 0). Transfer volume and transfer time are **non-issues** — the entire corpus copies in seconds. **Phase 191 is therefore dominated by correctness and per-object verification, not by throughput, windowing, batching, resumability, or a maintenance window.** Any plan that budgets effort for transfer scale is mis-sized. The trigger for this whole milestone is **egress, not stored volume**: the landing page alone pulls ~1.9 MB of images per cold visit from `*.supabase.co` (~1.9 GB per 1 000 cold visits). The 800 MB threshold in `docs/STORAGE-MIGRATION.md` measures the wrong thing and is superseded.

### Already proven — do not re-plan

`lib/storage/s3-provider.ts` **works against R2 unmodified.** `scripts/storage-smoke.ts` passed upload → signed URL → in-process download → HTTP fetch of the signed URL → delete against a real R2 bucket, with `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=true`, endpoint `https://<account-id>.r2.cloudflarestorage.com`. **No phase in this milestone should spend a plan, a spike, or a verification step re-validating the S3 provider itself.** Likewise, the Cloudflare CDN layer is already live and verified (`docs/CLOUDFLARE-CDN.md`) — this milestone does not re-do the CDN, it makes images actually reach it. The five-bucket decision (`audio` / `photos` / `pdfs` / `logos` / `platform-brand`, 1:1 with the bucket argument the app already passes) is locked precisely so the provider needs zero changes.

**Dependency spine:** Phase 187 is the keystone — the **Supabase read-through fallback (PROXY-02) must exist before any object is migrated or any URL is rewritten**, because it is the single mechanism that makes every later step non-breaking and reversible in both directions. Phase 188 (provider-selection integrity) must land **before or with** the migration: flipping `STORAGE_PROVIDER` while ~20 call sites still hardcode Supabase causes split-brain writes/reads and silent 404s on WhatsApp inbound media — a verified failure mode from the 2026-08-05 field assessment, not a hypothetical. Phase 190 (portable URLs, code-level) precedes Phase 192 (the row rewrite) so that every renderer already understands the new URL form before any row changes. Phase 191 (copy + verify objects) precedes Phase 192 so the cutover rewrites rows toward objects that are provably present. **Phase 192 contains the only irreversible-ish data step in the milestone (URL-02)** — it is deliberately sequenced last, after the proxy can serve both backends, and it must carry a reversible record of every row it changes.

**Parallelizable work:**
- **Phase 189 (browser presigned uploads) is file-disjoint from the proxy/URL/migration track** — it touches one new presign route plus five client components (`capture-recorder`, `inline-audio-recorder`, `photo-card`, `photo-lightbox`, `estimate-document`). It can be planned and executed concurrently with 188/190/191. Its only real coupling is verification: UPLOAD-03's content-type check reads back through Phase 187's proxy, so land 187 first or stub that one check.
- Phases 187 and 188 both touch `lib/storage/` — sequence them, do not parallelize.
- Phases 191 and 192 are strictly sequential (copy → verify → rewrite → prove).
- **MIG-03 (five R2 buckets, public access disabled, scoped credential) is an operator prerequisite for anything that writes to R2** and is therefore front-loaded into Phase 187, not deferred to the migration phase.

**Key context (locked):** Target is **Cloudflare R2**, not Hetzner. **Reversibility is a hard requirement** — removing the R2 env vars must return the app to Supabase with no code change and no data migration, and Phase 192 must prove that, not assume it. **S3 credentials must never reach the browser.** **No secrets in the repo** — `.env.local.example` and every doc use placeholders only; real values live in `.env.local` (gitignored) and Coolify. Storage keys keep the existing `{companyId}/{type}/{timestamp}-{filename}` convention (`lib/storage/keys.ts`) — re-keying during a backend swap is explicitly out of scope. Model orchestration for execution: Fable orchestrates, Opus validates (plan-check/verify), Sonnet executes, Haiku simple work; maximize parallelism.

### Phases (summary checklist)

- [x] **Phase 187: R2 Provisioning & Same-Origin Asset Proxy** — five R2 buckets with a scoped credential, plus a same-origin route that streams any object from R2 and transparently falls back to Supabase, so nothing can 404 in either direction (completed 2026-08-06)
- [x] **Phase 188: Server-Wide Provider Selection Integrity** — one provider resolution for every server-side read and write, a build-time guard against reintroducing hardcoded Supabase paths, and the WhatsApp inbound media path proven end-to-end on one backend (completed 2026-08-06)
- [ ] **Phase 189: Browser Uploads Without Browser Credentials** — the five browser upload call sites move to server-issued presigned PUTs, preserving retry and offline/queue behavior, with no storage credential in client code
- [ ] **Phase 190: Portable Same-Origin Asset URLs** — new assets persist same-origin relative URLs that every surface resolves, including the server-side PDF renderer; CSP updated and narrowed
- [ ] **Phase 191: Object Migration & Verification** — a re-runnable command copies all 51 objects into R2 and proves per-object count, size, and content type; the runbook documents cutover and rollback with no real secrets
- [ ] **Phase 192: URL Rewrite Cutover & CDN Verification** — existing rows rewritten off `*.supabase.co` with a reversible record, and the landing page's images proven to arrive from `xtimator.com` with a Cloudflare cache HIT

### Phase Details

### Phase 187: R2 Provisioning & Same-Origin Asset Proxy
**Goal**: Every storage object is reachable at a same-origin `xtimator.com` URL that streams it from R2 when it is there and from Supabase when it is not — so no asset can break in either migration direction, and every later phase becomes reversible.
**Depends on**: Nothing in-milestone (first phase; follows Phase 186 in the global counter)
**Requirements**: PROXY-01, PROXY-02, PROXY-03, PROXY-04, MIG-03
**Success Criteria** (what must be TRUE):

  1. Requesting a same-origin storage URL for an object that lives in R2 returns the bytes with the object's original content type preserved — an image renders inline in the browser rather than downloading, and a PDF opens as a PDF.
  2. Requesting the same URL shape for an object that exists only in Supabase still returns the bytes, and an object that exists only in R2 also returns the bytes — so no asset 404s at any point during or after the cutover, in either direction.
  3. A request carrying a traversal-style key, a bucket name outside the five known buckets, or a key belonging to another tenant's private data is refused, and no response body or header ever contains storage credentials or a backend signed URL.
  4. Public assets fetched through the route come back edge-cacheable while tenant-private assets do not — verifiable by inspecting the response headers of one of each. The two public buckets differ deliberately: `platform-brand` writes timestamped keys so it may be immutable; `logos` overwrites a stable key in place (`{companyId}/logo.webp`, `user-avatars/{sub}/avatar.webp`, `upsert: true`), so it must revalidate — an immutable directive there would pin a stale logo in browser caches that cannot be purged. (Corrected 2026-08-06 after plan review; the original wording said "immutable" for both.)
  5. The five R2 buckets `audio`, `photos`, `pdfs`, `logos`, and `platform-brand` exist with public access disabled, and the credential the app uses can read and write those five buckets and nothing else.

**Plans**: 3 plans in 3 waves

Plans:
- [x] 187-01-PLAN.md — Proxy policy (bucket allowlist, traversal rejection, per-bucket cache split) + dual-source asset reader (R2 first, Supabase read-through, content type from stored metadata)
- [x] 187-02-PLAN.md — `scripts/r2-verify.ts` + `npm run verify:r2`: assert the five provisioned buckets, the token's scope, read/write round-trip, and public-access-disabled (MIG-03 demonstrable)
- [x] 187-03-PLAN.md — `GET /storage/{bucket}/{key}` route + tenant ownership gate + proxy contract docs

### Phase 188: Server-Wide Provider Selection Integrity
**Goal**: `STORAGE_PROVIDER` switches every server-side storage read and write at once, so writers and readers can never end up on different backends — closing the split-brain failure the field assessment found waiting behind the flag.
**Depends on**: Phase 187 (shares `lib/storage/`; the proxy is the first consumer of a correct provider seam)
**Requirements**: PROV-01, PROV-02, PROV-03
**Success Criteria** (what must be TRUE):

  1. With R2 configured, every server-side storage read and write in the app goes to R2 — there is no remaining server module that reaches Supabase Storage regardless of the flag.
  2. Removing the R2 environment variables returns the entire server to Supabase, with no code change and no data movement.
  3. An inbound WhatsApp message carrying media has its audio/photo written and then read back successfully by the estimate pipeline while R2 is configured — the concrete case that would have produced silent 404s now works end-to-end on a single backend.
  4. Adding a server-side module that reintroduces a hardcoded Supabase-only storage path fails an automated check rather than shipping silently, so the provider seam cannot rot the way it did after Phase 66.

**Plans**: 5 plans in 3 waves

Plans:
- [x] 188-01-PLAN.md — Build lib/storage/server.ts, the single server-side provider seam; move getServerStorage() out of the browser-reachable index.ts (wave 1)
- [x] 188-02-PLAN.md — Convert the 13 admin/action storage call sites to serverStorage() (wave 2)
- [x] 188-03-PLAN.md — Convert the 6 PDF/share/delivery/cleanup call sites to serverStorage() (wave 2)
- [x] 188-04-PLAN.md — PROV-02 storage seam census gate, proven failable, plus the corrected migration runbook (wave 3)
- [x] 188-05-PLAN.md — PROV-03 WhatsApp inbound media write-and-read single-backend proof (wave 3)


### Phase 189: Browser Uploads Without Browser Credentials
**Goal**: The five browser upload call sites put files into the configured backend through server-issued presigned PUTs, with no storage credential ever reaching client code, and with today's field-tested resilience intact.
**Depends on**: Phase 187 for the content-type read-back check only (UPLOAD-03). Otherwise **file-disjoint** from the 188/190/191 track and safe to execute in parallel.
**Requirements**: UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04
**Success Criteria** (what must be TRUE):

  1. A user records job-site audio and uploads photos from the browser — on iOS Safari and Android Chrome — and the files land in the configured storage backend.
  2. No storage credential, Supabase or S3, appears in any client bundle or in any payload the browser receives; the browser only ever gets a short-lived upload URL scoped to a single key.
  3. A caller who is not authenticated, or who asks for a key outside their own company's namespace, is refused an upload URL — one tenant cannot write into another's prefix.
  4. An image uploaded this way renders inline through the same-origin proxy with the correct content type, including for a key that has no file extension.
  5. A transient upload failure still retries and succeeds, and an interrupted capture still resumes from its persisted/queued blob — the offline behavior the field depends on is unchanged.

**Plans**: 4 plans in 4 waves (sequential — each builds on the prior's contract)
**UI hint**: yes

### Phase 190: Portable Same-Origin Asset URLs
**Goal**: Newly stored assets persist a same-origin relative URL instead of a backend-specific absolute one, and every surface that renders assets — app UI, public share pages, PDFs, and email/WhatsApp sends — resolves that form correctly.
**Depends on**: Phase 187 (the proxy the relative URLs resolve against), Phase 188 (server-side writes resolve through one provider)
**Requirements**: URL-01, URL-03, URL-04
**Success Criteria** (what must be TRUE):

  1. Uploading a new company logo, avatar, price-book image, or platform branding asset persists a same-origin relative URL — no `*.supabase.co` hostname and no R2 hostname is written into any database row.
  2. A newly stored asset displays correctly in the app UI, on a public share page, in a generated PDF, and in an emailed/WhatsApp-sent document — including the server-side PDF renderer, which has no browser origin to resolve against.
  3. Existing rows that still hold absolute Supabase URLs keep rendering everywhere unchanged during this phase — nothing is rewritten yet, so this phase ships no user-visible break.
  4. The content security policy permits the new same-origin image source and is no broader than the new setup requires.

**Plans**: 4 plans in 3 waves (190-02 / 190-03 parallel in wave 2)

### Phase 191: Object Migration & Verification
**Goal**: An operator can copy every existing Supabase object into R2 with a re-runnable command that proves, per object, that what landed matches what was there — and has a written cutover and rollback runbook to work from.
**Depends on**: Phase 187 (buckets and scoped credential exist), Phase 188 (provider integrity — the migration must not create split-brain state)
**Requirements**: MIG-01, MIG-02, MIG-04
**Success Criteria** (what must be TRUE):

  1. An operator runs one command and every object in the five Supabase buckets exists in the matching R2 bucket; running the same command a second time changes nothing and still reports success.
  2. The command reports per-object verification — count, byte size, and content type compared between source and destination — rather than a bare "done".
  3. When any object mismatches, is missing, or has the wrong content type, the command fails loudly and non-zero; a deliberately corrupted or deleted destination object is caught rather than reported as success.
  4. `docs/STORAGE-MIGRATION.md` states the verified R2 settings, the cutover procedure, and the rollback procedure, and contains no real secret values anywhere.

**Scale note**: 51 objects / 14.3 MB. This phase is about proving correctness per object, not about moving data — no maintenance window, batching strategy, or resumability work is warranted.

**Plans**: 3 plans in 3 waves (191-01/02 share scripts/r2-migrate.ts)

### Phase 192: URL Rewrite Cutover & CDN Verification
**Goal**: Existing rows stop pointing at Supabase, the landing page's images actually arrive from `xtimator.com` through the Cloudflare edge, and the milestone's reversibility promise is proven rather than assumed.
**Depends on**: Phase 190 (every renderer already resolves the new URL form), Phase 191 (objects are present in R2 and verified). Contains the milestone's only irreversible-ish data step — sequenced last on purpose.
**Requirements**: URL-02, PROXY-05
**Success Criteria** (what must be TRUE):

  1. `companies.logo_url`, `profiles.avatar_url`, price-book image URLs, and platform branding/SEO asset rows no longer contain absolute Supabase URLs, and every one of those assets still renders in the app UI, on public share pages, and in generated PDFs.
  2. The rewrite leaves a reversible record of exactly what changed, so an operator can restore the previous values without guessing them.
  3. A cold landing-page load fetches every image from `xtimator.com` — zero requests go to `*.supabase.co`.
  4. Repeating those landing-page image requests at the edge returns a Cloudflare cache HIT.
  5. With the R2 environment variables removed after cutover, every asset still renders — served through the proxy's Supabase fallback — with no code change and no data migration, proving the reversibility requirement.

**Plans**: 5 plans in 5 waves (sequential; 192-03 writes production data)

### v4.24 Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 187. R2 Provisioning & Same-Origin Asset Proxy | 3/3 | Complete   | 2026-08-06 |
| 188. Server-Wide Provider Selection Integrity | 5/5 | Complete   | 2026-08-06 |
| 189. Browser Uploads Without Browser Credentials | 2/4 | In Progress|  |
| 190. Portable Same-Origin Asset URLs | 1/4 | In Progress|  |
| 191. Object Migration & Verification | 1/3 | In Progress|  |
| 192. URL Rewrite Cutover & CDN Verification | 0/TBD | Not started | - |

### v4.24 Traceability

| Requirement | Phase |
|-------------|-------|
| PROXY-01 | 187 |
| PROXY-02 | 187 |
| PROXY-03 | 187 |
| PROXY-04 | 187 |
| PROXY-05 | 192 |
| PROV-01 | 188 |
| PROV-02 | 188 |
| PROV-03 | 188 |
| UPLOAD-01 | 189 |
| UPLOAD-02 | 189 |
| UPLOAD-03 | 189 |
| UPLOAD-04 | 189 |
| URL-01 | 190 |
| URL-02 | 192 |
| URL-03 | 190 |
| URL-04 | 190 |
| MIG-01 | 191 |
| MIG-02 | 191 |
| MIG-03 | 187 |
| MIG-04 | 191 |
