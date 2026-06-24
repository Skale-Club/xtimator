# Requirements: Xtimator — Milestone v4.8 Industry Knowledge Base

**Defined:** 2026-06-24
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** A conversational assistant that answers the owner's trade how-to questions from a per-industry knowledge base (super-admin curated, scoped by `companies.industries[]`) plus an optional per-company overlay, served by a channel-neutral `lib/knowledge/` module and consulted via WhatsApp. The foundation of the Multi-Channel Core track. Source: [SEED-033](seeds/SEED-033-industry-knowledge-base-conversational-assistant.md).

> **Locked decisions (from SEED-033):**
> - **Two panels, two scopes:** Industry KB = super-admin (platform asset, neutral/shared, service-role RLS like `price_research_cache`); Company KB overlay = the tenant's OWN settings panel (optional, tenant-scoped RLS). The owner never curates the industry KB.
> - **No owner-facing KB browser** — the KB is a conversational retrieval surface only (consulted via chat), never a navigable document for the owner.
> - **Channel-neutral module** — `lib/knowledge/` imports no channel; WhatsApp (this milestone) + web chat (SEED-034) + MCP (SEED-030) are consumers. This milestone wires only WhatsApp.
> - **Retrieval = pgvector + embeddings ONLY in v1.** The Cohere reranker is a deferred, data-driven phase-2 optimization (trigger: retrieval misses in eval/prod, or a large/heterogeneous overlay corpus). Do NOT add it on day 1.
> - **Injection-hardening** — retrieved content is sanitized through the existing `sanitizeField` + a new `<knowledge>` tag before any prompt (curated ≠ trusted as LLM context).
> - **Scope fences:** web-chat consumption (SEED-034) and the MCP `ask_knowledge` tool (SEED-030) are OUT — separate milestones; this milestone makes the module MCP-ready but wires only WhatsApp.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Knowledge Base Schema & Storage

- [x] **KB-01**: pgvector is enabled and a `knowledge_entries` table exists (scope 'industry'|'company', industry_id nullable, company_id nullable, title, body, source, embedding vector, created_at, updated_at) with a vector similarity index. Idempotent migration, authored-only (deploy via CI→GHCR→Coolify).
- [x] **KB-02**: Industry KB entries are neutral/shared — RLS service-role-write, read scoped by industry (mirroring the `price_research_cache` posture); no tenant can write them.
- [x] **KB-03**: Company KB overlay entries are tenant-scoped — RLS gates read/write to the owning company (`company_members` membership, like the multi-tenant tables).

### Knowledge Domain Module (channel-neutral)

- [x] **KMOD-01**: An `embed(text)` function generates embeddings via the configured provider (model-agnostic via the existing platform-config pattern), reusing `getIntegrationKey`.
- [x] **KMOD-02**: `retrieve(question, { industries, companyId, k })` returns ranked passages by pgvector similarity, MERGING the company's industry KB(s) + its own company overlay; channel-neutral (imports no channel) and never-throws.
- [x] **KMOD-03**: `answer(question, ctx)` composes a RAG prompt from retrieved passages and returns a short conversational answer; the prompt is injection-hardened (see KSEC-01).
- [x] **KMOD-04**: A deterministic fixture adapter lets the CI/eval harness exercise retrieve/answer with zero live network (mirroring the price-research fixture provider).

### Super-Admin Industry KB Curation

- [x] **KCUR-01**: A super-admin can create/edit/delete industry KB entries scoped to an industry, in the super-admin panel.
- [x] **KCUR-02**: Saving or editing an entry (re)generates its embedding.
- [x] **KCUR-03**: A super-admin can bulk-import entries (markdown or CSV) to seed an industry's KB in one operation.

### Company KB Overlay (optional, tenant)

- [ ] **KOVL-01**: A company owner can add/edit/delete private KB entries in the company's OWN settings panel (distinct from the super-admin panel); the overlay is optional — a company with no overlay uses only the industry KB.
- [ ] **KOVL-02**: Company overlay entries generate embeddings the same way, scoped to the owning company.

### WhatsApp KNOWLEDGE Intent

- [ ] **WAKB-01**: The WhatsApp `classifyAndRoute` gains a 5th intent KNOWLEDGE with a QUERY-vs-KNOWLEDGE disambiguation rule (QUERY = the company's own records; KNOWLEDGE = trade how-to); the safe CREATE default is preserved for unrecognized input.
- [ ] **WAKB-02**: A KNOWLEDGE message dispatches to `lib/knowledge/answer` scoped by the resolved company's `industries[]` + its overlay, and the answer is delivered via the existing chunked owner reply path.

### Injection Hardening

- [x] **KSEC-01**: Retrieved KB content is sanitized through the existing `sanitizeField` and wrapped in a new `<knowledge>` tag, enumerated in the prompt-builder Security block, before entering any prompt; a static test asserts knowledge prompts are built through this hardened boundary (not ad-hoc concatenation).

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Retrieval Quality

- **KRR-01**: Cohere (or alternative) reranker as a pluggable layer between `retrieve` and `answer` — triggered by measured retrieval misses or a large/heterogeneous overlay corpus.
- **KRR-02**: Chunk-by-paragraph granularity (v1 uses whole-entry).

### Other Channels

- **KCH-01**: Web-chat consumption of `lib/knowledge/` (SEED-034's milestone).
- **KCH-02**: MCP `ask_knowledge` tool (SEED-030's milestone).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Owner-facing KB browser/document viewer | The KB is a conversational retrieval surface only (locked decision) |
| Cohere reranker on day 1 | pgvector-only in v1; reranker is a deferred data-driven optimization |
| Web chat + MCP tool wiring | Separate milestones (SEED-034 / SEED-030) consuming this neutral module |
| Customer-facing knowledge | Xtimator never talks to the end customer; the KB is for the business owner |
| Multilingual KB content | Curate in English; the app already translates answers to the owner's language |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KB-01 | Phase 117 | Complete |
| KB-02 | Phase 117 | Complete |
| KB-03 | Phase 117 | Complete |
| KMOD-01 | Phase 118 | Complete |
| KMOD-02 | Phase 118 | Complete |
| KMOD-03 | Phase 118 | Complete |
| KMOD-04 | Phase 118 | Complete |
| KCUR-01 | Phase 119 | Complete |
| KCUR-02 | Phase 119 | Complete |
| KCUR-03 | Phase 119 | Complete |
| KOVL-01 | Phase 120 | Pending |
| KOVL-02 | Phase 120 | Pending |
| WAKB-01 | Phase 121 | Pending |
| WAKB-02 | Phase 121 | Pending |
| KSEC-01 | Phase 118 | Complete |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15 ✓ (Phases 117-121)
- Unmapped: 0

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 — v4.8 roadmap created: all 15 requirements mapped to Phases 117-121 (117 schema+RLS, 118 neutral module+hardening, 119 super-admin curation, 120 company overlay, 121 WhatsApp intent); coverage 15/15, zero orphans.*
