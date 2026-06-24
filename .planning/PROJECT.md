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

## Current Milestone: v4.8 Industry Knowledge Base — Channel-Neutral Conversational Assistant

**Goal:** Give the business owner a conversational assistant that answers trade how-to questions ("how do I pre-treat a pet stain on carpet?") from a per-INDUSTRY knowledge base (super-admin curated, scoped by `companies.industries[]`), plus an optional per-company private KB overlay — served by a channel-neutral `lib/knowledge/` domain module and consulted via WhatsApp (the web-chat + MCP channels follow in later milestones). The FOUNDATION of the Multi-Channel Core track.

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
*Last updated: 2026-06-24 — v4.7 Monetização (Credit-Based Billing + Estimate Payment Fee) STARTED. Transforms count-based tiers into a credit model (debit = real OpenRouter/Whisper cost × markup, super-admin-configurable via `billing_config`, Stripe as rail) + a 1% application fee on estimate payments with total payment-UI gating + fee disclosure. Foundation: capture real OpenRouter cost (today only tokens). Design in SEED-035 + SEED-036. Numbering continues — v4.7 starts at Phase 110. Defining requirements next.*
