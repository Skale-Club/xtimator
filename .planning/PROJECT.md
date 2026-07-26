# Xtimator

## What This Is

Xtimator is a SaaS web application for US-based service businesses (construction, landscaping, plumbing, electrical, HVAC, cleaning, painting, etc.) to create professional, AI-powered estimates and quotes. A business owner visits a job site, records an audio walkthrough, takes photos, and the AI generates a complete, professionally formatted estimate — ready to send as a branded PDF or shareable link.

The platform includes:
- **Voice-first project onboarding** — record job site audio, AI auto-transcribes and generates the estimate draft without manual navigation
- **Super-admin layer** — centralized API credential management and runtime branding/content configuration (no redeployment needed)
- **Owner admin panel** — customer dashboard, SEO, landing page CMS, blog, extended branding controls
- **Public marketing presence** — dark-mode landing page at `/` with EN/PT-BR/ES translation support

## Core Value

A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.

## Current Milestone: v4.22 Product-Native Demo

**Goal:** Replace the separate, visually divergent public demo with a safe, read-only experience inside the real authenticated Xtimator product, while keeping visitors' normal Xtimator sessions isolated.

**Target features:**
- **Real product surface:** demo visitors enter the same dashboard, navigation, pages, components, and responsive behavior used by real tenants, backed by the deterministic demo company.
- **Isolated demo session:** `xtimator.com/demo` hands off to `demo.xtimator.com`, which creates a host-only Supabase session for a dedicated demo user and selects the demo company without touching cookies on the apex domain.
- **Defense-in-depth read-only mode:** the demo user and demo company are blocked from mutations at the UI, server-action/API, side-effect, and database/RLS boundaries.
- **Safe cutover:** the existing standalone `/demo/*` implementation remains available until the product-native flow passes automated and browser verification, then public entry points switch and obsolete duplicate pages are removed.
- **Local and production readiness:** the same host-isolation contract works on the local development host and is documented for the GitHub Actions → Docker/GHCR → Coolify production topology.

**Key context:** The existing real app shell already recognizes the deterministic demo company and renders `DemoBanner`. The codebase also has a demo-user guard, but the public `/demo/*` pages currently use a separate simplified design and service-role reads. Xkedule provides the reference pattern: a dedicated demo subdomain with host-only cookies entering the real tenant UI. Xtimator must preserve that architecture while avoiding Xkedule's unsafe canonical-admin write exemption. Numbering continues after Phase 179.

## Last Milestone: v4.20 Structured Photo Extraction ✅ (shipped 2026-07-17)

**Shipped:** Phase 171 complete — 3/3 plans, PEXT-01..05 all shipped (structured extraction providers + worker ladder). Formal `/gsd:complete-milestone` archival pending (housekeeping).

**Goal:** Turn photo analysis from free prose into typed intelligence — a vision tool-call extraction (surfaces, measurements with units + confidence, materials, damage, trade signals) persisted per photo and serialized compactly into the generation prompt, so a "220 sq ft tile floor" photo reaches the estimator as structured quantities instead of a paragraph the model must re-parse. The single biggest estimate-quality lever identified by the v4.19 deep audit (§ E5), deferred there as FUT-02 until the pipeline's correctness/coverage/metering foundation was fixed — which v4.19 completed.

**Target features:**
- `photos.ai_extraction JSONB` (dormant-first) + a versioned zod `PhotoExtraction` schema — the authoritative gate over both providers' tool-call output (two-layer discipline, mirroring the estimate schema)
- Structured vision call on the primary path (OpenRouter, forced tool-call, finish_reason-aware) with a Gemini functionDeclarations fallback at provider parity; `ai_description` populated from `overall_description` so every existing consumer renders unchanged
- Graceful degradation everywhere: invalid/truncated/failed structured output falls back to today's prose pipeline (never blocks analysis or generation); env kill-switch
- Compact structured serialization into the generation prompt's `<photo_description>` blocks (through the existing sanitizeField hardening) — measurements, materials, damage
- Cost attribution via the v4.19 costContext threading; the ~1.3-1.7× per-photo increase measurable in ai_cost_events

**Key context:** Design sketch in [audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md) § E5. Preserves ALL v4.19 photo-pipeline semantics as regression contracts: chunked full coverage, skip-and-continue, N-of-M counts, per-photo step checkpointing, caption folding, truncation handling, costContext. Refine-path photos stay prose (ephemeral, no persistence — out of scope). Numbering continues — v4.19 ended at Phase 170, so v4.20 starts at **Phase 171**.

## Last Milestone: v4.19 Integrity & Reliability Hardening ✅ (shipped 2026-07-17)

**Shipped:** all 7 phases (164-170), 32/32 requirements (TRUST-01..03, SAVE-01..07, AIREL-01..05, BILL-01..06, PHOTO-01..04, CAPT-01..05, REFINE-01..02), 13/13 plans — the full remediation of the six-track adversarial deep audit. Snapshot-on-sign + freeze-on-send trust boundary; single-transaction save RPC + version authority + dirty-epoch + non-destructive conflict UX; AI fetch timeouts + typed truncation + tool-schema pricing fields + consistency checks + pinned temperature; refine credit gate + server-derived audio duration + Whisper retry short-circuit + cost-event dedup + vision costContext; full photo coverage + captions in the prompt + skip-and-continue; upload retry + IndexedDB capture persistence + storage-orphan reconciliation; refine flush + review-before-apply with id-preserving two-pass merge. Executed under the Fable-orchestrates/Opus-validates/Sonnet-executes split — ~20 real blockers intercepted by plan-checkers before any code. Operational deferrals: apply the 5 v4.19 migrations to prod via CI/deploy; recalibrate maxAudioMinutesPerEstimate tiers before the new hard-block reaches free-tier users; live-browser UAT of lock banner/refine review/N-of-M/upload resume. Formal /gsd:complete-milestone archival pending (housekeeping).

**Goal:** Close the 10 severity-ranked findings from the 2026-07-17 six-track adversarial deep audit of the estimate generation & editing system ([audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md)) — restoring the three user-facing contracts the audit found broken: the legal contract ("what was signed stays what was signed"), the financial contract ("what you see is what saves; what you pay matches what you use"), and the capture contract ("your recording never gets lost").

**Target features:**
- Sign/send trust boundary: snapshot-on-sign (immutable signed content on `estimate_signatures`), freeze-on-send/sign server-side guards on save + refine, and `estimate_updated` audit events — today a signed estimate is silently editable, the client's live link re-renders the altered content, and no audit event records the edit
- Atomic save: `saveEstimate` rewritten as one transactional Postgres RPC (kills session-poisoning, partial writes, temp-id churn, silent writes to superseded versions), plus dirty-epoch reconciliation, non-destructive conflict UX, validation bounds, and client-preview/server-total parity
- AI reliability: timeouts on every AI fetch (the primary generation fetch has none today), `max_tokens` raise + `finish_reason` handling, the 4 pricing fields missing from the live OpenRouter tool schema, post-generation consistency checks, pinned generation temperature
- Billing integrity: credit gate on refine (today an unmetered AI path), server-derived audio duration (kills the client-declared-duration exploit), vision costContext threading (dead cost roll-up today), Whisper retry short-circuit, cost-event dedup + correct provider attribution, enforced audio-minute entitlements
- Photo fidelity: user captions feed generation, >20-photo coverage with visible "N of M analyzed" truth, per-photo skip-and-continue so one bad photo no longer kills the whole batch
- Capture resilience: upload retry with backoff, beforeunload over the upload window, IndexedDB blob persistence with resume, storage-orphan reconciliation, honest offline UI (the current "showing cached data" banner is false — no SW/cache exists)
- Refine safety: dirty-flush guard before refine, review-before-apply, row-identity preservation on apply

**Key context:** Sourced entirely from the deep audit (not seeds) — every finding carries file:line evidence in [audits/v4.19-ESTIMATE-DEEP-AUDIT.md](audits/v4.19-ESTIMATE-DEEP-AUDIT.md), which is the required reading for every phase plan. GUARD-03 (server-authoritative math) and the Inngest dispatch-and-watch durability layer are verified strengths every phase must preserve. Numbering continues the global counter — v4.18 ended at Phase 163, so v4.19 starts at **Phase 164**.

## Last Milestone: v4.18 Estimate Document & Send Experience Refresh ✅ (shipped 2026-07-09)

**Shipped:** all 4 phases (160-163), 24/24 requirements (PUBURL-01..06, PRESENT-01..05, DOCUX-01..07, SENDHUB-01..06). Per-estimate presentation-settings resolver + gear panel, format-first Send hub, friendly branded URLs with permanent old-token compatibility, cross-surface visibility parity across all 6 renderers, consolidated ClientPicker + inline-editable Bill To, mobile line-item doc-native rebuild, and the retired-surface deletion sweep. GUARD-03 preserved structurally at every seam. Archive: [milestones/v4.18](MILESTONES.md).

**Goal:** Give business owners full control and polish over the estimate document itself — a per-estimate settings panel, a format-first send flow with friendlier client links, mobile line-item parity with desktop, and a complete alignment/inline-editing pass on the document (including editable Bill To). Source: [SEED-041](seeds/SEED-041-estimate-settings-control-panel.md) + [SEED-042](seeds/SEED-042-format-first-send-flow-friendly-estimate-links.md) + [SEED-043](seeds/SEED-043-mobile-estimate-line-item-editor-parity.md) + [SEED-044](seeds/SEED-044-estimate-document-alignment-and-client-editing.md).

## Last Milestone: v4.17 Admin Polish & Credit UX Compliance ✅ (shipped 2026-07-06)

**Shipped:** all 4 phases (156-159), 15/15 requirements (CREDITFIX-01..03, NAV-01..03, NAMING-01..02, BILLADMIN-01..03, INBOX-05..08). Fixed a real regression against a locked v4.15 decision — 3 confirmed raw-credit-count leaks on the tenant `/settings/billing` page (`TopUpPackCard`, `AutoTopupDialog`, `CreditHistoryList`) — added a real visual progress bar to the topbar `CreditChip`, and reconciled `TierCardsGrid`'s pricing/features against `billing_config`/`lib/entitlements.ts` (fixing 5 factual inaccuracies). Reorganized the super-admin sidebar (Dashboard/Companies/Inbox promoted to the top, a brand-new "Content" group built for Landing Page/Pages/Blog/SEO/Branding) and renamed "Legal Pages" → "Pages" including its slug. Fixed two names the owner explicitly called confusing: tenant Settings "Message" → "Message Template", super-admin "Support Mode" → "View as Company" — user-facing copy only, internal naming/audit-log/cookie untouched. Overhauled the admin `/admin/billing` page to be credit-model-centric (real per-company balance/cost/markup, reusing the v4.7/v4.15 cost-visibility stack) instead of a hardcoded tier/MRR calculation. Redesigned the Inbox with a genuine "Premium Xtimator" glassmorphism treatment (deterministic-color avatars, glass-surface rows/thread pane, a richer 3-state unread/selected accent system) — replacing the flat design the owner had rejected as "ficou péssimo" — plus matching polish on the Inbox Settings sub-page. Caught and fixed 3 real defects before/during shipping (a non-functional regression-test regex, an uncollectable test file path, a stale cross-phase test allowlist found by the milestone integration audit) — none shipped broken. Executed fully autonomously overnight per the standing no-checkpoint-interruptions preference, with all 4 phases planned and largely executed in parallel since none actually depended on each other. Archive: [milestones/v4.17](MILESTONES.md). Operational deferrals: live-browser visual/contrast check of the redesigned Inbox (light + dark themes) and the overhauled admin Billing page — no live UAT was performed in this environment; the v4.16 creds-gated live-nav e2e tests also remain pending real execution.

