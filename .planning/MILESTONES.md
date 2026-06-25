# Milestones

## v4.11 Advanced Pricing Model — Per-Item Tax, Discounts, Deposit & Markup (Shipped: 2026-06-25)

**Phases completed:** 6 (129, 130, 131, 132, 133, 134) · full unit suite green (2429 passing; only the known mcp-route-contract parallel-flake)

**Goal (delivered):** Enrich the estimate PRICING MODEL (not the calculator) so the existing server-side deterministic GUARD-03 math engine computes the elements every US service business uses — per-item taxability (labor vs materials), discounts (line + global), deposit/down-payment (balance due), and markup (cost → price) — without giving the AI a calculator. The arithmetic integrity already existed (GUARD-03, never-trust-LLM); this milestone added the DATA MODEL + math the engine computes. The AI gained ZERO arithmetic: it only classifies (labor/materials) and provides inputs (qty, unit_price or cost). Every legacy estimate stays byte-identical. The LAST green seed from the n8n-MVP-analysis backlog — the backlog is now fully complete. Source: [SEED-032](seeds/SEED-032-advanced-pricing-model-tax-discount-deposit.md).

**What shipped, phase by phase:**
- **Schema Foundation + GUARD-03 Engine Scaffold + Retrocompat Lock (129)** (TAX-01, ENG-01, ENG-02) — one idempotent authored-only migration `20260627000001` landing 9 DORMANT columns (`estimate_items` taxable/tax_category/discount/cost/markup_pct, `estimates` deposit_type/deposit_value/balance_due, `companies` tax_config) and REUSING the existing `estimates.discount_*`. The GUARD-03 math was extracted into the pure `lib/estimate/compute-totals.ts` helper BYTE-IDENTICALLY (no number drift). The ENG-02 golden (`850.99` / `85.1` / `936.09`) is the standing retrocompat guard; ENG-01 is a static no-AI-calculator fence (the AI computes none of tax/discount/deposit/markup). Ships dormant — zero behavior change.
- **Per-Item Taxability (130)** (TAX-02, TAX-03) — the AI output schema/types carry `taxable`/`tax_category` per item: the AI CLASSIFIES labor/materials (optional inputs) but NEVER computes tax. The server math computes tax PER-CATEGORY from `companies.tax_config` (per-category rate or a "labor exempt" rule) instead of a flat `subtotal × rate`; when `tax_config` is absent the flat fall-through is byte-identical (retrocompat). The labor-exempt golden is `40` / `1540`.
- **Discounts (131)** (DISC-01, DISC-02) — an optional per-line discount AI input + a global discount reusing `estimates.discount_*`. The LOCKED sequence (line_net → subtotal → disc_global → prorate into the per-category taxable base → tax → grandTotal) applies the discount BEFORE tax (US norm, configurable per company). Goldens `1440` / `1890` / `1296`. The engine persists the real discount values.
- **Deposit + Markup + Stripe Contract (132)** (DEP-01, DEP-02, MARK-01) — deposit + `balance_due` math (LOCKED: `deposit = grandTotal×pct | amount`; `balanceDue = grandTotal − deposit`). A pure `resolveChargeAmount` (`lib/billing/charge-amount.ts`) — the 1% application fee computes on the amount ACTUALLY CHARGED (the deposit when set, else the total), reusing the existing `computeApplicationFee`, wired into `invoice.ts` (the SEED-020/SEED-036 contract). Server-derived `unit_price = cost × (1 + markup_pct)` (never-trust-LLM; an explicit price wins). Goldens: deposit `275`/`825` & `400`/`700`, markup `100`→`200`, charge `250`/`400`/`1000`.
- **Editor UI (133)** (PUI-01) — `saveEstimate` widened to ACCEPT + PERSIST the new fields and RECOMPUTE server-side (GUARD-03 proven — a client-submitted total of `999999` is discarded). The desktop `SortableDocumentItemRow` + the mobile `item-card-mobile.tsx` gained per-line discount + taxable controls; the totals panel gained deposit controls + Balance Due. i18n en/pt/es. Retrocompat no-op defaults.
- **PDF + Plain-Text Totals (134)** (PUI-02) — a shared `deriveDepositDisplay` seam reads the PERSISTED totals (no recompute). The ordered block Subtotal → Discount → Tax → Total → Deposit → Balance Due renders in all 3 channels (PDF `estimate-pdf.tsx`, the public share view, the WhatsApp/MCP plain-text formatter); deposit columns added to the caller selects. i18n en/pt/es. Legacy estimates byte-identical.

