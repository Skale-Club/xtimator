# Requirements: Xtimator — Milestone v4.10 MCP Channel Parity

**Defined:** 2026-06-25
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Bring the existing MCP server (v4.1) to capability parity with WhatsApp + the v4.9 web chat by binding the SAME channel-neutral `lib/agent-tools/` capabilities as MCP tools — closing the WhatsApp = chat = MCP sibling-channels principle. Source: [SEED-030](seeds/SEED-030-mcp-server-xtimator.md).

> **Locked decisions:**
> - **Three siblings, one core** — WhatsApp (LangChain tools), web chat (AI SDK tools), MCP (MCP tools) all bind the SAME neutral `lib/agent-tools/` functions. This milestone is the MCP binding layer; v4.9 already did the extraction.
> - **The MCP server already exists** (OAuth 2.0 + `/api/mcp` Streamable HTTP + 5 tools, v4.1 phases 86-90) — REUSE the auth/transport infra; do NOT rebuild it.
> - **`companyId` is trusted** — resolved from the OAuth token → company, NEVER a tool input field (T-lrf-01, same invariant as the chat).
> - **Read tools carry `readOnlyHint: true`** so Claude.ai's permission UI auto-groups them (the SEED-030 locked decision).
> - **Scope fence:** the MCP tool layer ONLY. Do NOT re-extract anything (v4.9 did it); do NOT touch the web chat or WhatsApp beyond what parity requires. Defer edit/send MCP tools (match the web-chat v1 scope: generate + query + knowledge).

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### MCP Knowledge Tool

- [ ] **MKB-01**: An `ask_knowledge` MCP tool wraps the neutral `lib/agent-tools/ask-knowledge` (the v4.8 industry KB + company overlay, scoped by the resolved company's `industries[]`); read-only.

### MCP Query Tools

- [ ] **MQRY-01**: The company-data reads are exposed as read-only MCP tools (`find_client`, `get_latest_estimate`, `get_project_status`, `list_recent_estimates`, `list_services`) wrapping the neutral `lib/agent-tools/query-company-data` data-reads — one explicit tool per read.

### MCP Generation Reconciliation

- [ ] **MGEN-01**: The existing MCP `create_estimate` routes through the neutral `lib/agent-tools/createEstimate` (the async `{jobId}` contract it was the precedent for), so all three channels share one generation entry point — behavior preserved.

### MCP Security & Annotations

- [ ] **MSEC-01**: For every new MCP tool, `companyId` is resolved from the OAuth token → company (trusted), NEVER from a tool input field; a test asserts no new tool's input schema accepts a tenant/companyId.
- [ ] **MSEC-02**: The new read tools (`ask_knowledge` + the query tools) carry `readOnlyHint: true` annotations so Claude.ai's permission UI auto-groups them; a test asserts the annotations.

### Parity Verification

- [ ] **MPAR-01**: The MCP tools BIND the neutral `lib/agent-tools/` capabilities (not a re-implementation), and the existing v4.1 MCP test suite stays green unchanged (non-destructive) — confirming WhatsApp = chat = MCP over one core.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Richer MCP

- **MMCP-01**: Edit/send estimate MCP tools (extract the WhatsApp edit/confirm/send capability to neutral first — parallels the web-chat v2 deferral).
- **MMCP-02**: MCP resources (read-only `xtimator://estimate/{id}` etc.) per the original SEED-030 wishlist.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Re-extracting capabilities | v4.9 already extracted them to `lib/agent-tools/`; this milestone only binds |
| Rebuilding OAuth / transport | The v4.1 MCP server already provides them |
| Edit/send MCP tools (v1) | Deferred to match the web-chat v1 scope (generate + query + knowledge) |
| Touching the web chat / WhatsApp | Beyond parity; their bindings already exist |
| Customer-facing MCP | The MCP is owner-scoped via the OAuth token — never an end customer |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MKB-01 | TBD | Pending |
| MQRY-01 | TBD | Pending |
| MGEN-01 | TBD | Pending |
| MSEC-01 | TBD | Pending |
| MSEC-02 | TBD | Pending |
| MPAR-01 | TBD | Pending |

**Coverage:**
- v1 requirements: 6 total
- Mapped to phases: 0 (roadmap pending)
- Unmapped: 6 ⚠️ (resolved by roadmap)

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 — milestone v4.10 MCP Channel Parity initial definition*