**Goal:** Fix a real regression against a locked v4.15 decision (tenant-facing surfaces still leak raw credit numbers), then polish the super-admin experience — clearer navigation with sensible grouping, better naming for two features the owner flagged as confusing, a credit-model-centric admin Billing page, and a visually premium Inbox redesign matching the rest of the admin's Phase-71 glassmorphism design system.

## Last Milestone: v4.16 Admin Inbox Consolidation ✅ (shipped 2026-07-06)

**Shipped:** both phases (154-155), 4/4 requirements (INBOX-01..04). Collapsed the two super-admin nav entries ("WhatsApp" + "WA Templates") into a single **Inbox** item at `/admin/inbox` (old routes redirect, no broken bookmarks); split the old two-tab page into a conversations-only Inbox page and a new `/admin/inbox/settings` tabbed page (Accounts + Templates), reusing every existing component unchanged; replaced the conversation viewer's table + right-side `Sheet` drawer with a persistent two-pane master-detail layout (Xphere-style list + thread pane), selection driven by a shallow `?conversation=<id>` URL param with SSR deep-linking and a mobile single-column collapse — fully read-only throughout. Integrations > WhatsApp credentials and the internal `whatsapp_*` data layer/DB tables were confirmed untouched by both a phase-level goal-verifier and a milestone-level integration audit (zero gaps found). Executed autonomously end-to-end (research → plan → execute → goal-verify → milestone-audit → archive/tag) per the standing no-checkpoint-interruptions preference. Archive: [milestones/v4.16](MILESTONES.md). Operational deferral: the 4 new creds-gated live-nav e2e tests (row-click, direct-link, empty-state, mobile collapse) need seeded `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` to actually execute — written and correctly gated, not yet run.

**Goal:** Consolidate the three scattered super-admin WhatsApp surfaces (`/admin/whatsapp` conversations+accounts, `/admin/whatsapp-templates`, and the `/admin/integrations/whatsapp` credentials) into a single coherent **Inbox** — one nav item, a two-pane master-detail conversation viewer (list + thread on the same page, Xphere-style, replacing the drawer overlay), and an Inbox "Settings" area folding in Accounts + Templates. Read-only (visualize conversations, no reply). Credentials stay in Integrations.

## Last Milestone: v4.15 Credit UX Polish & Admin Support Tooling ✅ (shipped 2026-07-05)

**Shipped:** all 4 phases (150-153), 13/13 requirements (ADMINCO-01..04, SUPPORT-01..04, CREDITUI-03..07). Companies admin screen gained server-side search/filter/pagination (mirroring the Phase-93 Event Log pattern) while Demo Accounts/HandoffButton/Configure→ kept working unchanged. Super-admin "Support Mode" ships a signed, time-boxed, RLS-safe impersonation claim (never a real identity switch) with a persistent banner and full audit logging, launched from the Companies list. Tenant-facing credit surfaces (Plans page, topbar chip) now show only a color-escalating % bar — never a raw number or $ figure, enforced by a static test — while a new super-admin-only per-company cost card exposes exact balance/real cost/markup. Top-up purchases became dollar-denominated ($20/$50/$100 packs), plus a fully-gated auto-top-up capability (platform kill switch + tenant opt-in + atomic concurrency lock + server-side payment-method re-verification) — the project's first automatic-charging code, built only after a distinct, explicit authorization step beyond the milestone's general autonomous-execution mandate. One verification gap (a bonus-credit notification leaking a raw number to tenants) was found and closed same-milestone. Archive: [milestones/v4.15](MILESTONES.md). Operational deferrals: apply migration `20260705000002_phase153_auto_topup_columns.sql` to remote, add an admin-panel toggle for `billing_config.autoTopupEnabled`, live UAT of 3 Phase-151 human-verification items + the full auto-top-up charge flow against Stripe test mode.

**Goal:** Replace the raw numeric credit counter with a Claude-Console-style usage progress bar (tenant sees only a % consumed, never $/credit math), move exact $ cost visibility to a super-admin-only surface, rework the top-up purchase flow to dollar packs ($20/$50/$100) with auto-top-up, and give the super admin an audited way to enter a tenant's live app view for support plus a properly paginated/searchable/filterable Companies admin screen. Source: [SEED-039](seeds/SEED-039-usage-progress-bar-dollar-topup.md) + [SEED-040](seeds/SEED-040-super-admin-tenant-impersonation-companies-overhaul.md).

## Last Milestone: v4.14 Admin Sales Mode + Phase 1001 SEO Readiness ✅ (shipped 2026-07-05)

**Shipped:** v4.14 Admin Sales Mode — all 4 roadmapped phases (146-149), 5/5 requirements (ADMIN-01..05): DB-driven `is_super_admin` + `requireSuperAdmin()` replacing hardcoded email checks, an admin "Add new company" modal that spins up a demo account with a 3-estimate quota, a server-side quota guard + super-admin manual grant control, and a "Hand off account" flow that invites a prospect as owner via the existing Phase 136/137 invite mechanism. Also shipped, out-of-band via quick-tasks (not a formal roadmap milestone, numbered Phase 1001 outside the normal counter): SEO Foundation and Organic Acquisition Readiness — SEO-01..06 (robots/sitemap + canonical origin + noindex boundaries, per-route social metadata, validated JSON-LD, curated blog/industry content architecture, cacheable/fast acquisition pages, automated SEO regression suite + launch runbook). Neither v4.14 nor the SEO phase had a formal `/gsd:complete-milestone` archival pass — tracked here for continuity; MILESTONES.md archival is a pending housekeeping item.

**Goal:** Give the super admin street-sales tooling (spin up + demo + hand off a prospect account) and close out organic-acquisition SEO readiness before the next monetization-adjacent milestone.

## Last Milestone: v4.13 Annual Billing ✅ (shipped 2026-06-25)

**Shipped:** all 5 phases (141-145), 5/5 requirements (ANN-01..ANN-05) — configurable annual pricing knobs, the company-month credit-grant decouple (the load-bearing dedup fix), annual checkout, interval-aware seat billing, and the Monthly/Annual pricing-card toggle with a derived "save X%" badge. Retrocompat proven byte-identical on the default monthly path.

**Goal:** Add a discounted ANNUAL subscription option while keeping AI credit distribution MONTHLY for every interval. Annual changes price + billing cadence only — never the rate at which credits flow. Source: [SEED-038](seeds/SEED-038-annual-billing-discount.md).

**Roadmap:** 5 phases (141-145), 5/5 requirements mapped (ANN-01..ANN-05), **0 orphans**. Numbering continues the global counter — v4.12 ended at Phase 140, so v4.13 starts at **Phase 141**. Mapping: ANN-01 → 141, ANN-02 → 142, ANN-03 → 143, ANN-04 → 144, ANN-05 → 145.

**Target features:**
- **Configurable annual pricing (Phase 141)** — `BillingConfig`/`DEFAULT_BILLING_CONFIG` gain `tiers[tier].subscriptionPriceAnnualCents` (per-tier) + `seatPriceAnnualCents` (global) as null-safe, deep-merge-tolerant calibration placeholders, mirrored in the admin zod schema and surfaced as editable super-admin billing-panel fields. The foundation the annual price plugs into; nothing hardcoded.
- **Monthly credit grant decouple (Phase 142)** — THE load-bearing phase. The `invoice.paid` grant idempotency key moves from `event.id` to `grant:{companyId}:{YYYY-MM}`; a new Inngest monthly cron (`lib/inngest/functions/monthly-credit-grant.ts`, mirroring `cleanup-audio`) grants `monthlyCreditGrant` to active paying companies once per company-month using the SAME key, reusing the idempotent never-throw `grantCredits`. Exactly one grant per company per calendar month for ALL intervals; a retrocompat regression test (monthly subs, no double-grant across webhook + cron) is the gate.
- **Annual checkout (Phase 143)** — `create-checkout-session` accepts `billingInterval: 'month' | 'year'` (default `'month'`), selects the matching annual Stripe Price ID (new env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL`, placeholders only), and stores `billing_interval` in metadata. The no-interval / `'month'` path stays byte-identical.
- **Interval-aware seat billing (Phase 144)** — `syncSubscriptionSeatItem` reads the subscription's interval and matches it (replacing the hardcoded `recurring: { interval: 'month' }`), using `seatPriceAnnualCents` (inline `price_data`) for annual. Monthly orgs unchanged; gated by `enforcementEnabled`. Builds on the v4.12 seat billing.
- **Pricing UI toggle (Phase 145)** — the pricing cards (`tier-cards-grid.tsx` + `tier-card.tsx`) gain a Monthly/Annual toggle showing the annual price, the DERIVED "save X%" badge, and the per-month equivalent; the selected interval threads into the upgrade/checkout action. Mobile-safe; i18n en/pt/es.

**Key context (locked, non-negotiable):** Credits stay MONTHLY for EVERY interval — annual is only a price discount (same tier, same `monthlyCreditGrant`, same seats). The company-month key `grant:{companyId}:{YYYY-MM}` is the SINGLE dedup authority shared by the `invoice.paid` webhook AND the new cron → exactly one grant per company per calendar month, NO double-grant; monthly sub → webhook grants (cron no-ops), annual sub → webhook grants month 1, cron grants months 2-12. ZERO hardcoded billing numbers — `subscriptionPriceAnnualCents` (per-tier) + `seatPriceAnnualCents` (global) live in `billing_config`, read via `getBillingConfig()`, editable without a deploy; the displayed discount % is DERIVED (`1 − annual/(12×monthly)`), never stored; no annual price / discount % / Stripe Price ID may be a constant in application code. The base annual charge uses pre-created Stripe Price IDs (env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` — PLACEHOLDERS ONLY in every doc, never a real ID or key); seat annual uses inline `price_data` straight from `seatPriceAnnualCents`. Interval is selected at checkout (`billingInterval`, default `'month'`) and threaded through metadata; the seat sync matches the subscription interval. Charging stays gated by the existing `enforcementEnabled` / live-mode discipline (display can ship anytime). Retrocompat is load-bearing: default interval `'month'`, the existing monthly path byte-identical, a regression test locks the no-double-grant invariant. Mid-cycle proration on interval switch is deferred to v2 (`ANNX-01`). Mobile-safe UI (iOS Safari / Android Chrome); i18n en/pt/es.

## Last Milestone: v4.12 Team Seats & Member Invites ✅ (shipped 2026-06-25)