**Architecture invariants honored:** ALL new arithmetic stays SERVER-SIDE and DETERMINISTIC — the AI gained ZERO arithmetic (it only classifies/provides inputs; NO calculator tool, which would reintroduce the n8n calculator's 3 LLM-failure points). The new math EXTENDS the single GUARD-03 authority (the pure `lib/estimate/compute-totals.ts`), NOT a parallel engine. Retrocompat is mandatory and proven: the `850.99`/`85.1`/`936.09` + `40`/`1540` + `1440`/`1890`/`1296` goldens are standing regression guards — every already-generated estimate is byte-identical on the happy path. Mirrored across web/WhatsApp/MCP because the math engine is the shared core — the richer totals appear everywhere with no channel-adapter changes. Migrations idempotent + authored-only (deploy via CI→GHCR→Coolify).

**Milestone significance:** this enriches the estimate's PRICING MODEL with the elements every US service business needs (per-item tax, line+global discount, deposit/balance-due, cost→markup) computed entirely by the deterministic server-side engine — the AI is a classifier, not a calculator. It is the LAST green seed from the n8n-MVP-analysis backlog: that backlog is now FULLY COMPLETE.

**Operational deferrals (carry-forward):** apply the `20260627000001` migration to remote via CI→GHCR→Coolify; configure per-company `tax_config` to activate non-flat tax (absent = byte-identical flat-rate retrocompat); live UAT of an estimate with per-item tax + line/global discount + a deposit through the editor → PDF/share/WhatsApp → the Stripe deposit charge + 1% fee. Deferred to v2: tiered pricing + per-line difficulty multipliers (PRICEX-01) and a pricing-specific admin config surface (PRICEX-02).

## v4.10 MCP Channel Parity (Shipped: 2026-06-25)

**Phases completed:** 2 (127, 128) · 2 plans · full unit suite green (336 files / 2354 tests)

**Goal (delivered):** Bring the existing MCP server (built in v4.1) to capability parity with WhatsApp + the v4.9 web chat by binding the SAME channel-neutral `lib/agent-tools/` capabilities as MCP tools — closing the **WhatsApp = chat = MCP** sibling-channels principle and the entire Multi-Channel Core track (SEED-033 → SEED-034 → SEED-030). Cheap precisely because v4.9 already did the channel-neutral extraction: this was a thin tool-binding milestone, not a new subsystem.

**What shipped, phase by phase:**
- **MCP read tools (127)** — a new `lib/mcp/tools/knowledge-query.ts` binding 6 read-only tools over the neutral core: `ask_knowledge` (wraps `lib/agent-tools/ask-knowledge` — the v4.8 industry KB + company overlay, resolving `companies.industries[]` by the trusted companyId) + 5 query tools (`find_client`/`get_latest_estimate`/`get_project_status`/`list_recent_estimates`/`list_services`, each wrapping a neutral `query-company-data` data-read). All carry `readOnlyHint: true` + `destructiveHint: false` for Claude.ai's auto-grouped permission UX; `companyId` is `auth.company_id` (OAuth token → company, trusted), NEVER a tool input field (T-lrf-01). The registry went 6 → 12 tools; `read.ts`/`write.ts`/`server.ts` stayed byte-untouched.
- **Generation reconciliation + parity (128)** — the existing MCP `create_estimate` now delegates to the neutral `lib/agent-tools/createEstimate` (`channel:'mcp'`), deleting its duplicated `inngest.send` dispatch while preserving the `mcp:write` scope gate, project-ownership lookup, the `{job_id, status, message}` envelope, and the `check_job_status` companion. The neutral idempotency id was widened to be channel-namespaced (`estimate-${channel}-${projectId}-${requestId}`) — a principled improvement that kept the existing MCP behavior test byte-unchanged and green. A new static parity test proves all three channels converge on one generation entry (chat/MCP via `createEstimate`, WhatsApp via `generateEstimateForProject`).

**Architecture invariants honored:** the MCP tools BIND the neutral `lib/agent-tools/` (no re-implementation, no re-extraction — v4.9 owned that); `companyId` trusted from the OAuth token; `readOnlyHint` annotations; the existing v4.1 OAuth/transport infra reused; the existing MCP test suite stayed green unchanged (the parity guard). Edit/send MCP tools deferred (matching the web-chat v1 scope).

**Milestone significance:** this CLOSES the **Multi-Channel Core** track. WhatsApp, the web chat, and the MCP server are now provably three thin channel adapters over one shared neutral core (`lib/agent-tools/` + `lib/knowledge/` + `lib/services/generate-estimate`). A new capability added to the core reaches all three channels; a new channel binds the core without re-implementing anything.

**Operational deferrals (carry-forward):** the v4.7–v4.9 migrations still pending remote apply (CI→GHCR→Coolify); configure the OpenRouter/embeddings keys; live MCP UAT (connect a client, call ask_knowledge + a query tool + create_estimate). The only remaining green seed is **SEED-032 (Advanced Pricing Model)** — an independent track.

## v4.9 Internal Web Chat Assistant — the 3rd channel (Shipped: 2026-06-25)

**Phases completed:** 5 (122, 123, 124, 125, 126) · 13 plans · full unit suite green (335 files / 2335 tests)

**Goal (delivered):** A conversational chat inside the Xtimator web app where the business owner generates estimates, queries their data, and asks trade how-to questions (via the v4.8 `lib/knowledge/`) — built on the Vercel AI Chatbot structure over Xtimator's existing infra. The strategic payoff: this milestone FORCED the channel-neutral extraction of `lib/whatsapp/` into shared domain tools, so WhatsApp + web chat now consume the same core (and MCP parity becomes cheap next).

**What shipped, phase by phase:**
- **Channel-neutral domain extraction (122)** — the load-bearing foundation. Extracted `createEstimate` / `queryCompanyData` / `normalizeInput` / `askKnowledge` from `lib/whatsapp/` into a neutral `lib/agent-tools/` module that imports no channel (ENGINE-01 gate). The KEY insight: extract the DATA-READ functions, NOT the LangChain tool wrappers — so the web chat binds the same reads as AI SDK tools without coupling to LangChain; WhatsApp keeps its LangChain binding. Non-destructive: the existing WhatsApp test suite (the parity guard) stayed green unchanged.
- **Chat persistence (123)** — `chat_conversations` + `chat_messages` (mirroring whatsapp_inbox's shape but the credit_ledger/company_members RLS posture — tenant-readable + owner-narrowed; NOT deny-all), `parts jsonb` for the AI SDK UIMessage model, denormalized company_id; `lib/queries/chat.ts` helpers. Idempotent, authored-only.
- **AI SDK chat backend (124)** — added the Vercel AI SDK (`ai@6` + `@openrouter/ai-sdk-provider`); a `/api/chat` route using `streamText` + native tool-calling (Decision #2) exposing the neutral tools; the model resolved via `ai_config` slots over OpenRouter; the `createEstimate` tool dispatches the async Inngest job and returns `{jobId}` WITHOUT awaiting (the LangGraph engine stays intact — Decision #1, a tool boundary not a streaming bridge); credit reuse with NO new debit code (generation debits in the Inngest job; conversation absorbed; no double-debit). companyId is a trusted closure, never a tool input field.
- **Chat UI (125)** — `@ai-sdk/react` v6 `useChat` (own-input + `sendMessage({text})` + `DefaultChatTransport`, full-array send) message-parts rendering + per-tool progress chips; a two-pane conversation sidebar (list/new/switch + history seed); a multimodal composer (text/audio/photo → the neutral `normalizeChatInput` → text, never raw files to the model); an inline estimate card polling the job → "Open in editor" link. shadcn/Tailwind aligned to the existing design system.
- **Access/entitlement gate (126)** — a `chatEnabled` per-tier flag (free=false; trial/pro/business=true); a `403 chat_not_on_plan` security gate in the route (before any model build) + a page-level upgrade prompt (the global UpgradeModal only catches 402); a static test proving the chat is never referenced by any public/non-`(app)` route (owner-only, never customer-facing).

**Architecture invariants honored:** WhatsApp = chat = (future) MCP over the SAME neutral core; `lib/agent-tools/` imports no channel; the LangGraph estimate engine is untouched (invoked as a tool); the AI SDK is the chat/streaming layer only; owner-only + tenant-scoped + never customer-facing; credit reuse (no double-debit); idempotent + authored-only migration. The Vercel template was PORTED (patterns onto Supabase/OpenRouter), not forked.

**Operational deferrals (carry-forward):** apply the `chat_persistence` migration (20260626000001) to remote via CI→GHCR→Coolify; configure the OpenRouter key; live chat UAT (stream + tool-call + estimate card). Deferred to v2: estimate edit/send in-chat, attachments-as-parts, live generation-reasoning streaming. The MCP parity milestone (SEED-030) consumes this neutral extraction next.

## v4.8 Industry Knowledge Base — Channel-Neutral Conversational Assistant (Shipped: 2026-06-24)

**Phases completed:** 5 (117, 118, 119, 120, 121) · 11 plans · full unit suite green (314 files / 2219 tests)

**Goal (delivered):** A conversational assistant that answers the business owner's trade how-to questions from a per-industry knowledge base (super-admin curated, scoped by `companies.industries[]`) plus an optional per-company overlay, served by a channel-neutral `lib/knowledge/` module and consulted via WhatsApp. The foundation of the Multi-Channel Core track (SEED-033). NOT customer-facing — for the business owner only.

**What shipped, phase by phase:**
- **Schema + pgvector + dual RLS (117)** — `create extension vector` + a `knowledge_entries` table (`scope industry|company`, `vector(1536)` embedding, HNSW cosine index, scope-discriminant CHECK). DUAL RLS on one table: industry rows neutral/readable-to-all + service-role-write (mirrors `price_research_cache`); company-overlay rows tenant-scoped via `company_members` (mirrors phase-82/credit_ledger). Idempotent, authored-only. Ships dormant.
- **Channel-neutral `lib/knowledge/` module (118)** — `embed()` via OpenRouter `/embeddings` (`openai/text-embedding-3-small`, 1536) + `retrieve(question,{industries,companyId,k})` over the `match_knowledge_entries` pgvector RPC (merging industry KB + overlay; never-throws, returns `[]` on failure) + `answer()` RAG (never-throws) + a deterministic fixture for CI + KSEC-01 injection-hardening (retrieved passages through `sanitizeField` + a new `<knowledge>` tag enumerated in the prompt-builder Security block, mirroring `<search_result>`). Imports no channel (ENGINE-01).
- **Super-admin industry curation + bulk import (119)** — `/admin/knowledge` CRUD scoped by industry (requireAdmin FIRST, service-role write `scope='industry'`), embed-then-insert (blocks the save on embed failure — no null-embedding dead content), and CSV bulk import via `embedMany()` (batched ≤96, abort-on-fail).
- **Company KB overlay (120)** — a distinct tenant surface `/settings/knowledge` (the two-panel rule) where the owner curates private overlay entries via the RLS-bound AUTHED client (NOT the service client — a security distinction from the industry path), `scope='company'`, optional.
- **WhatsApp KNOWLEDGE intent (121)** — the 5th intent in `classifyAndRoute` with a QUERY-vs-KNOWLEDGE disambiguation rule (QUERY = the company's own records; KNOWLEDGE = trade how-to), the safe CREATE default preserved; `dispatchKnowledge` reads the resolved company's `industries[]` and calls `lib/knowledge/answer`, delivered via the existing chunked owner reply. The first real consumer that proves the neutral module end-to-end.

**Architecture invariants honored:** `lib/knowledge/` is channel-neutral (grep gate); pgvector + embeddings only (NO reranker — deferred, data-driven trigger documented); two-panel rule (industry KB = super-admin; company overlay = tenant settings, RLS-authed not service); no owner-facing KB browser (consult via chat only); injection-hardening of all retrieved content; idempotent + authored-only migrations (deploy CI→GHCR→Coolify).

**Operational deferrals (carry-forward):** apply the 2 new migrations (`knowledge_entries` 20260625000001, `match_knowledge_entries` RPC 20260625000002) to remote via CI→GHCR→Coolify; configure the OpenRouter embeddings key; seed the industry KBs (super-admin + bulk CSV); live WhatsApp UAT of a trade how-to question end-to-end. The web-chat (SEED-034) and MCP (SEED-030) channels consume this neutral core in subsequent milestones.

## v4.7 Monetização — Credit-Based Billing + Estimate Payment Fee (Shipped: 2026-06-24)

**Phases completed:** 7 (110, 111, 112, 113, 114, 115, 116) · 19 plans · full unit suite green (298 files / 2110 tests)

**Goal (delivered):** Transform billing from count-based tiers into a credit model with built-in margin (subscription grants AI credits consumed as real OpenRouter/Whisper cost × markup), and add a 1% platform application fee on estimate payments — every billing parameter configurable from the super-admin panel. Shipped SAFELY with enforcement OFF: credits are RECORDED but never BLOCK, gated on a documented calibration of real production cost before charging is enabled.

**What shipped, phase by phase:**
- **Real cost capture (110)** — OpenRouter `usage.cost` (auto-returned; the deprecated `usage.include` flag avoided) + computed Whisper cost (minutes × rate) recorded to a new append-only `ai_cost_events` table, correlated by `attempt_id`, in MEASURE-ONLY mode. The foundation that gates the ledger. null-vs-0 discipline; never-throw.
- **`billing_config` + super-admin Billing panel (111)** — all billing params (markup, credit denomination, per-tier grant, prices, top-up packs, Whisper rate, fee %, thresholds, `enforcementEnabled`) in the encrypted runtime-config store, edited at `/admin/integrations/billing` without deploy; tenant has no access. Nothing hard-coded.
- **Credit ledger + consumption (112)** — tenant-readable append-only `credit_ledger` + cached `companies.credit_balance`; debit = `round(real_cost × markup / creditUnitUsd)` wired into 4 AI seams (estimate/photo/transcribe/research); idempotent; MCP external conversation = zero credit (by construction). The debit lives in a separate module (the Phase-110 measure-only guard forbids it in `record-ai-cost.ts`).
- **Stripe rail (113)** — `invoice.paid` grants the tier's monthly credits idempotently (reusing `processed_stripe_events`); one-time top-up checkout (`mode:'payment'`, inline `price_data` from `topUpPacks`) credits the ledger; overage affordance (top-up + upgrade) without silent block; credits run in PARALLEL with the count-based tiers (additive, no account breaks).
- **Estimate payment fee + gating + disclosure (114)** — 1% `application_fee_amount` on the Connect invoice Direct Charge (owner stays merchant of record; never custodies funds), computed `max(round(amount×pct), minCents)` clamped strictly below the charge, never $0 when amount>0; a single `paymentsEnabled` guard over all forward payment affordances (historical "Paid" badges remain); config-driven fee disclosure at Connect. (FEE-02 satisfied-by-FEE-01 — the Phase-70 checkout path was superseded by Phase-94 hosted invoices.)
- **Credit balance UX (115)** — owner sees a simple balance + consumption history (owner-safe projection — `real_cost_usd`/`markup` never selected) + static per-action guidance + low/zero top-up/upgrade CTA; additive to the count-based usage card. Copy never says "blocked" (enforcement off).
- **Calibration & charge-on gate (116)** — pure `validateMarginInvariant` (real cost of a full grant ≤ 30% of subscription price per tier; the illustrative defaults FAIL by design — locked by test, defaults untouched), an `ai_cost_events` aggregator, a charge-on gate in `saveBillingConfig` that REJECTS flipping `enforcementEnabled` true while the invariant fails, an ops analysis script, and a CALIBRATION-RUNBOOK. Enforcement stays OFF until real production cost validates the numbers.

**Architecture invariants honored:** Stripe is the payment RAIL only (the credit ledger is OURS, not Stripe metered billing); everything billing reads from `billing_config` at runtime (super-admin only); never-throw on all cost/debit paths; null-vs-0 cost discipline; migrations idempotent + authored-only (deploy via CI→GHCR→Coolify); CALIBRATE before charging.

**Operational deferrals (carry-forward):** apply the 2 new migrations (`ai_cost_events` 20260624000003, `credit_ledger` 20260624000004) to remote via CI→GHCR→Coolify; collect N weeks of `ai_cost_events` in production; run the calibration analysis; set real numbers in `billing_config`; confirm `validateMarginInvariant` passes; then flip `enforcementEnabled` ON. Live UAT of Stripe grant/top-up + the 1% fee against test mode.

## v4.6 Pricing Intelligence — Researched Pricing Agent (Shipped: 2026-06-24)

**Phases completed:** 5 (105, 106, 107, 108, 109) · 12 plans · ~40 commits · full unit+eval suite green (275 files / 1932 tests)

**Goal (delivered):** When an estimate line item has no price-book match, a specialized agent researches the average regional market price (client's city + state) and writes it with `price_source: 'researched'` — instead of the AI guessing a price that can come out $0 and trip the "too vague" gate. Delivers Pillar 2 (researched pricing) on top of Pillar 1 (price-book priority). Fixes the originating "Couch cleaning 8seats → $0 → blocked as vague" bug.

**Key accomplishments:**

- **`researched` provenance threaded end to end (Phase 105)** — new `price_source: 'researched'` value through the DB CHECK constraint, AI output schema/types, persistence, and a third editor badge — shipped dormant (zero behavior change) as the foundation.
- **Tenant-scoped price cache (Phase 106)** — a `price_research_cache` table (deny-all/service-role RLS, 30-day TTL, keyed by company + normalized service name + city|state + currency) + cache module; a neutral market datum that can't leak across tenants; a cache hit costs no research allowance.
- **Swappable research source + determinism seam (Phase 107)** — a `PriceResearchProvider` port resolved from `platform_integrations` (null = safe no-op), a real **OpenRouter web-search** adapter (engine `exa` default / `native` configurable, a SEPARATE call ahead of `create_estimate`), a gated **Anthropic** `user_location` quality-fallback adapter, and a deterministic fixture adapter so the v4.5 eval harness/CI stays green. Web content is prompt-injection-hardened (`sanitizeField` + `<search_result>`). Evidence-gated by contract (a usable price needs a real source_url + snippet).
- **The fix (Phase 108)** — `researchUnmatchedPrices` wired into `generateEstimateForProject` immediately after `anchorAndClampSections` and before totals/persistence, so the persisted estimate carries real regional numbers before the vagueness gate. Precedence `price_book > researched > ai_estimate`; evidence-gated tagging; a never-$0 fallback ladder (researched → non-zero ai_estimate → flagged-unpriced routed to the existing `awaiting_details`); the vagueness gate distinguishes a fully-empty estimate (block) from a partially-priced one with a flagged line (allow); metering reuses the existing quota (new `price_researched` event + per-tier `maxPriceResearchPerMonth` allowance, over-allowance degrades gracefully). The "Couch cleaning 8seats" case is a green eval regression (now $180, non-vague).
- **Durability + cost hardening (Phase 109)** — a per-estimate research item cap (logged, no silent truncation), runtime OpenRouter-web → Anthropic fallback ordering, an in-run memo so the auto-refine loop never re-pays, and the `next build` type fix (widening the render-path `price_source` unions to include `'researched'`). Dedicated `step.run` retry isolation documented-as-deferred (the inline call is already non-fatal).

**Locked decisions:** OpenRouter primary provider (engine exa/native); Brave / dedicated pricing APIs / scraping rejected; region = city + state; no markup in MVP; per-tenant cache; reuse the existing count-based quota (no new billing subsystem); no source-citation/range/confidence UI this milestone.

**Operational deferrals (apply to remote DB via CI→GHCR→Coolify):** migrations `20260623000001` (price_source CHECK widen), `20260624000001` (price_research_cache), `20260624000002` (usage_events event_type widen). Configure a research source in `platform_integrations` to activate (null = dormant no-op). 1 human UAT: a live end-to-end couch-cleaning estimate with a real provider key + client address.

**Full archive:** [.planning/milestones/v4.6-ROADMAP.md](milestones/v4.6-ROADMAP.md) · [v4.6-REQUIREMENTS.md](milestones/v4.6-REQUIREMENTS.md)

---

## v4.5 Estimate Engine Robustness & Reliability Harness (Shipped: 2026-06-21)

**Phases completed:** 5 (99, 100, 101, 102, 103) · 19 plans · 99 commits · 163 files changed · +16,618/−476 LOC · full unit suite deterministic-green (250 files / 1732 tests, verified 3×)

**Key accomplishments:**

- **Unified error model + provider fallback (Phase 99)** — one typed `FailureReason` drives both the HTTP boundary (`XtimatorError`) and per-channel reply copy; one OpenRouter→Gemini fallback wrapper (`getAIProviderWithFallback`) every AI call path uses (generate, transcribe, vision, refine). The refine path, previously with no Gemini fallback, now inherits it.
- **Output guardrails (Phase 100)** — authoritative zod `estimateOutputSchema` (single-sourced via `z.infer`) with a bounded schema-retry at the provider-fallback seam (`invalid_output` on exhaustion); server-side price anchoring + out-of-bounds clamp; totals authority + `totals_discrepancy` signal; one correlation id (attemptId) across pipeline_events ↔ Langfuse ↔ Sentry (closed the pending OBS-03 stub).
- **Refine through the graph + modality unification (Phase 101)** — refine stops being a parallel re-implementation: it runs the shared graph INLINE (synchronous preview, passthrough StepRunner) reusing `ingestMultimodal`, the shared prompt builder (bespoke prompt deleted from all 3 adapters, closing an injection hole), the Phase-99 fallback and Phase-100 guardrails. Web/WhatsApp/MCP/refine share one audio+image+text path.
- **Resilience hardening (Phase 102)** — per-message WhatsApp batch reporting (a bad item is surfaced, not silently dropped); configurable auto-refine cap (`AUTO_REFINE_MAX_ATTEMPTS`, default 1) + a web `NeedsDetailsBanner` recourse for stuck-vague estimates; replay-safe session TTLs derived from a durable `requestedAt` (no `Date.now()` re-mint).
- **Eval harness + CI regression gate (Phase 103)** — 6 golden multimodal fixtures + deterministic mocked providers driving the REAL engine + a quality-metrics suite (reusing `isVagueEstimate` + `estimateOutputSchema`); a secret-free `.github/workflows/test.yml` running a scoped typecheck + the full unit/eval suite twice. Root-caused and fixed a flaky cross-file test-isolation problem (import-latency under vitest worker contention) so the gate is reliable — full suite now deterministic-green.

**Full archive:** [.planning/milestones/v4.5-ROADMAP.md](milestones/v4.5-ROADMAP.md) · [v4.5-REQUIREMENTS.md](milestones/v4.5-REQUIREMENTS.md) · [audit](v4.5-MILESTONE-AUDIT.md)

---

## v4.1 MCP Server (Shipped: 2026-05-26)

**Phases completed:** 5 (86, 87, 88, 89, 90) · 7 new test files (~152 assertions) · 118 MCP-specific tests green · 1 prod migration applied (`oauth_*` tables)

**Key accomplishments:**

- **OAuth 2.0 authorization server in production** — RFC 8414 + 9728 + 7591 compliant. PKCE S256. sha256-hashed token storage. Refresh-token rotation. Consent UI scoped to the active company via Phase 79's resolvers (Phase 86).
- **`/api/mcp` Streamable HTTP endpoint** — Bearer auth gated, CORS for Claude.ai origins, WWW-Authenticate re-discovery. Uses `@modelcontextprotocol/sdk@1.29` with the Web Standard transport (matches Next.js App Router) (Phase 87).
- **6 MCP tools with auto-grouped permission UI** — 4 read-only (`list_estimates`, `get_estimate`, `list_clients`, `list_projects`) + 2 write (`create_estimate` async returning `job_id`, `check_job_status`). Tool annotations (`readOnlyHint` / `destructiveHint` / `idempotentHint`) drive Claude.ai's auto-grouped "Always allow" UX (Phases 88 + 89).
- **Async pattern via existing Inngest** — `create_estimate` sends `EVENT_ESTIMATE_GENERATE`, returns Inngest event id as job_id; `check_job_status` reads runs from the existing job-status path. No parallel job pipeline (Phase 89).
- **Self-service connect UX** — `/settings/integrations/mcp` server-component page with copy-paste `claude mcp add ...` snippet + Claude.ai/Desktop/ChatGPT steps + active-company display so the user sees which tenant the consent binds to (Phase 90).

**Full archive:** [.planning/milestones/v4.1-ROADMAP.md](milestones/v4.1-ROADMAP.md)

---

## v4.0 Multi-Tenancy — Multiple Companies per User (Shipped: 2026-05-26)

**Phases completed:** 6 in scope (79, 81, 82, 83, 84, 85; Phase 80 ran in parallel and is bundled in the archive) · ~16 plan artifacts · 11 new test files · 98/98 tests green at close-out · 4 prod migrations applied

**Key accomplishments:**

- `company_members(user_id, company_id, role)` join table live in prod with idempotent backfill (1 owner per existing company) and `auth.uid()`-gated RLS — multi-tenancy backbone (Phase 79).
- Cookie-based active-company tracking (`active_company_id` httpOnly cookie, 30d rolling) + colocated server helpers `getActiveCompanyId()` / `getActiveCompany()` / `getMembershipCompanies()` (Phases 79 + 81).
- Switcher UI mounted in BOTH sidebar render trees with `useTransition` pending UX. "+ Add new company" routes to `/onboarding?mode=add` which threads `mode: 'add'` end-to-end into `createOrUpdateCompany` (Phase 81).
- 46 tenant-scoped RLS policies across 13 tables rewritten to gate by `company_members` instead of `companies.user_id` (Phase 82) — single idempotent migration with in-migration `RAISE EXCEPTION` assertion.
- 11 server-action files codemodded to derive `company_id` from the active cookie (Phase 83). 3 files allowlisted with documented rationale.
- Billing already per-company at the data layer since prior milestones — Phase 84 closed as investigation-only.
- `companies_*` RLS extended with `OR company_members` clause so multi-company users can SELECT/UPDATE/DELETE rows for every company they belong to (Phase 85). DROP COLUMN `companies.user_id` deferred to v5+.

**Full archive:** [.planning/milestones/v4.0-ROADMAP.md](milestones/v4.0-ROADMAP.md) · [.planning/milestones/v4.0-REQUIREMENTS.md](milestones/v4.0-REQUIREMENTS.md)

---

## v3.0 Monetization (Shipped: 2026-05-14)

**Phases completed:** 16 phases, 25 plans, 39 tasks

**Key accomplishments:**

- AI-detected client suggestions after estimate generation
- One-liner:
- Migration + entitlements module: 6 new companies columns, usage_events table with deny-all RLS, and null-safe tier definitions covering free/trial/pro/business — foundation for all v3.0 quota enforcement
- TypeScript tier types + 14-day trial INSERT logic + getCompanyTier() query — Phase 55 type system alignment complete
- Quota enforcement library (checkQuota + recordUsage) with idempotency deduplication — all 7 behaviors validated by unit tests passing without a live database.
- One-liner:
- stripe@22.1.1 SDK
- getBillingData() query using requireServiceClient for usage_events + /settings/billing server component showing plan card and usage meters
- Interactive billing controls — UpgradeButtons + ManageSubscriptionButton in /settings/billing, TrialBanner strip + UpgradeModal 402 interceptor wired into every authenticated page via app layout

---

## v1.5 Zero-friction Project Onboarding (Shipped: 2026-05-09)

**Phases completed:** 7 phases, 11 plans, 22 tasks

**Key accomplishments:**

- AI-detected client suggestions after estimate generation

---

## v1.3 Smart Pricing (Shipped: 2026-05-08)

**Phases completed:** 5 phases, 13 plans, 30 tasks

**Key accomplishments:**

- Supabase migration DDL for company_price_book with 4-policy RLS and estimate_items.price_source TEXT column, plus Wave 0 integration test stub
- TypeScript types regenerated from live Supabase schema (15 tables, including company_price_book + estimate_items.price_source), build passes, integration tests SC-1/SC-2/SC-3 green
- Commit:
- Commit:
- Commit:
- One-liner:
- One-liner:
- One-liner:
- Commit:
- Commit:
- Commit:
- One-liner:
- One-liner:

---

## v1.2 Brand Identity & Global Reach (Shipped: 2026-05-06)

**Phases completed:** 9 phases, 27 plans, 34 tasks

**Key accomplishments:**

- Translations DB table (BIGSERIAL PK, unique index, RLS) applied to Supabase + 23 failing stub tests across 5 files establishing the RED baseline for all I18N requirements
- One-liner:
- App Router-owned favicon, SVG/PNG app icons, manifest metadata, and auth-safe metadata routes locked by a fast regression suite.
- Human-verified icon smoke pass: browser tab favicon, direct metadata routes, and mobile install surfaces all render the blue X monogram with no duplicates or login redirects
- Password recovery, OAuth startup, and middleware claim checks now fail closed and recover gracefully instead of trapping users in dead redirects or crashing requests.
- Vitest and Playwright auth coverage now exercises the live /login, /signup, /reset-password, and /callback routes, with landing tests stabilized for framer-motion under jsdom.
- 1. [Rule 3 - Blocking] getCachedCompany cannot use cookie-based createClient
- Reduces the new-project wizard to a single client-select step with eager draft creation, adds a full-screen `/projects/[id]/capture` route group escaping the app shell, and scaffolds all 10 Phase 18 test files covering P18-01 through P18-09.
- One-liner:
- One-liner:

---

## v1.1 Dark-first UX & Modern Redesign (Shipped: 2026-04-22)

**Phases completed:** 9 phases, 40 plans, 53 tasks

**Key accomplishments:**

- Next.js 16 with TypeScript strict, Tailwind 4, 29 shadcn/ui (New York style) components, Supabase SSR deps, typed env vars (SEC-03), and vitest + Playwright test infrastructure wired and green
- One-liner:
- 9-table PostgreSQL schema with full RLS, company-scoped storage policies, and anon share-token access applied to live Supabase project
- Supabase auth UI with Google OAuth + email/password using shadcn/ui — login, signup, reset-password pages with callback route, server actions, and Playwright E2E tests
- Supabase migration creating platform_admins, platform_integrations, platform_branding tables + platform-brand storage bucket + last-admin trigger + seeded singleton branding + bootstrap SQL doc + integration tests. Every downstream Phase 8 plan depends on these tables and RLS semantics.
- AES-256-GCM crypto module, server-only platform-config loader with 60s TTL cache + null-safe Branding fallback + env-var deprecation path, hex→HSL color util, and 5-file Wave-0 test scaffold (26 passing assertions) — unblocks Waves 2+ in parallel with schema plan 08-01.
- 1. [Rule 3 — Blocking] Playwright Chromium binary not installed
- Shipped the dark-themed `/admin` shell (layout + left-rail nav + index redirect + shared zod schemas) and the first of three admin pages — `/admin/integrations` — with full save/delete/test server actions, masked key UI, inline test result, and a fix to `lib/platform-config.ts` that closes the BYTEA round-trip gap left by Plan 02. 18/18 unit + integration tests pass.
- `/admin/branding` lets a super-admin edit app_name + logo + primary_color + email_from_name with a live scoped-dark preview, persists via service-role upload to `platform-brand/` + upsert of `platform_branding.id=1`, and invalidates the loader cache so downstream pages pick up changes within one request.
- Platform admin CRUD with last-admin guard, trigger-error translation, TDD unit tests, and human-verified Wave-3 checkpoint across all three admin pages
- 1. [Rule 1 — Bug] Existing `tests/e2e/auth.spec.ts` asserts on legacy "Xtimator" literal
- All 5 provider-key env reads migrated to `getIntegrationKey()` with graceful 503/error responses on null; all 5 remaining "Xtimator" hardcoded strings replaced with `getBranding()` loader calls; two grep-assertion unit tests enforce future compliance; e2e auth assertion made env-driven via `APP_NAME_E2E`. Phase 8 is now feature-complete.
- Task 1 (commit `ed11146`)

---

## v1.0 MVP (Shipped: 2026-04-21)

**Phases completed:** 8 phases, 32 plans, 53 tasks

**Key accomplishments:**

- Next.js 16 with TypeScript strict, Tailwind 4, 29 shadcn/ui (New York style) components, Supabase SSR deps, typed env vars (SEC-03), and vitest + Playwright test infrastructure wired and green
- One-liner:
- 9-table PostgreSQL schema with full RLS, company-scoped storage policies, and anon share-token access applied to live Supabase project
- Supabase auth UI with Google OAuth + email/password using shadcn/ui — login, signup, reset-password pages with callback route, server actions, and Playwright E2E tests
- Supabase migration creating platform_admins, platform_integrations, platform_branding tables + platform-brand storage bucket + last-admin trigger + seeded singleton branding + bootstrap SQL doc + integration tests. Every downstream Phase 8 plan depends on these tables and RLS semantics.
- AES-256-GCM crypto module, server-only platform-config loader with 60s TTL cache + null-safe Branding fallback + env-var deprecation path, hex→HSL color util, and 5-file Wave-0 test scaffold (26 passing assertions) — unblocks Waves 2+ in parallel with schema plan 08-01.
- 1. [Rule 3 — Blocking] Playwright Chromium binary not installed
- Shipped the dark-themed `/admin` shell (layout + left-rail nav + index redirect + shared zod schemas) and the first of three admin pages — `/admin/integrations` — with full save/delete/test server actions, masked key UI, inline test result, and a fix to `lib/platform-config.ts` that closes the BYTEA round-trip gap left by Plan 02. 18/18 unit + integration tests pass.
- `/admin/branding` lets a super-admin edit app_name + logo + primary_color + email_from_name with a live scoped-dark preview, persists via service-role upload to `platform-brand/` + upsert of `platform_branding.id=1`, and invalidates the loader cache so downstream pages pick up changes within one request.
- Platform admin CRUD with last-admin guard, trigger-error translation, TDD unit tests, and human-verified Wave-3 checkpoint across all three admin pages
- 1. [Rule 1 — Bug] Existing `tests/e2e/auth.spec.ts` asserts on legacy "Xtimator" literal
- All 5 provider-key env reads migrated to `getIntegrationKey()` with graceful 503/error responses on null; all 5 remaining "Xtimator" hardcoded strings replaced with `getBranding()` loader calls; two grep-assertion unit tests enforce future compliance; e2e auth assertion made env-driven via `APP_NAME_E2E`. Phase 8 is now feature-complete.

---
