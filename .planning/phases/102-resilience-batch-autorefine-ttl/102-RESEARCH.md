# Phase 102: Resilience Hardening — Batch Isolation, Configurable Auto-Refine + Recourse, Replay-Safe TTL - Research

**Researched:** 2026-06-21
**Domain:** LangGraph estimate engine (channel-neutral core + WhatsApp/web adapters), Inngest durability, Next.js App Router workspace UI
**Confidence:** HIGH (this is a brownfield, code-grounded phase — every claim below is anchored to an exact file/line read directly from the repo)

## Summary

This is a brownfield resilience phase with three independent fixes on the already-extracted estimate graph (`lib/estimate/graph/`). CONTEXT.md has settled all design decisions; research here only confirms exact code sites and recommends the lowest-risk mechanism for each. All three fixes are small and surgical — the architecture is sound; what is missing is (a) **visibility** of per-item WhatsApp batch failures, (b) a **configurable** cap constant + a **web recourse UI** that does not exist yet, and (c) a **replay-safe timestamp source** for the two TTL mint sites.

The single biggest unknown — *where the web `needs_details` recourse banner should live* — is now resolved: `project.status` is already a server prop on `ProjectDetail`, already read in `ProjectHeader`, so the web adapter's existing `projects.status='awaiting_details'` write (`lib/estimate/adapters/default.ts:58`) is detectable with **zero new query and zero job-status-hook change**. The banner belongs at the top of `OverviewTab` (the no-estimate state's host), reusing the `Alert` component and re-triggering generation through the existing `EstimateTab.handleGenerate` / `useAIInputSubmit.runGenerate` path.