**Shipped:** all 6 phases (135-140), 8/8 requirements (SEAT-01..SEAT-08). Full unit suite green (~2552 passing; the only failures are the documented Windows parallel-import flakes that pass in isolation). Turned the dormant `company_members` foundation (Phase 79) into real team seats — invite/accept/revoke/remove/role flows behind a single server-side `requireCompanyRole`/`requireCompanyManager`/`requireCompanyOwner` gate (RLS-bound, never client-trusted) over one idempotent migration `20260628000001` (widened `company_members.role` CHECK to owner/admin/member + a new `company_invites` table) — plus a mobile-safe `Settings → Team` UI. CONFIGURABLE seat billing: `seatPriceCents` (global) + `tiers[tier].includedSeats` (per-tier) live in `billing_config`/super-admin with ZERO hardcoded billing numbers; pure `computeBillableSeats = max(0, active − included)` / `computeSeatChargeCents`; `syncSeatBilling` rides the existing platform subscription as a Stripe seat-quantity item (no hardcoded Price ID), gated by `enforcementEnabled` (record-only until calibrated), wired into the accept/remove/role success paths (billing failure never rolls back membership). RETROCOMPAT proven: every single-owner org sits within `includedSeats` → zero billable seats, no Stripe write, byte-for-byte unchanged. The transparency surface shows active seats + per-seat price + projected monthly cost (runtime-read, with a truthful "not yet active" note while enforcement is off). SEED-037 is now harvested. Archive: [milestones/v4.12](MILESTONES.md). Operational deferrals: apply the `20260628000001` migration to remote (CI→GHCR→Coolify), calibrate `seatPriceCents` + per-tier `includedSeats` then flip `enforcementEnabled` on, live invite→accept→sync UAT against Stripe test mode.

**Goal:** Turn the dormant multi-user foundation (`company_members`, Phase 79) into a real team-seats feature — invite teammates into the SAME organization (`company`), assign `owner`/`admin`/`member` roles with server-side authority, and bill per seat at a price that is FULLY configurable in the super-admin `billing_config` panel (nothing hardcoded). Source: [SEED-037](seeds/SEED-037-team-seats-member-invites.md).

**Roadmap:** 6 phases (135-140), 8/8 requirements mapped (SEAT-01..SEAT-08), **0 orphans**. Numbering continues the global counter — v4.11 ended at Phase 134, so v4.12 starts at **Phase 135**.

**Target features:**
- **Schema + roles + authorization (Phase 135)** — idempotent, authored-only migration widening the `company_members.role` CHECK to `('owner','admin','member')` + a new `company_invites` table with RLS mirroring the Phase-79 posture; one server-side `requireCompanyRole(companyId, roles)` helper as the SOLE role-authority gate (never client-trusted). The foundation everything depends on.
- **Invite lifecycle + email (Phase 136)** — `inviteMember`/`revokeInvite` (owner/admin only) creating single-use, expiring `company_invites` rows + a Resend invite email; a pending invite does NOT consume a billable seat.
- **Accept onboarding (Phase 137)** — `acceptInvite(token)`: existing-user direct join + new-user signup-then-join branch that SKIPS company creation (the existing onboarding always creates a company; this path branches to JOIN the existing one), then switches the active company.
- **Member management UI (Phase 138)** — `removeMember`/`changeMemberRole` + a mobile-safe `Settings → Team` surface (members, pending invites, invite/role/remove); removal revokes access immediately and decrements the seat quantity on the next sync.
- **Configurable seat billing (Phase 139)** — `seatPriceCents` + `tiers[tier].includedSeats` in `billing_config`/super-admin (null-safe placeholders, nothing hardcoded); pure `computeBillableSeats`/`computeSeatChargeCents` + `syncSeatBilling(companyId)` updating the Stripe subscription seat-quantity item, gated by `enforcementEnabled`. Single-owner orgs within `includedSeats` → zero billable seats, no Stripe write.
- **Seat-cost transparency UI (Phase 140)** — `Settings → Team` shows current seats + the configured per-seat price + the projected monthly cost, read from `billing_config` at runtime (never hardcoded) — same transparency principle as the 1%-fee disclosure.

**Key context (locked, non-negotiable):** The org unit is `company`; a seat = one `company_members` row — NO new "organization" entity, and the EXISTING `company_members`-based RLS already authorizes all org-owned data (clients, price book, estimates, credits, Connect payout), so a second member reads it for free — reuse it, do NOT rebuild multi-tenancy. Roles are exactly `owner`/`admin`/`member` (`viewer` deferred to v2); exactly one `owner` per company; authority is SERVER-SIDE only (`requireCompanyRole` + RLS), never client-trusted. ZERO hardcoded billing numbers — the seat price + per-tier included-seat counts live in `billing_config` (`lib/billing/billing-config.ts`), read via `getBillingConfig()`, editable in the super-admin panel (operators-only; tenants never see it), applied without a deploy (30s TTL). Billable seats = `max(0, activeMembers − includedSeats)`; the charge rides the existing platform subscription (`companies.stripe_subscription_id`) as a quantity item, re-synced on membership change, GATED by `enforcementEnabled` (calibrate before charging). A pending invite does NOT consume a billable seat (counted on acceptance). Retrocompat is load-bearing: single-owner orgs sit within `includedSeats` → zero charge, zero behavior change, no single-user flow altered. Migrations are idempotent + authored-only — deploy via CI→GHCR→Coolify, never applied to remote here / built on the VPS. Mobile-safe UI (iOS Safari / Android Chrome).

## Last Milestone: v4.11 Advanced Pricing Model — Per-Item Tax, Discounts, Deposit & Markup ✅ (shipped 2026-06-25)

**Shipped:** all 6 phases (129-134), 12/12 requirements (TAX-01..PUI-02). Full unit suite green (2429 passing; only the known mcp-route-contract parallel-flake). Enriched the estimate PRICING MODEL so the existing server-side deterministic GUARD-03 engine computes per-item tax (labor vs materials, `companies.tax_config`), line + global discounts (before tax, US norm), deposit/down-payment (`balance_due`), and markup (cost -> `unit_price`) -- the AI gained ZERO arithmetic (it only classifies/provides inputs; NO calculator tool). One idempotent migration `20260627000001` (9 dormant columns + reused `estimates.discount_*`); the GUARD-03 math extracted byte-identically into the pure `lib/estimate/compute-totals.ts`; the deposit threads to the SEED-020/SEED-036 Stripe charge + 1% fee via the pure `resolveChargeAmount` (fee on the amount actually charged); the richer totals (Subtotal -> Discount -> Tax -> Total -> Deposit -> Balance Due) render across editor + PDF + share + WhatsApp/MCP because the math engine is the shared core. Retrocompat proven byte-identical (`850.99`/`85.1`/`936.09` + `40`/`1540` + `1440`/`1890`/`1296` standing goldens). Archive: [milestones/v4.11](MILESTONES.md). This is the LAST green seed from the n8n-MVP-analysis backlog -- **that backlog is now fully complete.** Operational deferrals: apply the migration to remote (CI->GHCR->Coolify), configure per-company `tax_config` to activate non-flat tax, live UAT of tax + discount + deposit through editor -> PDF/share -> the Stripe deposit charge.

**Goal:** Enrich the estimate's pricing MODEL (not the calculator) so the server-side deterministic math engine computes the elements every US service business uses: per-item taxability (labor vs materials), discounts (line + global), deposit/down-payment (balance due), and markup (cost → price). The arithmetic integrity is already excellent (GUARD-03, never-trust-LLM); this adds the data model + math the engine computes. Source: [SEED-032](seeds/SEED-032-advanced-pricing-model-tax-discount-deposit.md).

**Target features:**
- **Per-item taxability** — `estimate_items.taxable` (+ optional `tax_category` labor/materials); `companies.tax_config` (per-category rate or a "labor exempt" rule); tax computed per-item, not on a flat subtotal.
- **Discounts** — line-level + global discount (amount or percent); applied before tax (US norm; configurable).
- **Deposit / down-payment** — `estimates.deposit_type`/`deposit_value` → `balance_due`; the natural value for the Stripe payment link (SEED-020/036).
- **Markup** — `estimate_items.cost` + `markup_pct` → server-derived `unit_price` (never-trust-LLM applied to markup); price book stores cost + markup per item.
- **Editor + PDF + plain-text** — per-line discount/taxable fields; the new totals structure (subtotal → discount → tax → total → deposit → balance due) across all 3 channels (the math engine is the shared core).

