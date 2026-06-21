# Phase 102: Resilience Hardening — Batch Isolation, Configurable Auto-Refine + Recourse, Replay-Safe TTL - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grounded in the live code map). Has a small UI surface (HARD-06 recourse) — reuse existing patterns, no editor redesign.

<domain>
## Phase Boundary

Partial failures degrade gracefully and replays stay correct on the unified engine (post-Phase-101). Three independent resilience fixes: (HARD-05) a failing item in a WhatsApp multimodal batch is reported per-message instead of silently dropped; (HARD-06) the auto-refine cap is configurable and a still-vague estimate gives the user an explicit recourse path; (HARD-07) session/awaiting-state TTLs are derived from durable state so a node retry/replay cannot corrupt them. Scope = HARD-05, HARD-06, HARD-07.

**Requirements:** HARD-05 (per-message WhatsApp batch isolation/reporting), HARD-06 (configurable auto-refine cap + user recourse), HARD-07 (replay-safe TTL).
</domain>

<decisions>
## Implementation Decisions

### HARD-05 — WhatsApp batch isolation + per-message reporting
- **The isolation already exists.** `lib/estimate/adapters/whatsapp.ts` fans out one `Send('processMessage', …)` per message; each `processMessage` branch NEVER throws — it returns `{ mediaResults: [{ msgId, ok, reason }] }` (e.g. `download_failed`, `transcription_failed`, `empty_transcript`). The commutative `mediaResults` reducer gathers them and convergence uses `.some(r => r.ok)`. So one bad message does NOT kill the batch today.
- **The gap is VISIBILITY.** Failed items' `reason` codes are recorded in state but the owner is never told which input failed — partial success is silent. HARD-05 = surface a per-message failure summary in the WhatsApp reply path: when `hasUsableInput` is true but some `mediaResults` are `ok:false`, the confirmation/ask-details reply notes the dropped item(s) (e.g. "Couldn't process 1 voice note, but built your estimate from the rest."). When ALL fail, the existing no-input failure path stands.
- Keep the Send[]/reducer/batch structure intact (it's correct). Add only the per-message reporting + map each `reason` to friendly copy (reuse the Phase-99 `FailureReason`/channel-copy map where it fits; add WhatsApp-specific per-item lines as needed). Never-reply invariant preserved (still exactly one reply per batch).

### HARD-06 — configurable auto-refine cap + user recourse (web UI)
- **Configurable cap:** the cap is hard-coded as `refineAttempts < 1` in the assess→refine edge (`checkVagueAfterAssessEdge`) and the `auto-refine.ts` doc. Replace the literal `1` with a configurable value — a single named constant/config (e.g. `AUTO_REFINE_MAX_ATTEMPTS`, env- or platform-config-overridable, default 1 to preserve today's behavior). The edge reads the configured cap; no behavior change at the default.
- **User recourse (the UI surface — NEW):** today the web default adapter sets `projects.status='awaiting_details'` and the generate job returns `needsDetails: true`, but NOTHING in `components/`/`app/` surfaces it (grep-confirmed: zero UI references). Add a recourse surface: when a project/estimate is in `awaiting_details` / the generate job result carries `needsDetails`, show a clear, dismissible banner/CTA in the existing project/estimate view — "We need a bit more detail to build a solid estimate" + an "Add details & regenerate" action that routes back into the capture/describe flow and re-triggers generation. REUSE existing banner/CTA components and the existing generate trigger — NO editor redesign (per REQUIREMENTS Out-of-Scope). This closes the dead-end where a vague estimate left the user stuck.
- MCP already surfaces `needsDetails` as a structured job-status field (Phase 96 SMART-04) — unchanged. WhatsApp's inline ask-details (SMART-05) unchanged.

### HARD-07 — replay-safe TTL
- `lib/estimate/adapters/whatsapp.ts` finalize mints `expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES*60000)` inside the node (two sites: awaiting_details + awaiting_confirm). The file's own header comment already flags this as a replay hazard once AI nodes get their own `step.run`.
- **Fix:** derive `expiresAt` from a durable timestamp carried in state (threaded from the Inngest event payload / a single graph-entry `now`), not from `Date.now()` re-evaluated inside finalize. Add a neutral state field (e.g. `requestedAt`/`startedAt: number` epoch ms) set ONCE at the engine entry (from the event payload, server-trusted), and compute `expiresAt = new Date(requestedAt + SESSION_TTL_MINUTES*60000)`. On replay the timestamp is stable → the TTL does not drift. Keep `SESSION_TTL_MINUTES` (30) unchanged. Channel-neutral field (graph-neutrality stays green).

### Invariants to preserve (regression-gated)
- WhatsApp never-throw/always-reply: exactly one reply per batch, even with partial/total item failure.
- Auto-refine default behavior unchanged at cap=1 (configurable, default preserves today).
- graph-neutrality (ENGINE-01): new state fields carry no channel tokens.
- Multi-tenant companyId stays closure/param (auto-refine already uses state.companyId — QA-02).
- No LangGraph checkpointer; Inngest stays the durability layer.
- Refine path (Phase 101) and generate/MCP paths do not regress.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/estimate/adapters/whatsapp.ts` — Send fan-out, `processMessage`, `mediaResults` reducer, `hasUsableInput`, the two `Date.now()` TTL mint sites (356, 385), `SESSION_TTL_MINUTES` (61).
- `lib/estimate/graph/nodes/auto-refine.ts` — the cap-1 auto-refine node; `REFINE_HINT`.
- `lib/estimate/graph/nodes/decide.ts` / the assess→refine edge `checkVagueAfterAssessEdge` — where the `refineAttempts < 1` literal lives.
- `lib/estimate/adapters/default.ts` — web finalize sets `projects.status='awaiting_details'` + returns `needsDetails`.
- `lib/estimate/graph/state.ts` — `needsDetails`, `refineAttempts` fields; add `requestedAt` here (neutral).
- `lib/estimate/failure.ts` (Phase 99) — `FailureReason` + channel-copy map for per-item WhatsApp reporting.
- `lib/whatsapp/ask-details.ts` — `buildAskDetailsMessage` reply builder.
- Existing project/estimate view components (`app/` + `components/`) + the generate trigger — the recourse banner/CTA host (researcher to locate the exact component).

### Established Patterns
- Best-effort, never-throw adapter writes (swallow errors).
- Neutral graph state fields threaded from the Inngest event payload (server-trusted).
- Existing banner/CTA UI patterns (reuse — no redesign).

### Integration Points
- WhatsApp reply path (HARD-05 reporting); assess→refine edge + a config constant (HARD-06 cap); web project/estimate view (HARD-06 recourse UI); whatsapp finalize TTL + state entry (HARD-07).
</code_context>

<specifics>
## Specific Ideas

- HARD-05 is mostly REPORTING, not re-architecting — the per-message isolation is already correct; do not rebuild the Send/reducer.
- HARD-06's biggest user value is the WEB recourse surface (the dead-end fix) — keep it small and reuse existing components; the configurable cap is a one-constant change.
- HARD-07: a single `requestedAt` epoch threaded from the event entry fixes both TTL sites; do not change SESSION_TTL_MINUTES.
- This phase has a UI surface (HARD-06 recourse) → a lightweight UI-SPEC is warranted (banner + CTA states), but it must reuse existing design tokens/components.
</specifics>

<deferred>
## Deferred Ideas

- Per-message RETRY (re-running just the failed message's transcription/vision) — out of scope; HARD-05 is isolation + reporting, not retry.
- Full per-node step.run durability decomposition (which is what would make HARD-07 strictly necessary) — deferred per v4.3 guardrails; HARD-07 makes the TTL replay-safe in advance.
- The eval harness exercising these resilience paths (EVAL-01..04) — Phase 103.
- Editor redesign — explicitly out of scope (REQUIREMENTS); recourse reuses existing patterns.
</deferred>