**Primary recommendation:** (1) Add `AUTO_REFINE_MAX_ATTEMPTS` as a single module constant in `lib/estimate/graph/nodes/decide.ts`, default `1`, read by `checkVagueAfterAssessEdge`. (2) Add a neutral `requestedAt: number` epoch field to `EstimateState`, set once from the Inngest event payload entry, and compute both WhatsApp `expiresAt` sites from it. (3) Surface the recourse banner in `OverviewTab` keyed off `project.status === 'awaiting_details'`, reusing `Alert` + the existing generate trigger. (4) Compose a per-item failure note into the WhatsApp confirmation/ask-details reply from the existing `mediaResults` array, mapping `reason` codes to friendly copy.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARD-05 | A failing item in a WhatsApp multimodal batch is isolated — good messages still produce an estimate, and the failed item is reported per-message rather than failing the whole batch | Isolation already correct (`whatsapp.ts` Send fan-out + `mediaResults` reducer + `hasUsableInput` at line 332). Gap is reporting. Compose site = the two reply builders in `finalize` (sendConfirmation ~415, askDetails ~371). `mediaResults` reason codes already exist: `download_failed`, `transcription_failed`, `empty_transcript`, `no_message`, `unknown_error`. |
| HARD-06 | The auto-refine cap is configurable (not hard-coded) and, when still vague after the cap, the user has an explicit recourse path | Cap literal is at `lib/estimate/graph/nodes/decide.ts:38` (`(state.refineAttempts ?? 0) < 1`). Recourse UI: web adapter already writes `projects.status='awaiting_details'` (`default.ts:58`) + returns `needsDetails:true` (`default.ts:63`); `project.status` is a server prop on `ProjectDetail`. No UI surfaces it today (grep-confirmed). |
| HARD-07 | Session/awaiting-state TTLs are derived from durable state (replay-safe), not minted from `Date.now()` inside a node | Two mint sites: `whatsapp.ts:356-358` (awaiting_details) and `whatsapp.ts:385-387` (awaiting_confirm), both `new Date(Date.now() + SESSION_TTL_MINUTES*60*1000)`. `SESSION_TTL_MINUTES = 30` at line 61. Entry point for a durable timestamp: the Inngest event payload in `lib/inngest/functions/generate-estimate.ts` / `whatsapp-process.ts`. |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**HARD-05 — WhatsApp batch isolation + per-message reporting**
- The isolation already exists. `whatsapp.ts` fans out one `Send('processMessage', …)` per message; each branch NEVER throws — returns `{ mediaResults: [{ msgId, ok, reason }] }`. The commutative reducer gathers them; convergence uses `.some(r => r.ok)`. One bad message does NOT kill the batch today.
- The gap is VISIBILITY. Failed items' `reason` codes are recorded but the owner is never told which input failed. HARD-05 = surface a per-message failure summary in the WhatsApp reply: when `hasUsableInput` is true but some `mediaResults` are `ok:false`, the confirmation/ask-details reply notes the dropped item(s) (e.g. "Couldn't process 1 voice note, but built your estimate from the rest."). When ALL fail, the existing no-input failure path stands.
- Keep the Send[]/reducer/batch structure intact (it's correct). Add only per-message reporting + map each `reason` to friendly copy (reuse the Phase-99 `FailureReason`/channel-copy map where it fits; add WhatsApp-specific per-item lines as needed). Never-reply invariant preserved (exactly one reply per batch).

**HARD-06 — configurable auto-refine cap + user recourse (web UI)**
- Configurable cap: the cap is hard-coded as `refineAttempts < 1` in `checkVagueAfterAssessEdge` + the `auto-refine.ts` doc. Replace the literal `1` with a configurable value — a single named constant/config (e.g. `AUTO_REFINE_MAX_ATTEMPTS`, env- or platform-config-overridable, default 1 to preserve today's behavior). The edge reads the configured cap; no behavior change at the default.
- User recourse (the UI surface — NEW): today the web default adapter sets `projects.status='awaiting_details'` and the generate job returns `needsDetails: true`, but NOTHING in `components/`/`app/` surfaces it (grep-confirmed). Add a recourse surface: when a project/estimate is `awaiting_details` / the job result carries `needsDetails`, show a clear, dismissible banner/CTA in the existing project/estimate view — "We need a bit more detail to build a solid estimate" + an "Add details & regenerate" action routing back into the capture/describe flow and re-triggering generation. REUSE existing banner/CTA components + the existing generate trigger — NO editor redesign. Closes the dead-end where a vague estimate left the user stuck.
- MCP already surfaces `needsDetails` as a structured job-status field (Phase 96 SMART-04) — unchanged. WhatsApp's inline ask-details (SMART-05) unchanged.

**HARD-07 — replay-safe TTL**
- `whatsapp.ts` finalize mints `expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES*60000)` inside the node (two sites: awaiting_details + awaiting_confirm). The file header already flags this as a replay hazard.
- Fix: derive `expiresAt` from a durable timestamp carried in state (threaded from the Inngest event payload / a single graph-entry `now`), not from `Date.now()` re-evaluated inside finalize. Add a neutral state field (e.g. `requestedAt`/`startedAt: number` epoch ms) set ONCE at engine entry (from the event payload, server-trusted), compute `expiresAt = new Date(requestedAt + SESSION_TTL_MINUTES*60000)`. On replay the timestamp is stable → TTL does not drift. Keep `SESSION_TTL_MINUTES` (30) unchanged. Channel-neutral field (graph-neutrality stays green).

**Invariants to preserve (regression-gated)**
- WhatsApp never-throw/always-reply: exactly one reply per batch, even with partial/total item failure.
- Auto-refine default behavior unchanged at cap=1 (configurable, default preserves today).
- graph-neutrality (ENGINE-01): new state fields carry no channel tokens.
- Multi-tenant companyId stays closure/param (auto-refine already uses state.companyId — QA-02).
- No LangGraph checkpointer; Inngest stays the durability layer.
- Refine path (Phase 101) and generate/MCP paths do not regress.

### Claude's Discretion
- The exact configurable-cap mechanism (module constant vs env vs platform-config) — recommend one that defaults to 1. (Research recommends a module constant with optional env override; see Architecture Patterns.)
- The exact per-item reason→copy wording and pluralization for HARD-05.
- The exact banner copy, placement detail, and dismissal behavior for the recourse surface (within "reuse existing components, no redesign").
- The exact neutral state-field name (`requestedAt` vs `startedAt`).

### Deferred Ideas (OUT OF SCOPE)
- Per-message RETRY (re-running just the failed message's transcription/vision) — HARD-05 is isolation + reporting, not retry.
- Full per-node `step.run` durability decomposition (HARD-08) — deferred; HARD-07 makes the TTL replay-safe in advance.
- The eval harness exercising these resilience paths (EVAL-01..04) — Phase 103.
- Editor redesign — explicitly out of scope; recourse reuses existing patterns.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Next.js 14+ App Router, TypeScript strict, Tailwind, shadcn/ui. (The recourse UI must use shadcn primitives — `Alert` is available at `components/ui/alert.tsx`.)
- **No secrets in any file** including `.planning/` — placeholders only. (This phase touches no secrets; an env-var cap override, if used, is a non-secret tuning knob named in docs only as `AUTO_REFINE_MAX_ATTEMPTS` with no value committed.)
- **All AI calls server-side via API routes** — unchanged; this phase adds no new AI calls.
- **GSD workflow enforcement** — file edits must flow through a GSD command. (Informational; the planner produces plans, the executor edits.)
- **Service role key never in the browser** — the recourse UI reads `project.status` from an already-RLS-validated server prop, never the service client.

## Standard Stack

No new dependencies. Everything needed is already in the repo.

### Core (already present)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langchain/langgraph` | 1.3.6 | The estimate StateGraph + `Annotation.Root` state + `Send` fan-out | Already the engine; the new `requestedAt` field is one more `Annotation<number>()` |
| `inngest` | (repo-pinned) | Durability layer + idempotency; carries the event payload that is the trusted `requestedAt` source | Sole durability layer per `CHECKPOINTING.md`; no LangGraph checkpointer allowed |
| `vitest` | 4.1.4 | Unit test runner (`npm test` → `vitest run`) | The only test framework in the repo |
| shadcn/ui `Alert` | (in-repo) | The recourse banner primitive | `components/ui/alert.tsx` — `Alert` / `AlertTitle` / `AlertDescription`, has a `destructive` variant + a neutral `default` variant |

### Supporting (already present)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `lib/estimate/failure.ts` | `FailureReason` union + `failureReasonToChannelCopy` reason→copy map | HARD-05: the existing reason→copy pattern is the template; note the `mediaResults` reason strings are a DIFFERENT vocabulary (see Pitfall) |
| `lib/whatsapp/ask-details.ts` | `buildAskDetailsMessage(language)` | HARD-05: the ask-details reply is one of the two compose sites for the per-item note |
| `hooks/use-job-status.ts` | `pollJob` / `useJobStatus`; the completed job `output` carries `needsDetails` | Available fallback detection path, but NOT needed — `project.status` server prop is cleaner (see UI integration) |

**Installation:** none.

**Version verification:** No package changes, so no `npm view` needed. `@langchain/langgraph@1.3.6` and `vitest@4.1.4` are pinned in `package.json` and already installed.

## Architecture Patterns

### HARD-06 cap — recommended configurable mechanism (default 1)

**Exact cap site:** `lib/estimate/graph/nodes/decide.ts:38`

```typescript
// CURRENT (decide.ts):
export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < 1) return 'autoRefine'   // ← literal 1
  return 'finalize'
}
```

**Recommendation: a single module constant in `decide.ts`, optional env override, default 1.**

```typescript
// Source: pattern mirrors SESSION_TTL_MINUTES (whatsapp.ts:61) — a named tuning constant.
// Read once at module load; Number() guards a malformed env value back to the default.
const AUTO_REFINE_MAX_ATTEMPTS = (() => {
  const raw = Number(process.env.AUTO_REFINE_MAX_ATTEMPTS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 1   // default 1 = today's behavior
})()

export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS) return 'autoRefine'
  return 'finalize'
}
```

**Why a module constant over platform-config:** the cap is read on a hot graph edge, must default to exactly `1` (no behavior change), and has no per-company tenancy requirement in scope. A module constant keeps the edge synchronous and channel-neutral (no DB read, no async). An env override (`AUTO_REFINE_MAX_ATTEMPTS`) gives ops a tuning knob without code change and is non-secret. This is strictly additive and the default preserves the regression-gated cap=1 behavior. Also update the `auto-refine.ts` doc comment (lines 12, 14) that says "hard cap=1" / "refineAttempts < 1" to reference the constant.

> NOTE: `process.env` is acceptable here per CLAUDE.md (the value is a non-secret integer). Do NOT commit any value — only the variable name appears in docs.

### HARD-07 — replay-safe `requestedAt` threading

**The neutral state field** — add to `EstimateState` (`lib/estimate/graph/state.ts`), channel-neutral, no WhatsApp token (graph-neutrality stays green):

```typescript
/**
 * Server-trusted graph-entry timestamp (epoch ms), set ONCE from the Inngest
 * event payload. Replay-safe source for any TTL/expiry computed in finalize —
 * never re-mint Date.now() inside a node (HARD-07). Channel-neutral.
 */
requestedAt: Annotation<number | undefined>(),
```

**The source (server-trusted, single entry):** the Inngest functions already compute a graph-entry `Date.now()`:
- `lib/inngest/functions/generate-estimate.ts:88` — `const t0 = Date.now()`. Thread `t0` (or a fresh `requestedAt = Date.now()`) into the `graph.invoke({...})` initial state at line 121-131.
- `lib/inngest/functions/whatsapp-process.ts` — the WhatsApp Inngest handler that composes the WhatsApp graph; thread an equivalent `requestedAt` into its initial state. (Confirm the exact invoke site during planning — it mirrors the generate function's `graph.invoke`.)

Because the whole graph runs inside ONE `step.run` today (DURABLE-02), a value captured at handler entry is stable across an Inngest retry of that step — which is exactly the replay-safety guarantee HARD-07 wants in advance of HARD-08 decomposition.

**Both WhatsApp mint sites** then derive from state instead of `Date.now()`:

```typescript
// whatsapp.ts:356-358 (askDetails) AND whatsapp.ts:385-387 (sendConfirmation):
// BEFORE: const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
// AFTER:
const base = state.requestedAt ?? Date.now()   // fallback keeps a direct-invoker valid
const expiresAt = new Date(base + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
```

`SESSION_TTL_MINUTES` (30) is unchanged. The `?? Date.now()` fallback means any caller that does not thread `requestedAt` (e.g. a unit test invoking the adapter directly) still works — but the Inngest path always supplies it, so replays are stable.

### HARD-05 — per-item reporting compose site + reason→copy

**Compose site:** inside `whatsapp.ts` `finalize` — the partial-failure note is prepended/appended to BOTH reply bodies:
- askDetails reply at ~line 371 (`buildAskDetailsMessage` result)
- sendConfirmation reply at ~line 415 (the `Estimate ready - ...` block)

`hasUsableInput` (line 332) lives in `ingest`, which only returns `{}` or `{ failure }` and does NOT thread `mediaResults` into the core state. **Key wiring decision for the planner:** the `mediaResults` array currently lives only in the WhatsApp-superset ingest sub-graph (`WhatsAppEstimateState`, lines 73-83) and is dropped after `ingest` returns. To report failures in `finalize`, the failed-item summary must be carried forward. Cleanest options (planner picks one):
1. **Carry a neutral summary on core state** — e.g. add `droppedInputs?: number` (or a small `{ count, reasons }` summary) to `EstimateState` and have `ingest` return it. Channel-neutral (a count + generic reason codes carry no WhatsApp token → graph-neutrality safe). `finalize` reads it.
2. **Capture in the closure** — record the failed `mediaResults` in a closure-local variable inside `makeWhatsAppAdapter` during `ingest`, read it in `finalize`. Avoids touching core state but is less testable and couples ingest→finalize via mutable closure state.

Option 1 is recommended (testable, explicit, neutral). Keep the summary generic (count + reason enum) so no WhatsApp string leaks into core state.

**Reason→copy map (WhatsApp-specific, NEW):** the `mediaResults` reason vocabulary is `download_failed | transcription_failed | empty_transcript | no_message | unknown_error` — this is a DIFFERENT union from `FailureReason` in `lib/estimate/failure.ts`. Do NOT overload `failureReasonToChannelCopy` (its strings are regression-frozen, lines 79-99). Add a small dedicated map, e.g.:

```typescript
// New WhatsApp per-item copy — keep separate from the frozen failureReasonToChannelCopy.
const MEDIA_ITEM_NOTE: Record<string, string> = {
  download_failed:      "couldn't download",
  transcription_failed: "couldn't transcribe a voice note",
  empty_transcript:     "couldn't make out a voice note",
  // ...
}
// Composed line, e.g.: "Note: I couldn't process 1 of your messages, but built the estimate from the rest."
```

Aggregate to ONE line (count of dropped items) rather than one line per item, to keep the reply tight and the never-reply invariant trivially intact (still exactly one `sendWhatsAppMessage` call).

### HARD-06 web recourse UI — CONCRETE integration point (the UI-SPEC input)

**This was the key unknown. Resolved:**

**Detection — server prop, no hook change needed.** `project.status` is a field on `ProjectDetail` (`lib/queries/project.ts:8,98` select `id, name, status, ...`) and is already consumed client-side in `components/workspace/project-header.tsx:29` (`STATUS_LABEL[project.status]`). The web adapter already writes `projects.status='awaiting_details'` (`lib/estimate/adapters/default.ts:55-59`). So **the recourse condition is simply `project.status === 'awaiting_details'`** — available synchronously from the server-rendered prop, no `useJobStatus` polling, no extra query, no new server prop plumbing. (The `useJobStatus` `output.needsDetails` path exists as an alternative for surfacing it *immediately* after an in-page generate without a refresh — but `useAIInputSubmit` / `EstimateTab.handleGenerate` both call `router.refresh()` on completion, so the server-prop status will be fresh on the next render. Use the server prop as the source of truth; an optional in-flight toast can read `output.needsDetails` if desired but is not required.)

**Host component — `components/workspace/overview-tab.tsx`.** `OverviewTab` already receives the full `project` object (so `project.status` is in scope) and is the host of the no-estimate / empty state. When the estimate is reverted to vague, `currentEstimate` is `null` and the project sits in `awaiting_details` — exactly the OverviewTab render path. Render the banner at the top of OverviewTab's returned `<div className="space-y-6">`, above `<EstimateTab>`:

```tsx
// components/workspace/overview-tab.tsx — add at top of the returned tree.
{project.status === 'awaiting_details' && (
  <NeedsDetailsBanner
    projectId={project.id}
    onAddDetails={() => setModePickerOpen(true)}   // reuse the EXISTING capture-mode picker
  />
)}
```

**Banner — reuse `components/ui/alert.tsx`.** A new small client component `components/workspace/needs-details-banner.tsx` wrapping `Alert` + `AlertTitle` + `AlertDescription` + a `Button`. No new design system, no editor redesign. Copy along the lines of "We need a bit more detail to build a solid estimate" + an "Add details & regenerate" button.

**The "Add details & regenerate" CTA — reuse the EXISTING generate trigger.** OverviewTab already owns `handleRecord` → `setModePickerOpen(true)` → `CaptureModePicker` → `handleModeSelect` → `router.push(captureHref(...))`, which routes into the capture/describe flow. That flow ends by re-calling `/api/generate-estimate` (via `useAIInputSubmit.runGenerate` or `EstimateTab.handleGenerate`). So the CTA's onClick is simply `setModePickerOpen(true)` — it reuses the exact path the empty-state already uses. Alternatively, the header `AIInputGroup` (mic/text dialogs → `useAIInputSubmit`) is the same re-generation entry. **No new generate plumbing is built** — the CTA is a second entry point into the existing trigger.

**Why not the estimate editor view:** when `awaiting_details`, the estimate was reverted (`revertVagueEstimate` in `default.ts:50`) so `currentEstimate` is null → `EstimateTab` renders its empty Card state, not the editor. The banner sits above that empty state in OverviewTab. No editor changes.

### Recommended file touch-set (for the planner)
```
lib/estimate/graph/state.ts              # + requestedAt; + optional droppedInputs summary (both neutral)
lib/estimate/graph/nodes/decide.ts       # AUTO_REFINE_MAX_ATTEMPTS constant; edge reads it
lib/estimate/graph/nodes/auto-refine.ts  # doc comment update only (cap is now configurable)
lib/estimate/adapters/whatsapp.ts        # 2 TTL sites derive from state.requestedAt; per-item note in finalize
lib/inngest/functions/generate-estimate.ts   # thread requestedAt into graph.invoke initial state
lib/inngest/functions/whatsapp-process.ts    # thread requestedAt into the WhatsApp graph invoke
components/workspace/overview-tab.tsx    # render NeedsDetailsBanner when project.status==='awaiting_details'
components/workspace/needs-details-banner.tsx  # NEW — wraps Alert + Button (reuse, no redesign)
```

### Anti-Patterns to Avoid
- **Re-architecting the Send fan-out / `mediaResults` reducer** — it is correct (CONTEXT + RESEARCH agree). HARD-05 adds reporting only.
- **Overloading `failureReasonToChannelCopy`** — its strings are regression-frozen; the `mediaResults` reason vocabulary is separate.
- **Reading `project.status` via the service client in the UI** — it is already an RLS-validated server prop. Use it.
- **Adding a LangGraph checkpointer** — forbidden (`CHECKPOINTING.md`); Inngest stays the durability layer.
- **Leaking a WhatsApp token into core state** for the dropped-input summary — keep it a count + neutral reason enum so graph-neutrality stays green.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-message batch isolation | A new try/catch or retry loop around messages | The existing `Send` fan-out + commutative `mediaResults` reducer (`whatsapp.ts:73-83, 127-282`) | Already correct, parallel, never-throw; rebuilding risks regressing QA-01 |
| Replay-safe timestamp | A LangGraph checkpointer or a DB-persisted clock | A `requestedAt` epoch threaded from the Inngest event entry | Inngest step.run already gives single-evaluation durability |
| Recourse banner styling | A bespoke banner component | `components/ui/alert.tsx` (`Alert`/`AlertTitle`/`AlertDescription`) | shadcn primitive already in the design system |
| "Regenerate" action | A new generate API call / new dispatch flow | `CaptureModePicker` → existing capture flow, or `AIInputGroup` → `useAIInputSubmit.runGenerate` (both POST `/api/generate-estimate`) | The generate trigger already exists and handles quota/idempotency/poll |
| Status detection | A new server query or job-status field plumbing | `project.status` server prop already on `ProjectDetail` and already in OverviewTab scope | Zero new wiring |

**Key insight:** every piece this phase needs already exists in the codebase. The work is *connecting* existing pieces (thread a timestamp, read a status prop, compose a note from an existing array, swap a literal for a constant), not building new machinery.

## Common Pitfalls

### Pitfall 1: Default cap must not change behavior
**What goes wrong:** `AUTO_REFINE_MAX_ATTEMPTS` defaults to something other than `1`, or the comparison flips from `<` to `<=`, changing how many refine loops run.
**How to avoid:** default `1` and keep `(state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS`. A test asserts default=1 loops exactly once and cap=2 loops twice.
**Warning signs:** `never-reply-regression.test.ts` Path C suddenly sees `generateEstimateForProject` called ≠2 times.

### Pitfall 2: Dropping `mediaResults` before finalize can read it
**What goes wrong:** `mediaResults` lives only in the WhatsApp ingest sub-graph state and is discarded when `ingest` returns `{}`/`{failure}`. Composing a per-item note in `finalize` reads an array that is no longer there.
**How to avoid:** carry a neutral summary (count + reason enum) forward on core state from `ingest`, or capture it in the adapter closure. Recommended: neutral state field.

### Pitfall 3: Breaking the never-reply invariant
**What goes wrong:** Emitting a separate "this item failed" reply in addition to the estimate reply → two `sendWhatsAppMessage` calls per batch.
**How to avoid:** the per-item note is concatenated INTO the single existing reply body. Tests assert `sendWhatsAppMessage` is called exactly once in every path.

### Pitfall 4: Graph-neutrality regression from the new state field
**What goes wrong:** Naming or commenting the new field with a WhatsApp token (`ownerPhone`, `whatsapp_`, etc.) trips `graph-neutrality.test.ts` (static grep of `lib/estimate/graph/` + `lib/estimate/quality/` against `FORBIDDEN`).
**How to avoid:** keep `requestedAt` / `droppedInputs` generic; no WhatsApp tokens in `state.ts`. The FORBIDDEN list is: `lib/whatsapp`, `ownerPhone`, `WhatsAppMessage`, `sendWhatsAppMessage`, `whatsapp_`, `downloadWhatsAppMedia`.

### Pitfall 5: companyId scoping on the recourse path
**What goes wrong:** Reading or writing project status using `state.companyId` instead of the closure value in the adapter, or exposing the service client to the UI.
**How to avoid:** the web adapter already uses the closure `companyId` for the `.eq('company_id', ...)` write (`default.ts:60`, regression-tested by `auto-refine-isolation.test.ts` Test D). The UI reads the RLS-validated `project.status` prop only.

### Pitfall 6: `requestedAt` fallback must exist for direct invokers
**What goes wrong:** Unit tests / non-Inngest callers invoke the adapter without `requestedAt` → `new Date(undefined + ...)` → `Invalid Date`.
**How to avoid:** `const base = state.requestedAt ?? Date.now()` at both mint sites.

## Code Examples

### Configurable cap (decide.ts)
```typescript
// Source: lib/estimate/graph/nodes/decide.ts (current literal at line 38)
const AUTO_REFINE_MAX_ATTEMPTS = (() => {
  const raw = Number(process.env.AUTO_REFINE_MAX_ATTEMPTS)
  return Number.isFinite(raw) && raw >= 0 ? raw : 1
})()

export function checkVagueAfterAssessEdge(state: EstimateStateType): string {
  if (!state.isVague) return 'finalize'
  if ((state.refineAttempts ?? 0) < AUTO_REFINE_MAX_ATTEMPTS) return 'autoRefine'
  return 'finalize'
}
```

### Replay-safe TTL (whatsapp.ts, both sites)
```typescript
// Source: lib/estimate/adapters/whatsapp.ts:356-358 and :385-387
const base = state.requestedAt ?? Date.now()
const expiresAt = new Date(base + SESSION_TTL_MINUTES * 60 * 1000).toISOString()
```

### Thread requestedAt at the Inngest entry
```typescript
// Source: lib/inngest/functions/generate-estimate.ts — inside step.run('orchestrate-estimate'),
// at the graph.invoke initial-state object (line ~121).
const invokeResult = await graph.invoke(
  {
    companyId,
    projectId,
    channel: traceChannel,
    requestedAt: t0,          // t0 = Date.now() captured at handler entry (line 88)
    prompts: prompts?.length ? prompts : undefined,
    estimateLanguage: language ?? undefined,
    createdByUserId: createdByUserId ?? undefined,
  },
  { /* callbacks/metadata unchanged */ }
)
```

### Recourse banner host (overview-tab.tsx)
```tsx
// Source: components/workspace/overview-tab.tsx — top of the returned <div className="space-y-6">.
{project.status === 'awaiting_details' && (
  <NeedsDetailsBanner onAddDetails={() => setModePickerOpen(true)} />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WhatsApp graph minted TTL with `Date.now()` inside the node (safe only while whole graph is one step.run) | TTL derived from a durable graph-entry timestamp | This phase (HARD-07) | Makes the future HARD-08 per-node decomposition safe in advance |
| Auto-refine cap hard-coded `< 1` | Configurable constant, default 1 | This phase (HARD-06) | Ops/tuning flexibility, zero default behavior change |
| Vague-after-refine left web users at a dead end (status written, never surfaced) | Recourse banner in OverviewTab | This phase (HARD-06) | Closes the dead-end; users can add detail + regenerate |

**Deprecated/outdated:** none introduced.

## Open Questions

1. **Exact WhatsApp graph invoke site for `requestedAt` threading**
   - What we know: `lib/inngest/functions/whatsapp-process.ts` composes the WhatsApp graph (it is the WhatsApp counterpart to `generate-estimate.ts`); the generate function's invoke at line 121 is fully mapped.
   - What's unclear: the precise line of the WhatsApp invoke initial-state object (not read in this pass; the file mirrors the generate function's pattern).
   - Recommendation: planner opens `whatsapp-process.ts`, threads `requestedAt: <entry Date.now()>` into the WhatsApp graph's initial state exactly as the generate function does.

2. **Carry-forward mechanism for the dropped-item summary (HARD-05)**
   - What we know: `mediaResults` exists only in the WhatsApp ingest sub-graph; two viable carry-forward options (neutral core state field vs adapter closure).
   - What's unclear: which the team prefers for testability vs minimal core-state surface.
   - Recommendation: neutral core-state field (`droppedInputs`), kept generic (count + reason enum) so graph-neutrality holds. Confirm during planning.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.*` (repo root; `npm test` runs `vitest run`) |
| Quick run command | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` (single file) |
| Full suite command | `npm test` (→ `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARD-06 | Default cap (no env) loops auto-refine exactly once (refineAttempts reaches 1, then finalize) | unit | `npx vitest run tests/unit/estimate/auto-refine-cap.test.ts` | ❌ Wave 0 |
| HARD-06 | `AUTO_REFINE_MAX_ATTEMPTS=N` makes `checkVagueAfterAssessEdge` route to autoRefine while `refineAttempts < N`, then finalize | unit | `npx vitest run tests/unit/estimate/auto-refine-cap.test.ts` | ❌ Wave 0 |
| HARD-06 | Web recourse banner renders when `project.status==='awaiting_details'` and its CTA invokes the existing generate trigger | unit (RTL) | `npx vitest run tests/unit/workspace/needs-details-banner.test.tsx` | ❌ Wave 0 |
| HARD-07 | Same `requestedAt` → identical `expiresAt` across a re-invocation (replay-stable); differs from a `Date.now()` re-mint | unit | `npx vitest run tests/unit/whatsapp/replay-safe-ttl.test.ts` | ❌ Wave 0 |
| HARD-05 | Partial batch failure (1 of 2 items `ok:false`) → estimate still built AND the single reply notes the dropped item | unit | `npx vitest run tests/unit/whatsapp/batch-reporting.test.ts` | ❌ Wave 0 |
| HARD-05 | All-fail batch still routes to the existing no-input onError reply (no double reply) | unit | `npx vitest run tests/unit/whatsapp/batch-reporting.test.ts` | ❌ Wave 0 |
| Invariant | Never-throw / exactly-one-reply across all paths stays green (Paths A/B/C) | unit | `npx vitest run tests/unit/whatsapp/never-reply-regression.test.ts` | ✅ exists |
| Invariant | graph-neutrality static grep stays green after adding `requestedAt`/`droppedInputs` | unit | `npx vitest run tests/unit/estimate/graph-neutrality.test.ts` | ✅ exists |
| Invariant | auto-refine isolation (QA-02 companyId closure, SMART-03/04) stays green | unit | `npx vitest run tests/unit/estimate/auto-refine-isolation.test.ts` | ✅ exists |

### Sampling Rate
- **Per task commit:** the single test file touched by the task, e.g. `npx vitest run tests/unit/whatsapp/replay-safe-ttl.test.ts`
- **Per wave merge:** `npm test` (full `vitest run`)
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/estimate/auto-refine-cap.test.ts` — covers HARD-06 cap (default=1 unchanged; cap=N loops N). Drive via `checkVagueAfterAssessEdge` with crafted `refineAttempts` + a stubbed `process.env.AUTO_REFINE_MAX_ATTEMPTS` (set/reset in `beforeEach`/`afterEach`).
- [ ] `tests/unit/whatsapp/replay-safe-ttl.test.ts` — covers HARD-07 (same `requestedAt` → identical `expiresAt` across two finalize invocations; assert against the `whatsapp_sessions` insert `expires_at`). Mirror the chainable-Supabase mock in `never-reply-regression.test.ts`.
- [ ] `tests/unit/whatsapp/batch-reporting.test.ts` — covers HARD-05 (partial failure → estimate built + one reply with dropped-item note; total failure → existing no-input path, still one reply). Reuse the `never-reply-regression.test.ts` mock harness; assert on the single `sendWhatsAppMessage` body substring.
- [ ] `tests/unit/workspace/needs-details-banner.test.tsx` — covers HARD-06 recourse UI (renders on `awaiting_details`, hidden otherwise, CTA fires the trigger). React Testing Library + vitest.
- [ ] No framework install needed (vitest present). RTL: confirm `@testing-library/react` is already a devDependency during Wave 0; the repo has client-component tests so it is expected present — verify before writing the banner test.

## Environment Availability

Step 2.6: SKIPPED for external runtimes — this phase is code/config-only (TypeScript edits to existing graph/adapter/UI + new vitest files). No new external tool, service, or database dependency. The one optional config knob, `AUTO_REFINE_MAX_ATTEMPTS`, is a non-secret env var read with a safe default (absent ⇒ 1), so its absence is the intended baseline, not a blocker.

## Sources

### Primary (HIGH confidence — direct repo reads)
- `lib/estimate/adapters/whatsapp.ts` — Send fan-out (127-282), `mediaResults` reducer (79-83), `hasUsableInput` (332), TTL mint sites (356-358, 385-387), `SESSION_TTL_MINUTES` (61), reason codes
- `lib/estimate/graph/nodes/decide.ts:36-40` — the `refineAttempts < 1` cap literal
- `lib/estimate/graph/nodes/auto-refine.ts` — cap doc + `state.companyId` (QA-02)
- `lib/estimate/graph/state.ts` — `EstimateState` Annotation.Root (where `requestedAt`/`droppedInputs` are added)
- `lib/estimate/graph/index.ts` — graph topology + cap-loop back-edge
- `lib/estimate/adapters/default.ts:43-66` — web finalize writes `awaiting_details` + returns `needsDetails`
- `lib/estimate/failure.ts` — `FailureReason` + frozen `failureReasonToChannelCopy` map
- `lib/whatsapp/ask-details.ts` — `buildAskDetailsMessage`
- `lib/inngest/functions/generate-estimate.ts` — `t0` entry timestamp (88), graph.invoke initial state (121-131)
- `lib/inngest/events.ts` — `EstimateGeneratePayload`
- `hooks/use-job-status.ts` — `pollJob` / `useJobStatus`, job `output` carries `needsDetails`
- `app/(app)/projects/[id]/page.tsx`, `components/workspace/{project-workspace,overview-tab,project-header,ai-input-group/ai-input-group,ai-input-group/use-ai-input-submit,estimate/estimate-tab}.tsx` — the web project workspace, generate trigger, status prop
- `components/ui/alert.tsx` — the reusable banner primitive
- `lib/queries/project.ts:8,98,110` — `ProjectDetail.status` server prop
- `tests/unit/estimate/auto-refine-isolation.test.ts`, `tests/unit/whatsapp/never-reply-regression.test.ts`, `tests/unit/estimate/graph-neutrality.test.ts` — existing regression harnesses + mock patterns to reuse
- `package.json` — `test` = `vitest run`, vitest 4.1.4

### Secondary / Tertiary
- None required — every claim is anchored to a direct repo read.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all libs pinned and present
- Cap mechanism + site: HIGH — exact line read (`decide.ts:38`); mechanism mirrors existing `SESSION_TTL_MINUTES` pattern
- TTL threading: HIGH — both mint sites + the entry timestamp (`t0`) read directly; one minor open question (exact WhatsApp invoke line)
- Recourse UI integration: HIGH — `project.status` prop confirmed in scope at OverviewTab; generate trigger reuse path traced end-to-end
- HARD-05 reporting: HIGH on compose site + reason vocabulary; MEDIUM on carry-forward mechanism (two valid options, recommendation given)
- Validation architecture: HIGH — framework + existing harnesses confirmed; Wave-0 gaps enumerated

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable brownfield; only risk is unrelated refactors moving the cited line numbers)