**Key context:** DESIGN PRINCIPLE (non-negotiable) — ALL new arithmetic stays SERVER-SIDE and DETERMINISTIC; the AI NEVER computes tax/discount/deposit/markup (it only provides inputs: qty, unit_price or cost, labor/materials classification). EXTEND the existing GUARD-03 math block (`lib/services/generate-estimate.ts` ~L255-373), do NOT create a parallel one, and explicitly do NOT give the AI a calculator tool (that would reintroduce the n8n calculator's 3 LLM-failure points — a regression). Retrocompat is mandatory: existing estimates (taxable=true, discount=0, deposit=none) must be byte-identical on the happy path when `tax_config` is absent. Decisions to lock in scoping: discount-before-or-after-tax (configurable), boolean-taxable vs labor/materials categories (start simple, evolve), markup in price-book vs ad-hoc vs both, deposit↔Stripe contract. SCOPE FENCE: the pricing-model enrichment ONLY (schema + server math + price-book cost/markup + editor UI + PDF/plain-text totals); no AI calculator tool; no channel-adapter changes beyond the shared engine. This is the LAST green seed from the n8n MVP analysis. Numbering continues the global counter — v4.10 ended at Phase 128, so v4.11 starts at **Phase 129**.

## Last Milestone: v4.10 MCP Channel Parity ✅ (shipped 2026-06-25)

**Shipped:** both phases (127-128), 6/6 requirements, 2 plans. Full unit suite green (336 files / 2354 tests). Bound the v4.9 neutral `lib/agent-tools/` over the existing v4.1 MCP server: 6 read-only tools (`ask_knowledge` + 5 query, `readOnlyHint`, companyId trusted) + reconciled `create_estimate` to delegate to the neutral `createEstimate` (channel-namespaced idempotency id; the existing MCP suite stayed byte-green). This CLOSES the **Multi-Channel Core** track — WhatsApp, web chat, and MCP are now three thin adapters over one shared neutral core (`lib/agent-tools/` + `lib/knowledge/` + `lib/services/generate-estimate`). Archive: [milestones/v4.10](MILESTONES.md). The only remaining green seed is SEED-032 (Advanced Pricing Model — independent track).

**Goal (delivered):** Bring the existing MCP server (built in v4.1) to CAPABILITY PARITY with WhatsApp + the v4.9 web chat by binding the SAME channel-neutral `lib/agent-tools/` capabilities as MCP tools — closing the WhatsApp = chat = MCP sibling-channels principle. Source: [SEED-030](seeds/SEED-030-mcp-server-xtimator.md).

**Target features:**
- **`ask_knowledge` MCP tool** — wraps `lib/agent-tools/ask-knowledge` (the v4.8 industry KB + company overlay, scoped by the company's `industries[]`); read-only (`readOnlyHint: true`).
- **Query MCP tools** — `find_client` / `get_latest_estimate` / `get_project_status` / `list_recent_estimates` / `list_services` wrapping the neutral `lib/agent-tools/query-company-data` data-reads; read-only.
- **create_estimate via the neutral path** — reconcile the existing MCP `create_estimate` to route through `lib/agent-tools/createEstimate` (the async `{jobId}` contract it was the precedent for), so all three channels share one generation entry.
- **Auto-grouped permission UX** — the new read tools carry `readOnlyHint: true` so Claude.ai's permission UI auto-groups them (the SEED-030 locked decision).

**Key context:** The MCP server (OAuth 2.0 + `/api/mcp` Streamable HTTP + the existing 5 tools) ALREADY EXISTS — reuse the auth/transport infra. The MCP tools are owner-scoped via the OAuth token → company resolution; the neutral functions take `companyId` as a trusted param, NEVER from the tool input (T-lrf-01, same as the chat). SCOPE FENCE: bind the neutral capabilities to the existing MCP server (the tool layer) ONLY — do NOT re-extract anything (v4.9 did it), do NOT touch the web chat or WhatsApp beyond parity. Open scoping: defer edit/send MCP tools (match the web-chat v1 scope: generate + query + knowledge); one query tool per data-read (MCP clients benefit from explicit tools). This closes the Multi-Channel Core track. Numbering continues the global counter — v4.9 ended at Phase 126, so v4.10 starts at **Phase 127**.

## Last Milestone: v4.9 Internal Web Chat Assistant — the 3rd channel ✅ (shipped 2026-06-25)

**Shipped:** all 5 phases (122-126), 16/16 requirements, 13 plans. Full unit suite green (335 files / 2335 tests). An in-app conversational chat (generate/query/knowledge) built on the Vercel AI Chatbot patterns over Xtimator's infra. The strategic payoff landed: the channel-neutral extraction of `lib/whatsapp/` into `lib/agent-tools/` (createEstimate/queryCompanyData/normalizeInput/askKnowledge) — WhatsApp + web chat now share the SAME neutral core, proven non-destructive by the unchanged WhatsApp parity suite. The Vercel AI SDK is the chat/streaming layer (`/api/chat` streamText + native tool-calling, `useChat` UI); the LangGraph estimate engine stays intact, invoked as an async tool (Decision #1). Owner-only + tier-gated (`chatEnabled`), never customer-facing. Credit reuse, no double-debit. Archive: [milestones/v4.9](MILESTONES.md). Operational deferrals: apply the chat_persistence migration to remote, configure the OpenRouter key, live chat UAT. The MCP parity milestone (SEED-030) consumes this neutral extraction next.

**Goal (delivered):** A conversational chat INSIDE the Xtimator web app where the business owner does everything they do on WhatsApp (generate estimates, query their data, ask trade how-to questions via the v4.8 `lib/knowledge/`). The strategic value: this milestone FORCED the channel-neutral extraction of `lib/whatsapp/` into shared domain tools that WhatsApp + chat + (later) MCP all consume. Source: [SEED-034](seeds/SEED-034-internal-web-chat-assistant.md).

**Target features:**
- **Channel-neutral domain extraction** — pull the capabilities out of `lib/whatsapp/` into neutral domain tools (`createEstimate`, `queryCompanyData`, `askKnowledge`, multimodal `normalize`) that WhatsApp keeps calling (a non-destructive refactor proven by WhatsApp behavioral-parity tests). This is the load-bearing foundation.
- **AI SDK chat layer** — add the Vercel AI SDK (`ai` + `@ai-sdk/*`); a `streamText` + native tool-calling chat route + `useChat` UI. The LangGraph estimate engine stays INTOCADO, invoked as ONE tool (a tool-call boundary, not a streaming bridge — generation is an async Inngest job).
- **Chat persistence** — `chat_conversations` + `chat_messages` tables (RLS tenant-scoped, mirroring `whatsapp_inbox`); conversation list + history.
- **Chat UI** — `useChat` message stream + tool-call rendering + multimodal input (text/audio/photo) reusing the extracted `normalize`; shadcn/Tailwind aligned to the current design system.
- **Model slots + credits** — the chat resolves its model via `ai_config` slots (not hard-coded) and consumes credits on heavy operations (generation/transcription/photo) per v4.7; the lightweight conversation turn is absorbed.

**Key context:** Governing principle (non-negotiable) — WhatsApp = CHAT = MCP, three siblings over the SAME neutral core; the chat reimplements NO domain logic. Adopt from the template: Next.js App Router+RSC, shadcn/Tailwind, the AI SDK streaming/useChat/tool-call patterns. Substitute: Auth.js→Supabase Auth, Neon/Drizzle→Supabase Postgres, Vercel Blob→our storage, AI Gateway→OpenRouter. Web chat is OWNER-only (authenticated, tenant-scoped) — NEVER customer-facing. SCOPE FENCE: the web-chat channel + the extraction it forces; MCP parity (SEED-030) is a SUBSEQUENT milestone (the extraction here makes it cheap). Open scoping decision: extract exactly what the chat v1 needs (generate + query + knowledge + multimodal); defer estimate-edit-in-chat if v1 ships generate+query+knowledge first. Numbering continues the global counter — v4.8 ended at Phase 121, so v4.9 starts at **Phase 122**.

## Last Milestone: v4.8 Industry Knowledge Base — Channel-Neutral Conversational Assistant ✅ (shipped 2026-06-24)

**Shipped:** all 5 phases (117-121), 15/15 requirements, 11 plans. Full unit suite green (314 files / 2219 tests). Per-industry knowledge base (pgvector `knowledge_entries` + dual RLS) → channel-neutral `lib/knowledge/` (embed/retrieve/answer over the `match_knowledge_entries` RPC + `<knowledge>` injection-hardening + CI fixture) → super-admin industry curation + CSV bulk import → optional company overlay (tenant `/settings/knowledge`, RLS-authed) → WhatsApp KNOWLEDGE 5th intent (the first consumer, proving the module end-to-end). Two-panel rule honored; pgvector-only (reranker deferred); no owner-facing KB browser. Archive: [milestones/v4.8](MILESTONES.md). Operational deferrals: apply 2 migrations to remote (CI→GHCR→Coolify), configure embeddings key, seed industry KBs. The web-chat (SEED-034) + MCP (SEED-030) channels consume this neutral core next.

**Goal (delivered):** Give the business owner a conversational assistant that answers trade how-to questions ("how do I pre-treat a pet stain on carpet?") from a per-INDUSTRY knowledge base (super-admin curated, scoped by `companies.industries[]`), plus an optional per-company private KB overlay — served by a channel-neutral `lib/knowledge/` domain module and consulted via WhatsApp. The FOUNDATION of the Multi-Channel Core track.

**Target features:**
- **Industry KB (platform asset)** — super-admin-curated knowledge entries scoped by industry (`lib/industries.ts` 12-industry taxonomy); one robust carpet-cleaning KB serves all carpet cleaners. RLS mirrors the `price_research_cache` service-role/neutral posture. The owner has no access to curate it.
- **Company KB overlay (optional, tenant-scoped)** — each company adds its own private entries in its OWN settings panel (DISTINCT from the super-admin panel — the two-panel rule); optional, tenant-scoped RLS.
- **`lib/knowledge/` channel-neutral module** — `retrieve(question, {industries, companyId})` over pgvector (merging industry KB + company overlay) + `answer(...)` (RAG), never importing a channel; a fixture adapter for CI determinism.
- **WhatsApp 5th intent KNOWLEDGE** — extend the existing `classifyAndRoute` (today CONFIRM_OR_CANCEL/EDIT/CREATE/QUERY) with a KNOWLEDGE intent + a QUERY-vs-KNOWLEDGE disambiguation rule; the safe CREATE default preserved.
- **pgvector + injection-hardening** — enable pgvector, a `knowledge_entries` table; retrieved content is sanitized through the existing `sanitizeField` + a new `<knowledge>` tag before entering any prompt (curated ≠ trusted as LLM context).

**Key context:** NO owner-facing KB browser — consult only via chat. Retrieval is pgvector + embeddings ONLY in v1 (the Cohere reranker is a deferred, data-driven phase-2 optimization with an explicit trigger — do NOT add it day 1). The web-chat consumption (SEED-033 item 6) is OUT of scope — it is SEED-034's own milestone; this milestone ships the WhatsApp + MCP-ready neutral module only. Source: [SEED-033](seeds/SEED-033-industry-knowledge-base-conversational-assistant.md). Numbering continues the global counter — v4.7 ended at Phase 116, so v4.8 starts at **Phase 117**.

## Last Milestone: v4.7 Monetização — Credit-Based Billing + Estimate Payment Fee ✅ (shipped 2026-06-24)

**Shipped:** all 7 phases (110-116), 28/28 requirements, 19 plans. Full unit suite green (298 files / 2110 tests). Credit-based billing end to end — cost capture (`ai_cost_events`) → `billing_config` super-admin panel → `credit_ledger` with debits wired into 4 AI seams → Stripe rail (grants on invoice.paid + top-ups) → 1% estimate application fee + total payment-UI gating + fee disclosure → owner credit balance UX → calibration validator + charge-on gate. Shipped SAFELY with **enforcement OFF** (`enforcementEnabled: false`): credits are RECORDED but never BLOCK, and the charge-on gate refuses to flip enforcement on until a documented calibration of real production cost passes the margin invariant (≤30% of subscription price). Archive: [milestones/v4.7](MILESTONES.md). Operational deferrals: apply 2 migrations to remote (CI→GHCR→Coolify), collect production cost, calibrate, then flip enforcement; live Stripe UAT.

**Goal (delivered):** Transform billing from count-based tiers into a credit model with built-in margin (monthly subscription grants AI credits consumed as real OpenRouter/Whisper cost × markup), and add a 1% platform application fee on estimate payments — every billing parameter configurable from the super-admin panel.

**Target features:**
- **Real OpenRouter cost capture (foundation)** — today only tokens are captured (for Langfuse); capture the real USD cost per AI call. This is the prerequisite for the entire credit ledger.
- **Credit ledger** — append-only `credit_ledger`; debit = `real_cost × markup` (4.5x target), mapped onto the points already instrumented in `usage_events` (`estimate`/`photo_batch`/`audio_minutes`/`price_research` + new `knowledge`). Rule: debit wherever WE spend AI; MCP external conversation = zero credit.
- **Stripe as the rail** — recurring subscription + one-time top-ups via Stripe; the credit ledger is OURS (NOT Stripe metered billing). Webhook `invoice.paid` → grant credits per tier.
- **`billing_config` in super-admin** — markup, credit denomination, per-tier monthly grant, subscription prices, top-up packs, fee %, Whisper rate, low-balance thresholds — nothing hard-coded, runtime-editable (extends the `ai_config`/`platform_integrations` pattern).
- **1% estimate application fee** — `application_fee_amount` on the Direct Charge (the hook is deliberately omitted at `lib/billing/invoice-service.ts:17` — fill it). Owner stays merchant of record; Xtimator never custodies funds.
- **Total payment-UI gating** — every payment page/screen/button/element only renders when Stripe Connect is `active`; a single `usePaymentsEnabled` guard, audited so no orphan element shows when disconnected.
- **Fee disclosure at connection** — a clear notice of the 1% (read from `billing_config`, never hard-coded copy) in the Stripe connect flow.
- **Calibration before charging** — measure real cost in production WITHOUT billing first; derive grant/markup/price from data, not guesses.

**Key context:** Two distinct payment flows — (1) owner → Xtimator (subscription/credits, this milestone's core) vs (2) end-customer → owner (the 1% fee on Stripe Connect Direct Charges). Extends `lib/quota.ts` (checkQuota/recordUsage/usage_events), `lib/entitlements.ts` (count-based tiers → add `monthlyCreditGrant`), `lib/ai/providers/openrouter.ts` (cost capture), `lib/billing/invoice-service.ts` (fee hook), `lib/platform-config.ts` (`billing_config`). Stripe already wired (phase55/58/70/94). Full design + locked decisions: [SEED-035](seeds/SEED-035-credit-based-subscription-billing.md) + [SEED-036](seeds/SEED-036-estimate-payment-platform-fee.md). Synergy: model slots (SEED-031, dormant) lower real cost → fewer credits debited → margin rises. Numbering continues the global counter — v4.6 ended at Phase 109, so v4.7 starts at **Phase 110**.

## Last Milestone: v4.6 Pricing Intelligence — Researched Pricing Agent ✅ (shipped 2026-06-24)

**Shipped:** all 5 phases (105-109), 17/17 requirements, 12 plans, ~40 commits. Full unit+eval suite green (275 files / 1932 tests). The originating "Couch cleaning 8seats → $0 → blocked as vague" bug is fixed (now a green eval regression: $180, non-vague). Archive: [milestones/v4.6-ROADMAP.md](milestones/v4.6-ROADMAP.md). Operational deferrals: apply 3 migrations to remote (CI→GHCR→Coolify) + configure a research source in `platform_integrations` to activate (null = dormant no-op); 1 live-e2e human UAT.

**Goal (delivered):** When an estimate line item has no match in the company price book, instead of the AI guessing a price (today `price_source: 'ai_estimate'`, which can come out $0 and trip the "too vague" gate), a specialized agent researches the average market price for that service/product **in the client's region** and writes it into the estimate with traceability (`price_source: 'researched'`).

**Target features:**
- **Regional price research** — a dedicated step that, for each line item with no price-book match, looks up an average US market price using the client's city/state (already on the address).
- **Research source (critical open decision)** — pick the pricing-lookup mechanism: Claude web search vs Gemini `googleSearch` grounding vs **Brave Search** vs a dedicated pricing API vs scraping. Weigh cost, latency, reliability. The runtime AI calls route primarily through **OpenRouter** (project's main provider), so the chosen source must fit that path.
- **Admin-panel config** — what feeds the research (region parameters, margins, fallback behavior) is controlled from the existing super-admin panel.
- **Traceability** — a new `price_source: 'researched'` value separating "researched" from `price_book` (authoritative) and `ai_estimate` (guess).
- **Graph integration** — wire the research step into the channel-neutral estimate graph (`lib/estimate/graph`) running inside the Inngest job, before `assess`, without breaking channel neutrality.

**Key context:** Pillar 1 (price-book priority via `anchorAndClampSections`) already ships; this milestone delivers Pillar 2 (researched pricing). Builds on the v4.3 canonical graph + the Phase-99 provider-fallback wrapper (`getAIProviderWithFallback`, OpenRouter→Gemini). **Locked constraints:** OpenRouter is the primary AI provider; Brave Search is an explicit candidate for the web-search source. Originating bug: "Couch cleaning 8seats" generated $0 and was blocked as vague. Numbering continues the global counter — v4.5 ended at Phase 103, so v4.6 starts at **Phase 105**.

## Last Milestone: v4.5 Estimate Engine Robustness & Reliability Harness ✅ (shipped 2026-06-21)

**Shipped:** all 5 phases (99-103), 18/18 requirements, 19 plans, 99 commits. Full unit suite deterministic-green (250 files / 1732 tests) + a new secret-free CI regression gate. Audit PASSED (6/6 integration chains, 3/3 E2E flows). Archive: [milestones/v4.5-ROADMAP.md](milestones/v4.5-ROADMAP.md). Deferred human UAT (staging): live provider-outage fallback, editor refine E2E, needs-details banner + CTA, WhatsApp partial-batch reply, CI-gate-red-on-broken-metric.

**Goal (delivered):** Make the AI estimate generation/editing core (audio + image + text) bulletproof — one unified multimodal ingestion path, always-validated output, isolated/recoverable failures, and an evaluation harness that catches regressions before production. Builds directly on the v4.3 canonical graph.

**Target features:**
- **Pipeline hardening** — refine flows through the canonical graph + Inngest (idempotent/durable) instead of inline route logic (`app/api/estimates/[id]/refine/route.ts`); single prompt source of truth (`lib/ai/prompt-builder.ts`); consistent provider fallback (OpenRouter→Gemini) on every path; unified error model across routes/nodes/Inngest/adapters; per-message WhatsApp batch isolation; configurable auto-refine cap with user recourse; replay-safe session TTL (no `Date.now()`).
- **Output guardrails** — zod schema validation on AI output (generate + refine) with structured retry; price-hallucination guardrails (price-book anchoring + bounds); server-side totals sanity checks; correlation ID linking pipeline-events ↔ Langfuse ↔ Sentry per run.
- **Modality unification** — one multimodal ingestion path (audio+image+text) reused across web, WhatsApp, MCP and refine; identical prompt construction everywhere; refine accepts all three modalities through the unified path.
- **Eval/test harness** — golden dataset fixtures (audio/photo/text), deterministic mocked providers, a quality-metrics suite (totals, item count, vagueness, schema validity), and a CI regression gate.

**Key context:** This is a hardening + reliability milestone on top of the v4.3 canonical estimate graph (`lib/estimate/graph/`), its channel adapters (`lib/estimate/adapters/{default,whatsapp}.ts`), and the shared service `generateEstimateForProject` (`lib/services/generate-estimate.ts`). The biggest divergence to close is the stateless refine endpoint, which bypasses the graph/Inngest and reimplements multimodal parsing + its own prompt. GUARD-04 (correlation IDs) coordinates with v4.3's Phase 97 observability work. Started 2026-06-21. Numbering continues the global counter: v4.4 = Phase 98 (WhatsApp Notifications, queued); v4.5 = Phase 99+.

## Recent Milestone: v4.3 Unified Agentic Estimate Engine

**Goal:** Unify estimate creation across ALL channels (web UI, MCP, WhatsApp) under a single LangGraph-based agentic engine — extract the domain graph today exclusive to WhatsApp into a shared canonical core, and give web/MCP the same pipeline intelligence (assess quality → ask for details/refine) that only WhatsApp has today.

**Target features:**
- **Canonical domain graph** — `ingest → generate → assess quality → refine/ask-details → finalize` reusable nodes in a shared module (extracted from `lib/whatsapp/estimate-graph.ts`)
- **Migrate web** — `lib/inngest/functions/generate-estimate.ts` consumes the shared graph instead of the linear `call-ai-provider` step
- **Migrate MCP** — `create_estimate` (`lib/mcp/tools/write.ts`) routes through the same graph
- **Migrate WhatsApp** — consume the shared graph, plugging only edge nodes (inbound media download + conversational reply)
- **Intelligence parity** — quality assessment + refinement/ask-details for web and MCP (today single-shot)
- **LangGraph↔Inngest relationship** — resolve checkpoint granularity (today the whole graph runs inside a single `step.run` in `whatsapp-process.ts`, no per-node checkpoint)
- **Unified observability** — langfuse traces across all channels + tests/UAT

**Key context:** the generation core `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is ALREADY shared by all 3 channels; what diverges is orchestration and the quality/refinement intelligence. Central architectural decision for the phases: graph↔Inngest checkpoint granularity, and whether/how to preserve the web's decoupled ingestion (transcription at upload via separate Inngest jobs `transcribe-audio`/`analyze-photos` vs ingestion inside the graph).

**Progress (2026-06-20):**
- ✅ **Phase 94: Extract Canonical Graph Behind WhatsApp + StepRunner Seam** — shipped 2026-06-20. The WhatsApp `StateGraph` is now a shared, channel-neutral core in `lib/estimate/graph/` (state + `generate`/`assess`/`decide` nodes + `buildEstimateGraph(adapter, { runner })` factory) driven by a `ChannelAdapter` closure-factory (`lib/estimate/adapters/whatsapp.ts`, mirroring `makeQueryTools`). `isVagueEstimate` extracted to `lib/estimate/quality/vagueness.ts` (re-exported from `ask-details.ts`). `generationFailed` generalized to a `failure?: { reason }` state channel — never-throw/always-reply invariant preserved. `StepRunner` passthrough seam injected (DURABLE-01) + `lib/estimate/graph/CHECKPOINTING.md` decision artifact (Inngest is sole durability; NO LangGraph checkpointer — DURABLE-02). Frozen `never-reply-regression.test.ts` (QA-01) green. **Behavior-preserving:** `buildEstimateGraph()` contract stable, `whatsapp-process.ts` untouched, anchor source-text test repointed (paths only, 1 documented `generationFailed→failure` rename); phase-94 scope 237 tests / 0 failures. ENGINE-01..04, CHAN-01, DURABLE-01/02, QA-01 all verified (8/8). 4/4 plans.
- ✅ **Phase 95: Migrate Web + MCP onto Shared Graph (generate-only passthrough)** — shipped 2026-06-20. The `generate-estimate` Inngest job now invokes `buildEstimateGraph(makeDefaultAdapter({ companyId, supabase }))` via a single `step.run('orchestrate-estimate', ...)` instead of calling `generateEstimateForProject` directly. MCP inherits automatically via the same Inngest event (`EVENT_ESTIMATE_GENERATE`) — zero changes to `lib/mcp/tools/write.ts`. The default adapter (`lib/estimate/adapters/default.ts`) has a real `onError` that re-throws so Inngest retry/`onFailure` fires (never-throw invariant). Step ID renamed `call-ai-provider` → `orchestrate-estimate` (safe: no LangGraph checkpointer, jobs replay from start). CHAN-02/03/04 verified; 1530/1540 suite green; 0 new regressions. 2/2 plans.
- ✅ **Phase 96: Intelligence Parity — Auto-Refine + needs_details Surfacing** — shipped 2026-06-20. Added cap=1 auto-refine evaluator-optimizer loop to the shared estimate graph. New core node `autoRefineNode` (`lib/estimate/graph/nodes/auto-refine.ts`, ENGINE-01 neutral — zero `lib/whatsapp/*` imports) fires when `isVague=true && refineAttempts < 1`: increments `refineAttempts`, reverts the $0 estimate, resets `estimateId`/`isVague`, appends a refine-hint to `prompts`, then routes back to `generate` (back-edge `autoRefine → generate`). `checkVagueAfterAssessEdge` replaces the direct `assess → finalize` edge. After one failed auto-refine, default adapter `finalize` writes `projects.status='awaiting_details'` (using closure-captured `companyId`, not `state.companyId` — QA-02) and returns `{ needsDetails: true }` so Inngest job output surfaces the signal to MCP/web callers. `revertVagueEstimate` moved to `lib/estimate/quality/revert.ts` (shared core) with backward-compat re-export from `lib/whatsapp/ask-details.ts` (D-05). `needsDetails: Annotation<boolean | undefined>()` added to canonical state (D-04). WhatsApp adapter/Inngest/MCP unchanged (SMART-02/04/05). SMART-01..05 + QA-02 all verified (6/6). 2/2 plans. _(Observability → Phase 97.)_

## Last Milestone: v4.2 Recording Reliability & Observability ✅ (shipped 2026-05-30)

**Goal:** Make the recording→estimate pipeline reliable and diagnosable — fix the transcription 503, persist every pipeline step, and give Super Admin a Generations-style event log to debug failures without digging through server logs.

**Target features:**
- **Fix the recording 503** — `GET /api/jobs/[jobId]` returns a hard `503 "Inngest not configured"` (missing `INNGEST_SIGNING_KEY`); `use-job-status.ts` surfaces `"Status check failed: 503"` and the capture popup marks "Transcribing" as failed. Completes the unfinished v3.1.1 INNGEST-01 (worker registration/reachability) + INNGEST-06 (idempotency) and makes the status endpoint degrade gracefully with an actionable reason.
- **Pipeline event persistence** — new events store records each step (save recording, transcribe, analyze, generate estimate, preview redirect) with attempt id, project/estimate, user, input type, status, error code, provider, duration, retry count, timestamps. Today only `recording_added` lands in `estimate_activity`.
- **Super Admin event log** — Generations-style UI: recent attempts list, search (user/project/estimate/attempt/error), filters (status/input type/step), success/failure counts, refresh, and a per-attempt detail timeline. User-facing popup stays simple; deep diagnostics live in Super Admin.

**Source spec:** Notion "Recording Failure Investigation — Super Admin Event Logs".

**Progress (2026-05-29):**
- ✅ **Phase 91: Recording Pipeline Reliability** — shipped 2026-05-29. `GET /api/jobs/[jobId]` no longer hard-503s: it returns HTTP 200 with a discriminated `JobStatusContract` (`processing | completed | failed | config_unavailable | not_found`; 401 auth gate preserved). `hooks/use-job-status.ts` `pollJob` resolves a typed `JobResult` and never throws on non-200; the capture popup (`components/capture/capture-failure.tsx`) renders a human-readable reason + i18n Retry / Edit-manually actions instead of a raw status code. Retry reuses a once-minted `attemptId`/`requestId`/`recordingId` (payload-only lineage, no DB column in P91) so already-successful Inngest steps inside `step.run()` with idempotency keys are not re-charged. All 4 remaining `pollJob` consumers (text-describe, photos-input, ai-input-group, capture-recorder) rewired to the discriminant together so no failure is silently swallowed. REC-01..05 all Complete. 2/2 plans, 8 commits, 27 Phase-91 assertions green across 5 suites, tsc clean. 4 behaviors routed to human UAT (non-blocking).
- ✅ **Phase 92: Pipeline Event Persistence** — shipped 2026-05-30. New service-role-only `pipeline_events` store (append-only, one row per step execution) durably records every pipeline transition (`save_recording | transcribe | analyze | generate_estimate | preview_redirect`) across all input types (`recording | photo | manual_text`), with `status` (`started | succeeded | failed`), `duration_ms`, `provider`, `error_*`, and `retry_count`. RLS is deny-all for clients + a single super-admin `FOR SELECT` policy (`platform_admins`/`auth.uid()`) — the read contract Phase 93 consumes. A single best-effort `recordPipelineEvent()` helper (`lib/observability/pipeline-events.ts`) writes via `requireServiceClient()` and **swallows all failures** (`console.warn`, never throws) so observability can never regress the Phase 91 reliability. Instrumented all 6 server boundaries (3 routes + 3 Inngest functions incl. `onFailure`) plus a server-side `preview_redirect` marker. Phase 91 `attemptId` lineage reused and a new explicit `inputType` threaded through every entrypoint + payload + route (closed the `AnalyzePhotosPayload` attemptId gap); `retry_count` increments on repeat `attempt_id + step`. EVENT-04 (`estimate_activity recording_added` write) preserved byte-for-byte and regression-tested. Additive only — no pipeline behavior change, no UI. EVENT-01..04 all verified (4/4). 4/4 plans, ~12 commits, 24 Phase-92 assertions green across 6 suites, tsc clean. 1 manual UAT (live DB row inspection) pre-declared. Migration applied to remote via one-off `pg` applier (db-push blocked on pre-existing remote history drift); types regen'd via PAT `--project-id` (no-Docker path).
- ✅ **Phase 93: Super Admin Event Log UI** — shipped 2026-05-30. New Super Admin route `app/admin/events/` reads the Phase 92 `pipeline_events` store and turns it into a Generations-style diagnostics console. **Attempt-grouped list** (`page.tsx`) backed by a net-new `pipeline_attempts` Postgres view (`security_invoker = on`, `GROUP BY attempt_id`, `BOOL_OR` terminal-status precedence failed>started>succeeded, `ARRAY_AGG` step_reached, durations, retry indicator) — server-side offset pagination (~50/page, `.range()` + `.order('last_at', desc)` + `count:'exact'`). **Server-side multi-field search** via a pure `buildSearchOr()` helper that `.eq`'s UUID columns only for valid-UUID terms and `ILIKE`'s error text (avoids the ilike-on-uuid Postgres trap); email terms (`@`) resolve to `user_id` via `svc.auth.admin.listUsers`. **URL-param filters** (status/input_type/step → `.eq()`) with success/failure **counts computed over the whole filtered set** (3 parallel `count:'exact',head:true` queries, not just the page) and **manual refresh** via `router.refresh()` (no auto/live). **Dedicated detail page** `[attemptId]/page.tsx` (raw events `created_at ASC`, `notFound()` on empty) renders a net-new vertical `EventStepTimeline` (left-rail dot+connector glass step cards, status color map). **ADMINLOG-05 safe-metadata guard is structural** — a 15-column `SAFE_EVENT_COLUMNS` whitelist is the only thing selected/rendered; static-source tests assert zero `transcript|audio|apiKey|payload|raw` tokens in any event-log file. **Authz is load-bearing**: because `requireServiceClient()` bypasses RLS (Phase 92's super-admin SELECT policy is inert under service role), `requireAdmin()` is called FIRST on both routes — verified by index-position tests. EN/PT-BR/ES i18n throughout. ADMINLOG-01..05 all verified (7/7 must-haves). 4/4 plans, ~12 commits, 9 admin test files / 62 assertions green + 23 prior-phase files / 93 assertions green (no regressions), tsc clean. View applied to remote via one-off `pg` applier (db-push still blocked on remote history drift). 2 manual UAT items (live filter-count accuracy + visual timeline) pre-declared, non-blocking.

**v4.2 Recording Reliability & Observability is COMPLETE — all 3 phases (91, 92, 93) shipped.**

## Last Milestone: v3.1 Production Go-Live (rescoped) ✅ (shipped 2026-05-15)

Phase 61 only — production database foundation. Built cross-platform RLS audit infrastructure (`supabase/audits/`), recovered 9 missing migrations (entire v3.0 monetization schema was on disk but never applied to DB!), wrote production bootstrap runbook (`supabase/PROD-BOOTSTRAP.md`). Phases 62-65 (Vercel deploy + Stripe live + monitoring + UAT) **deferred to v3.2** — Vercel Free Hobby plan blocks commercial SaaS use AND has 10s function timeout that breaks AI routes. Tracked in **SEED-018: Production Hosting + Deployment**.

## Last Milestone: v3.0 Monetization ✅ (shipped 2026-05-14)

Complete subscription system: Free/Trial/Pro/Business tiers, `usage_events` tracking, `checkQuota`/`recordUsage` enforcement across all AI routes and WhatsApp handler, Stripe checkout + portal + webhook lifecycle, `/settings/billing` UI with trial banner and 402 upgrade modal, hourly trial expiry cron + T-3/T-0 warning emails, admin force-tier + bonus credits + MRR view. 6 phases, 24/24 requirements satisfied.

## Last Milestone: v4.1 MCP Server ✅ (shipped 2026-05-26)

OAuth 2.0 authorization server (RFC 8414/9728/7591, PKCE S256, sha256-hashed token storage, refresh-token rotation) shipped at `app/oauth/*` + `app/.well-known/*`. `/api/mcp` Streamable HTTP endpoint with Bearer auth and CORS for Claude.ai origins. 6 MCP tools (`list_estimates`, `get_estimate`, `list_clients`, `list_projects`, `create_estimate` async, `check_job_status`) with annotation-driven auto-grouped permission UI in Claude.ai. Self-service settings page at `/settings/integrations/mcp` with copy-paste `claude mcp add` snippet + Claude.ai / Claude Desktop / ChatGPT instructions. Async pattern reuses existing Inngest pipeline — `create_estimate` returns `job_id` immediately; `check_job_status` polls. 5 phases (86, 87, 88, 89, 90), 7 new test files (~152 assertions), 118 MCP-specific tests green, 1 prod migration applied. Full archive: [.planning/milestones/v4.1-ROADMAP.md](milestones/v4.1-ROADMAP.md).

## Previous Milestone: v4.0 Multi-Tenancy ✅ (shipped 2026-05-26)

Multi-company foundation, Switcher UI, full RLS rewrite (46 policies / 13 tables), server-action sweep (11 files codemodded), billing per-company (already per-company at the data layer), and multi-company access on the `companies` table via OR-extended RLS. A user can now own and operate multiple companies end-to-end via the Switcher UI, with correct tenant scoping at the DB layer, the action layer, and the UI layer. DROP COLUMN `companies.user_id` deferred to v5+ cleanup. Full archive: [.planning/milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md). 6 phases (79, 80, 81, 82, 83, 84, 85), 16 plans, 11 new test files, 98/98 tests green, 4 prod migrations applied.

## Next Milestone

Run `/gsd:new-milestone` to define the next cycle. Candidates surfaced during v4.0 work:
- **v4.1 Inngest self-hosted on Hetzner** — placeholder phase 999.1 in current roadmap; aligned with SEED-018 (production hosting).
- **v4.2 Cleanup of `companies.user_id`** — picks up where Phase 85 stopped; depends on refactoring auth.ts redirect, company.ts mode:'first', and inngest transcribe-audio attribution off the legacy column.
- **v5.0 Admin/Member roles + invites** — opens `company_members.role` to non-owner tiers; needs a full product pass on permissions matrix.
- **MCP Server (SEED-030 trigger)** — locked decisions captured in `.planning/seeds/SEED-030-mcp-server-xtimator.md`; activates once the core estimates pipeline is end-to-end stable in production.

## Archived Milestone Context: v4.0 Multi-Tenancy (Multiple Companies per User)

**Goal:** A single user can own and switch between multiple companies; every tenant-scoped surface (projects, clients, estimates, price book, integrations, billing, notifications) is gated by the active company instead of `auth.uid()`.

**Target features:**
- **Schema:** `company_members(user_id, company_id, role)` join table + idempotent migration that backfills 1 owner membership per existing `companies.user_id`
- **Active company tracking:** session cookie holds `active_company_id`; server actions derive company from cookie, not from the authenticated user
- **Switcher UI:** topbar dropdown lists all companies the user belongs to, marks active, switches via server action (set cookie + revalidate)
- **"Add company" flow:** dropdown's Add company entry-point invokes onboarding in "create new" mode (no longer overwrites existing company)
- **RLS rewrite:** every tenant-scoped table (projects, clients, estimates, estimate_items, estimate_templates, company_price_book, integrations, notifications, custom_domains, whatsapp_settings, etc.) gates by membership of the active company instead of `user_id`
- **Billing per-company:** `tier`, `tier_trial_ends_at`, Stripe customer id, usage_events all move to per-company semantics; trial clock starts on company creation, not user signup
- **Server-action sweep:** ~20 server actions in `lib/actions/*.ts` rewritten to derive company id from the active session

**Locked decisions:**
- **Roles:** Owner only for this milestone (no Admin/Member tier)
- **Invites/teams:** explicitly out of scope (future milestone) — one user can own multiple companies, but a company has exactly one user
- **Stripe Connect:** stays per-company (already aligned)
- **Backwards compat:** zero re-onboarding — migration auto-creates 1 owner membership per existing company

**Progress (2026-05-26):**
- ✅ **Phase 79: Foundation (schema + cookie + active company resolution)** — shipped 2026-05-25. `company_members(user_id, company_id, role)` table live in prod (3 owners backfilled), RLS enabled; `getActiveCompanyId` / `getActiveCompany` helpers; `createOrUpdateCompany(mode: 'first' | 'add')`; `app/(app)/layout.tsx` switched to active-company resolvers. No UI in this phase by design. 4/4 plans, 15 commits, 38/38 tests green.
- ✅ **Phase 81: Company Switcher UI + Add Company flow** — shipped 2026-05-26. `getMembershipCompanies()` query, `switchActiveCompany()` server action with discriminated-union return, CompanySelector wired with `useTransition` and mounted in BOTH sidebar render trees (collapsed + expanded), onboarding `?mode=add` threading end-to-end (page → survey → `createOrUpdateCompany`). 4/4 plans, 13 commits, 31/31 Phase 81 tests green. Mobile switcher deferred (SWITCH-15).
- ✅ **Phase 82: RLS rewrite** — shipped 2026-05-26. 46 tenant-scoped policies across 13 tables (clients/projects/estimates/estimate_items/estimate_sections/estimate_activity/recordings/photos/company_price_book/price_book_folders/price_book_imports/estimate_deliveries/estimate_signatures/tour_events) now gate by `company_members` membership. In-migration DO $$ assertion. Static-contract test 6/6 green.
- ✅ **Phase 83: Server-action sweep** — shipped 2026-05-26. 11 server-action files codemodded to derive company via `getActiveCompanyId()` + `.eq('id', activeCompanyId)`. 3 files allowlisted (auth.ts redirect, company.ts mode:'first', active-company.ts internal). Static-contract test 24/24 green.
- ✅ **Phase 84: Billing per-company** — closed as already-shipped-by-prior-work. All billing columns live on `companies` (Phase 55+58+70), `usage_events` keyed by `company_id` (Phase 56), `/settings/billing` scopes via `getActiveCompany()` post Phase 79. No code change needed.
- ✅ **Phase 85: Multi-company access on companies** — shipped 2026-05-26. `companies_*` RLS extended with OR-clause for `company_members` membership; `mode:'add'` now sets `user_id: claims.sub` (latent bug fix). DROP COLUMN deferred to v5+ — chain of legacy readers (auth.ts, company.ts mode:'first', inngest transcribe attribution) keeps the column alive for backwards compat.

**v4.0 status:** All target features either shipped or correctly scoped out. Foundation (79), Switcher UI (81), RLS rewrite (82), server-action sweep (83), billing per-company (84 — pre-shipped), multi-company access on companies (85). A user can now own and operate multiple companies end-to-end via the Switcher UI, with correct tenant scoping at the DB layer, the action layer, and the UI layer.

**Out of scope (captured for future milestones):**
- Inviting other users to existing companies
- Role-based permissions (Admin vs Member)
- Cross-company analytics in admin panel
- Per-user "default company" preference (cookie is sufficient for v4.0)

## Previous Milestone (in progress): v3.1.1 Quality & Polish + Hetzner Readiness

**Goal:** Validate the entire app stack against the recovered DB schema (v3.0 monetization was never functionally tested before Phase 61), fix any bugs that surface, and ship the deploy artifacts (Dockerfile + `/api/health` + runbook) needed to make the future Hetzner Cloud migration mechanical instead of exploratory.

**Target features:**
- **UAT v2.2** — manual exercise of PDF attachment delivery + WhatsApp status flow against localhost
- **UAT v3.0** — manual exercise of tier enforcement, Stripe checkout (test mode), billing UI, trial banner, 402 upgrade modal, trial expiry cron, admin force-tier
- **End-to-end smoke** — signup → onboarding → audio capture → AI estimate → share link
- **Bug triage** — every bug found gets fixed (critical) or documented in `.planning/known-issues.md` (non-critical)
- **Hetzner readiness** — `Dockerfile` + `/api/health` endpoint + `HETZNER-DEPLOY.md` runbook so v3.2 (deploy) is mostly mechanical

**Hosting decision (locked for v3.2):** Hetzner Cloud VPS (CX22/CX32, ~€4-7/mo). Coolify or Docker + Caddy for the Next.js host + cron + reverse proxy. Supabase stays managed (no DB migration needed). See **SEED-018**.

**Last shipped:** Phase 70 — Stripe Connect Customer Payments (2026-05-17)

### What Phase 70 Adds (opt-in only — zero impact on companies that don't connect)
- **Settings → Payments** sub-page with one-click "Connect Stripe Account" (OAuth Standard) + Disconnect
- **"Pay $X" button** on shared estimates when company has Stripe connected (and estimate is unpaid)
- **Stripe Checkout** on the business's connected account (direct charges, 0% application fee, funds settle to business's Stripe balance)
- **Webhook auto-marks** estimates as paid (`payment_status`, `paid_at`, `payment_amount_cents`) on `checkout.session.completed` from connected accounts
- **Branded emails** via Resend: business owner receives "You received $X" notification, customer receives "Payment confirmation" receipt
- **Success/cancel banners** on share page after Stripe redirect; "Paid" badge on dashboard estimate list
- **Admin gate**: platform owner adds `stripe_connect_client_id` via `/admin/integrations`; without it, feature degrades gracefully to "contact support" message
- **Setup runbook**: `docs/STRIPE-CONNECT-OWNER-SETUP.md` (8 sections, 184 lines) for the manual Stripe Dashboard configuration the owner does once

## Current State

**Version:** v2.1 WhatsApp Launch-Readiness — ✅ COMPLETE
**Phases complete:** 52/52 | **Build:** passing | **Tests:** 170/170 passing across all v2.1 suites
**Last shipped:** Phase 54 — WhatsApp Status Flow (2026-05-13)
**Tech stack:** Next.js 16 (App Router), TypeScript strict, Tailwind 4, shadcn/ui (New York), Supabase (Auth + DB + Storage), @react-pdf/renderer, Resend, Anthropic Claude, OpenAI Whisper, next-themes
**Test coverage:** 250+ unit tests passing, integration tests, E2E with Playwright (mobile + landing page + voice flow coverage)
**Deployment target:** Vercel

### What's Live
- **Auth:** Email/password + Google OAuth, session persistence, password reset, middleware protection
- **Onboarding:** Multi-step wizard (business info, industry, color, logo, address, defaults)
- **Dashboard:** Stats, project list, search/filter/sort, quick actions
- **Client management:** CRUD with logo upload, contact info, project association
- **Project workspace:** 5-tab workspace (Overview, Audio, Photos, Estimate, Send), activity timeline
- **Voice-first capture:** Full-screen recorder (`/projects/[id]/capture`), 10-min hard cap with color-escalating timer, SVG progress ring, multi-stage stepper (Saving → Transcribing → Analyzing → Generating), Whisper transcript reveal, auto-fire estimate generation on transcription complete
- **AI pipeline:** Claude Vision photo analysis + Claude estimate generation (tool_use), structured JSON persistence, version management, retry/manual fallback
- **Estimate editor:** Inline editing, real-time recalculation, drag reorder, discount/tax, auto-save
- **PDF:** Branded via @react-pdf/renderer — logo, colors, line items, totals, terms, page numbers
- **Share/email:** Public share link + branded share page, accept/decline, Resend email delivery
- **Settings:** Company info, logo, branding, defaults, notifications, account
- **Platform admin:** API credentials (AES-256-GCM encrypted), branding, admins management
- **Owner admin:** Customer dashboard, SEO editor, landing page CMS, blog (CRUD + public `/blog/[slug]`), favicon upload
- **Sidebar:** Paginated projects list, real-time sync on creation, empty state
- **Navigation:** Skeleton loading states, streaming Suspense, React cache() for auth/company queries
- **Landing page:** Public dark-mode marketing page — Hero (#406EF1 glow), How It Works, Features, CTA, footer
- **i18n:** EN/PT-BR/ES — LanguageContext + useTranslation(), 192-entry static dict, /api/translate (Claude Haiku + DB cache), LanguageToggle in navbar + mobile bottom-nav
- **Brand:** #406EF1 primary across all surfaces (landing, authenticated app, admin)
- **Icons:** App Router-owned favicon, SVG/PNG app icons, manifest metadata
- **Price book:** `/settings/price-book` — CRUD for company-scoped pricing (category + name + unit + unit_price + notes), search, alphabetical category grouping, AlertDialog delete confirmation, EmptyState explaining optionality. Underlying `company_price_book` table with RLS isolation per company.
- **CSV import:** "Import CSV" button in price book header + EmptyState triggers a Dialog modal — client-side papaparse parse, two-stage pick→preview with per-row error indicators, server-side dedup by (name, category), single bulk `supabase.insert()`. Downloadable 4-column template at `/price-book-template.csv`. (PB-05)
- **Multi-provider AI + price anchoring:** `lib/ai/` abstraction layer (`AIProvider` interface + `AnthropicAdapter` + `GeminiAdapter` with `gemini-2.5-flash`). `getAIProvider()` reads active provider from `platform_integrations` (zero env vars). Price book injected as system prompt context; `price_source` tagged per line item and persisted to `estimate_items`. Admin panel: Gemini key card + live provider switch.
- **Estimate editor price badges:** "Price book" (`CheckCircle2`, secondary variant) and "AI estimate" (`Zap`, outline) badges per line item. "Edited" badge on manual unit_price override; `price_source = null` on save. Null-safe for pre-v1.3 estimates.

## Requirements

### Validated (v1.0)

- ✓ AUTH-01–07: Email/password sign-up, sign-in, Google OAuth, session persistence, password reset, post-signup redirect, sign-out — v1.0
- ✓ ONBOARD-01–08: Multi-step onboarding wizard (business info, industry, color, logo, address, defaults, skip option) — v1.0
- ✓ DASH-01–08: Dashboard with stats, project list, search/filter/sort, quick actions, delete confirm — v1.0
- ✓ CLIENT-01–06: Client CRUD with logo upload, contact info, project association — v1.0
- ✓ PROJ-01–08: 3-step project wizard (client selection/inline creation, details, auto-name, confirmation, workspace redirect) — v1.0
- ✓ WS-01–03: 5-tab project workspace (Overview, Audio, Photos, Estimate, Send), activity timeline, status updates — v1.0
- ✓ AUDIO-01–10: MediaRecorder with waveform, timer, live transcript preview, Whisper transcription, editable transcript, delete/re-record, multi-recording concatenation, mobile support — v1.0
- ✓ PHOTO-01–11: Multi-file upload, camera capture, drag-and-drop, compression, sortable grid, lightbox, captions, 20-photo limit — v1.0
- ✓ AI-01–10: Claude Vision photo analysis, Claude estimate generation with tool_use, structured JSON persistence, math validation, progress indicator, version management, retry/manual fallback — v1.0
- ✓ EDIT-01–12: Inline estimate editor with real-time recalculation, drag reorder, discount/tax, auto-save, version selector — v1.0
- ✓ PDF-01–03: Branded PDF via @react-pdf/renderer with logo, colors, line items, totals, terms, page numbers — v1.0
- ✓ SHARE-01–07: Public share link, branded share page, accept/decline, view logging, activity timeline, email notifications — v1.0
- ✓ EMAIL-01–06: Resend email delivery, compose form, PDF attachment option, mark-as-sent, status update — v1.0
- ✓ SET-01–06: Company info/logo/branding/defaults/notifications/account settings — v1.0
- ✓ ADMIN-01–14: Platform admin panel (super-admin gate, integrations CRUD with encrypted keys, branding config, admins management, auth dark pass, full env-var and identity decoupling) — v1.0

### Validated (v1.1)

- ✓ THEME-01–08: Dark mode default with SSR cookie hydration, 3-way user toggle (dark/light/system) persisted to `companies.theme_preference`, forced-light `/estimate/*` scope, semantic status palette, survey-style onboarding, full UI primitives + overlays redesign — v1.1

### Validated (v1.2)

- ✓ BRAND-01–03: Global brand token update — #406EF1 as `--primary`/`--platform-primary` default across entire app (landing + authenticated + admin) — v1.2
- ✓ LAND-01–05: Landing page — Hero+CTA, How It Works, Features/Benefits, dark mode, #406EF1 design system, fully responsive on iOS/Android — v1.2
- ✓ I18N-01–08: i18n system — LanguageContext (EN/PT/ES), `useTranslation()` hook, 192-entry static dictionary, `/api/translate` AI on-demand with DB cache, `LanguageToggle` in navbar + mobile bottom-nav; English-first — v1.2
- ✓ ICON-01–02: App Router-owned favicon, SVG/PNG app icons, manifest metadata, regression suite — v1.2
- ✓ AUTH-HARDEN-01–07: Auth redirect consistency, password recovery, OAuth error handling, middleware hardening, full Playwright auth coverage — v1.2
- ✓ ADMIN-EXT-01–05: Owner admin panel — customer dashboard, SEO editor, landing page CMS, blog CRUD + public pages, favicon upload, extended branding — v1.2
- ✓ PROJ-10–12: Sidebar projects panel — paginated list, active highlight, real-time sync on project creation — v1.2
- ✓ PERF-01–03: Skeleton loading states, Suspense streaming, React cache() for auth/company, HoverPrefetchLink — v1.2
- ✓ P18-01–09: Voice-first project onboarding — 1-step wizard, full-screen capture route, 10-min recording with color timer + SVG ring, multi-stage stepper, auto-estimate generation — v1.2

### Validated (v1.4)

- ✓ BULKPRICE-01, BULKPRICE-02, BULKPRICE-03: Bulk Price Adjustment — `bulkAdjustSchema` (z.coerce.number, -100 to +500), `bulkAdjustPriceBookCategory` server action (`.upsert()` atomicity, per-item computed prices), `BulkAdjustDialog` (live useMemo preview, green/red color coding), "Adjust %" button on each category header (unfiltered items guard) — Phase 26, 2026-05-08
- ✓ PLAINTEXT-01, PLAINTEXT-02, PLAINTEXT-04: Plain Text Tab + Copy UI — `buildItemsBreakdown()` pure utility, `PlainTextCard` component in Send tab (editable textarea, clipboard copy + toast, RotateCcw reset), full data chain wired through workspace (owner_name + 4 template columns from company), `key={estimate.id}` version-change guard — Phase 25, 2026-05-08
- ✓ PLAINTEXT-03, PLAINTEXT-05: Estimate Template Engine — 4 nullable TEXT columns on `companies` (`estimate_template_greeting/opener/closer/signature`), `resolveTemplate()` pure utility with `TEMPLATE_DEFAULTS` fallback, zod schema, `getEstimateTemplateSettings()` query, `saveEstimateTemplate` server action (empty→null coercion), `EstimateTemplateForm` (4 textareas + variable docs + live preview), `/settings/estimate-templates` sub-route page, Estimate Templates card on `/settings` — Phase 24, 2026-05-08

### Validated (v1.3)

- ✓ Phase 19 — Price Book DB Foundation: `company_price_book` table with RLS isolation, `estimate_items.price_source` CHECK column, regenerated TypeScript types (PB-DB infrastructure prerequisite for PB-01..07, AIPRICE-03, EDITPRICE-01/02) — Phase 19, 2026-05-06
- ✓ PB-01, PB-02, PB-03, PB-04, PB-06, PB-07: Price Book CRUD UI — `/settings/price-book` route with grouped list, search, add/edit dialog (Combobox category autocomplete), delete with AlertDialog confirmation, optionality EmptyState, Settings entry-point card — Phase 20, 2026-05-07
- ✓ PB-05: CSV Import — two-stage Dialog (pick → preview), client-side parse with papaparse, server-side dedup, single bulk insert, invalid-row error indicators, downloadable template — Phase 21, 2026-05-08
- ✓ AIPRICE-01/02/03: AI Price Anchoring — multi-provider layer (Claude + Gemini), price book injected as prompt context, price_source tagged + persisted, fallback to market rates when empty, admin provider selector — Phase 22, 2026-05-08
- ✓ EDITPRICE-01/02: Estimate Editor Price Badges — "Price book" (CheckCircle2, secondary) + "AI estimate" (Zap, outline) badges per line item; "Edited" badge on manual override; price_source=null on save; null-safe for pre-v1.3 estimates — Phase 23, 2026-05-08

### Validated (v3.0)

- ✓ TIER-01..04: Subscription schema (6 companies columns + usage_events table) + lib/entitlements.ts (Free/Trial/Pro/Business, number|null limits) + 14-day trial on signup — Phases 55-56, 2026-05-13
- ✓ QUOTA-01..06: checkQuota + recordUsage with idempotency; enforced in generate-estimate, analyze-photos, WhatsApp handler; HTTP 402 on quota exceeded — Phases 56-57, 2026-05-14
- ✓ STRIPE-01..04: Checkout session + Customer Portal + webhook handler (4 lifecycle events, idempotent via processed_stripe_events) — Phase 58, 2026-05-14
- ✓ BILLING-01..05: /settings/billing page (plan card + usage meters + upgrade CTA) + trial banner (<3 days) + 402 upgrade toast — Phase 59, 2026-05-14
- ✓ TRIAL-01..02: Hourly cron trial expiry + daily T-3/T-0 Resend warning emails — Phase 60, 2026-05-14
- ✓ ADMIN-BILLING-01..03: Admin force-tier + bonus credits + MRR view at /admin/billing — Phase 60, 2026-05-14

### Pending (production infra)

- [ ] Production Supabase migrations applied (all phases 19–60)
- [ ] Stripe products + price IDs configured in Stripe Dashboard (STRIPE_PRO_PRICE_ID, STRIPE_BUSINESS_PRICE_ID env vars)
- [ ] Stripe webhook endpoint registered and STRIPE_WEBHOOK_SECRET set
- [ ] First super-admin bootstrapped in production
- [ ] Vercel deployment pipeline configured and first production deploy successful

### Out of Scope

- Pricing section on landing page — deferred (pricing model not yet defined)
- Client portal (clients log in) — public share link covers v1 use case
- Per-tenant language settings — app-level toggle covers this milestone
- QuickBooks integration — deferred to v2
- Offline PWA mode — deferred to v2
- Dashboard charts/analytics — deferred to v2
- Multi-user/team accounts — deferred to v2
- Per-tenant API keys — platform shared credentials via admin panel covers v1

## Context

- **Target market:** United States only. USD, US formats, US market pricing.
- **Primary use case:** Field-first — business owner on a job site on their phone.
- **AI pipeline:** Claude API (estimate generation + photo analysis) + OpenAI Whisper (audio transcription).
- **Storage:** Supabase Storage (logos, audio, photos, PDFs, platform brand assets).
- **Email:** Resend API — centralized via platform admin, no per-tenant key needed.
- **Platform admin:** AES-256-GCM encrypted API credentials in `platform_integrations`; branding in `platform_branding` singleton (id=1); super-admin gate via `platform_admins` table + proxy middleware.
- **Voice-first flow:** `/projects/new` → client select → `/projects/[id]/capture` (full-screen, escapes app shell) → Whisper → Claude → auto-redirect to estimate editor.
- **Codebase:** 54 plans shipped, 200+ commits, TypeScript strict throughout.
- **Theme system:** `next-themes` with `eb-theme` cookie SSR hydration; `[data-theme]` scoped-dark CSS-var pattern for admin/auth; `[data-theme="light"]` forced-light wrapper for public estimate view.
- **i18n:** `LanguageContext` + `useTranslation()` hook, 192-entry static `translations.ts`, `/api/translate` with Claude Haiku + DB cache (translations table, unique index on source_text+lang pair).
- **Seeds harvested:** SEED-001 (i18n → v1.2), SEED-002 (brand identity → v1.2), SEED-003 (price book → v1.3), SEED-004 (plain-text estimate → v1.4), SEED-005 (multi-modal input → v1.5/v1.6), SEED-006 (iterative refinement → v1.8), SEED-007 (frictionless client → v1.5/v1.7), SEED-008 (WhatsApp → v2.0), SEED-009 (custom domain → v1.9), SEED-010 (debounce → v2.1), SEED-011 (WhatsApp polish → v2.1), SEED-012 (Redis rate limiting → v2.1), SEED-013 (monetization → v3.0), SEED-014 (error handling → v2.1), SEED-016 (per-estimate language → v2.1).
- **Seeds cancelled:** SEED-015 (WhatsApp channel completeness — all gaps harvested across v2.1/v2.2; provider abstraction gap dropped as unnecessary).
- **Seeds dormant:** none — all 16 seeds resolved.

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
| Next.js App Router (not Pages) | Modern routing, server components, API routes co-located | ✓ Confirmed — no issues |
| Supabase for auth + DB + storage | Single vendor reduces integration complexity | ✓ Confirmed — worked well |
| Claude for estimate generation and photo analysis | Avoid mixing AI vendors; Claude Vision capable | ✓ Confirmed — tool_use pattern solid |
| Whisper for audio transcription | Best-in-class accuracy for field audio | ✓ Confirmed |
| @react-pdf/renderer for PDF | No headless browser in serverless | ✓ Confirmed — works on Vercel |
| Resend for email | Simple API, great deliverability | ✓ Confirmed |
| AES-256-GCM for API key encryption | Standard, auditable, no Vault dependency | ✓ Confirmed — 12-byte IV per call |
| Singleton platform_branding (id=1) | Null-safe loader fallback from t=0 | ✓ Confirmed — avoids null checks everywhere |
| Last-admin BEFORE DELETE trigger | Descriptive error message vs opaque constraint | ✓ Confirmed |
| server-only marker + vitest alias | Enforces server/client boundary at both build and test | ✓ Confirmed — caught real violations |
| Deny-all RLS by omission on platform tables | Platform secrets accessible only via service role | ✓ Confirmed — cleanest posture |
| YOLO execution mode | Spec was comprehensive; minimal approval gates needed | ✓ Confirmed |
| `theme_preference` nullable TEXT + CHECK constraint | Enum-like enforcement without a PG enum type; NULL = system default | ✓ Confirmed |
| `eb-theme` cookie httpOnly:false | next-themes needs document.cookie access pre-hydration for zero-FOUC | ✓ Confirmed |
| Full-screen (capture) route group | Escape app shell for voice recorder; router.push from wizard | ✓ Confirmed — clean UX break |
| Eager project draft creation at wizard step 1 | Allows redirect to /capture before user fills project details | ✓ Confirmed — drives AI auto-generate flow |
| pg_cron primary + Vercel cron fallback for orphan cleanup | Works with and without pg_cron extension enabled | ✓ Confirmed |
| React cache() for auth/company queries | Dedupes server component data fetching per request | ✓ Confirmed — eliminates redundant round-trips |
| useTranslation() hook with LanguageContext | All i18n calls consistent; server-side strings handled separately | ✓ Confirmed |
| Claude Haiku for /api/translate | Cheapest capable model for translation; cached in DB | ✓ Confirmed — cost-effective |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via /gsd:complete-milestone):
1. Full review of all sections
2. Core Value check
3. Audit Out of Scope
4. Update Context

---
*Last updated: 2026-07-26 — Milestone v4.22 Product-Native Demo started. The standalone public demo will be replaced by an isolated, read-only session inside the real product UI. Historical phase directories are intentionally preserved because this legacy roadmap has not archived phases 1-179.*
