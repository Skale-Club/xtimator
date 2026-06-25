# Phase 128: MCP Generation Reconciliation + Parity Verification - Research

**Researched:** 2026-06-25
**Domain:** MCP tool binding / channel-neutral generation reconciliation (no external libraries — pure in-repo refactor)
**Confidence:** HIGH (entirely codebase-verified; every claim cites a read file)

## Summary

Phase 128 closes v4.10 (and the Multi-Channel Core track) by reconciling the EXISTING MCP `create_estimate` tool (`lib/mcp/tools/write.ts`, built v4.1 / Phase 89) so its generation **dispatch** delegates to the v4.9 channel-neutral `createEstimate` (`lib/agent-tools/create-estimate.ts`) — the function that was itself modeled on this MCP tool ("NEUT-01 — Mirrors the dispatch body of the MCP create_estimate tool"). After this, all three channels (WhatsApp, web chat, MCP) route generation through the same neutral core, proving the "three siblings, one core" principle (MGEN-01). Then a parity test asserts the binding is real (MCP imports the neutral fn, doesn't re-implement) and the existing v4.1 MCP suite stays green unchanged (MPAR-01).

This is a **thin, surgical, behavior-preserving refactor** — NOT a new subsystem. The dispatch logic in the two functions is near-identical (same `EVENT_ESTIMATE_GENERATE`, same payload fields, same `{jobId}` return guard). The MCP tool keeps its auth/scope gate, project-ownership lookup, write-tool annotations, the `{job_id, status, message}` JSON envelope, and the `check_job_status` companion — only the inline `inngest.send(...)` block (write.ts lines 184-202) is replaced by a call to the neutral `createEstimate`.

**One load-bearing behavior subtlety exists** (the single real risk): the MCP tool's Inngest idempotency `id` is `estimate-mcp-${projectId}-${requestId}` (write.ts L196), whereas the neutral fn's is `estimate-${projectId}-${requestId}` (create-estimate.ts L48). The existing test asserts `expect(call.id).toMatch(/^estimate-mcp-p1-/)` (mcp-create-estimate.test.ts L175). The refactor MUST preserve the `estimate-mcp-` prefix OR the planner must consciously decide to relax that one assertion. See Pitfall 1 — this is the crux of the phase.

**Primary recommendation:** In `handleCreateEstimate`, keep everything except the `requestId`/`payload`/`inngest.send` block; replace that block with `const { jobId } = await createEstimate({ companyId: auth.company_id, projectId: input.project_id, prompts: [input.prompt], language: input.language, channel: 'mcp' })`, then return the same `{ job_id: jobId, status: 'queued', message: ... }` envelope. Resolve the idempotency-`id` prefix delta deliberately (Pitfall 1). Add one static binding-grep parity test (MPAR-01). Touch NOTHING in `lib/agent-tools/`.

<user_constraints>
## User Constraints (from REQUIREMENTS.md — no CONTEXT.md exists for this phase)

> No `*-CONTEXT.md` file exists in `.planning/phases/128-mcp-generation-parity/`. The constraints below are the milestone-level locked decisions from REQUIREMENTS.md + STATE.md "Locked guardrails" + CLAUDE.md, which bind this phase with the same authority.

### Locked Decisions
- **Three siblings, one core** — WhatsApp (LangChain tools), web chat (AI-SDK tools), MCP (MCP tools) all bind the SAME neutral `lib/agent-tools/` functions. v4.9 already did the extraction; this phase only reconciles the MCP generation dispatch to it.
- **The MCP tools BIND the neutral `lib/agent-tools/` — do NOT re-implement or re-extract.** The MCP `create_estimate` delegates TO `createEstimate`; it does not duplicate it.
- **`companyId` is TRUSTED** — resolved from the OAuth token → company (`auth.company_id`), NEVER a tool input field (T-lrf-01). The MCP tool already honors this; the refactor must not change it.
- **REUSE the v4.1 OAuth / `/api/mcp` transport infra** — do NOT rebuild it. The auth/scope/project-lookup wrapper stays.
- **Non-destructive:** the existing v4.1 MCP test suite stays GREEN unchanged. The refactor is behavior-identical (same event, same payload, same return).
- **MCP is owner-scoped via the OAuth token → NEVER customer-facing.**

### Claude's Discretion
- The exact shape of the MPAR-01 parity test (static import-grep vs. behavioral binding assertion vs. both). Recommendation in this doc: a static binding-grep test (see Validation Architecture).
- Whether to also assert the "all three channels converge on one core" doc/structural claim. Recommendation: yes, a lightweight static grep over the three adapter files.
- How to resolve the idempotency-`id` prefix delta (Pitfall 1) — preserve `estimate-mcp-` via a neutral-fn extension, OR accept the neutral `estimate-` prefix and relax the one test assertion. Recommendation: preserve the prefix (see Pitfall 1) to keep the suite byte-green.

### Deferred Ideas (OUT OF SCOPE — v2)
- **Edit/send MCP tools** (MMCP-01) — extract the WhatsApp edit/confirm/send capability to neutral FIRST; matches the web-chat v1 deferral. Do NOT add them here.
- **MCP resources** (MMCP-02) — `xtimator://estimate/{id}` etc. Not in this phase.
- Re-extracting any capability (v4.9 did it). Touching the web chat or WhatsApp beyond the parity assertion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MGEN-01 | The existing MCP `create_estimate` routes through the neutral `lib/agent-tools/createEstimate` (the async `{jobId}` contract it pioneered), so all three channels share one generation entry point — behavior preserved. | Exact refactor specified below: replace write.ts L184-202 inline dispatch with a call to `createEstimate`. Payloads verified field-for-field identical except the idempotency `id` prefix (Pitfall 1). Auth/scope/project-lookup wrapper + envelope + `check_job_status` companion stay. |
| MPAR-01 | The MCP tools BIND the neutral `lib/agent-tools/` (not a re-implementation), and the existing v4.1 MCP test suite stays green unchanged (non-destructive). | Static binding-grep test recommended (mirrors `tests/unit/agent-tools/neutrality.test.ts` static-grep pattern). The existing `mcp-create-estimate.test.ts` / `mcp-check-job-status.test.ts` / `mcp-tool-registry.test.ts` are the regression guard — they must stay byte-unchanged and green. Three-channel convergence grep recommended. |
</phase_requirements>

## Standard Stack

**No new libraries.** This phase is a pure in-repo refactor + test. Everything is already installed.

### Relevant existing modules (the surface area of the change)
| Module | Role | Touched? |
|--------|------|----------|
| `lib/mcp/tools/write.ts` | The MCP `create_estimate` + `check_job_status` tools | **YES** — `handleCreateEstimate` dispatch block only |
| `lib/agent-tools/create-estimate.ts` | The neutral `createEstimate({...}) → {jobId}` | **NO** — delegate TO it, do not modify (neutrality gate forbids) |
| `lib/agent-tools/index.ts` | Barrel re-exporting the neutral capabilities | read-only — import `createEstimate` from here or from the direct module |
| `lib/inngest/events.ts` | `EVENT_ESTIMATE_GENERATE` + `EstimateGeneratePayload` | **NO** — unchanged; both fns already use it |
| `lib/inngest/functions/generate-estimate.ts` | The async job (the shared engine entry) | **NO** — consumes the event identically regardless of dispatcher |
| `tests/unit/mcp-create-estimate.test.ts` | Existing behavior guard (the MPAR-01 anchor) | keep GREEN — see Pitfall 1 for the one assertion at risk |
| `tests/unit/mcp-tool-registry.test.ts` | Registry counts (12 tools) + annotations | keep GREEN byte-unchanged |
| `tests/unit/mcp-check-job-status.test.ts` | `check_job_status` companion guard | keep GREEN byte-unchanged |

**Installation:** none. No `npm install`. No migration. No env var. No secret.

## Architecture Patterns

### The reconciliation (the heart of MGEN-01)

`handleCreateEstimate` (write.ts L147-210) has THREE logical sections. Only the third changes:

1. **Scope gate + input parse** (L151-152) — `ensureScope(auth, 'mcp:write')` + `parseInput(createEstimateInput, args)`. **STAYS MCP-specific.**
2. **Project-ownership lookup** (L157-171) — service-client `projects` read, `notFound` if the project's `company_id !== auth.company_id`. This is the MCP tenancy re-enforcement (the OAuth consent authorized this exact (user, company) tuple). **STAYS MCP-specific.** The neutral `createEstimate` has NO project lookup by design (create-estimate.ts doc: "stripped of any single channel's auth/scope/project-lookup wrapper"; each channel keeps its own pre-flight).
3. **Dispatch** (L184-202) — mints `requestId`, builds `EstimateGeneratePayload`, calls `inngest.send`, extracts `ids[0]` as `jobId`. **THIS is what delegates to the neutral fn.**

### Recommended exact refactor

Replace write.ts lines 184-202 (the `requestId`/`payload`/`inngest.send`/`jobId` block) with:

```typescript
// Source: lib/agent-tools/create-estimate.ts (the neutral dispatch) + lib/chat/tools.ts (the binding precedent)
const { jobId } = await createEstimate({
  companyId: auth.company_id,
  projectId: input.project_id,
  prompts: [input.prompt],
  ...(input.language ? { language: input.language } : {}),
  channel: 'mcp',
})
```

…and keep the existing return envelope verbatim (L204-209):

```typescript
return jsonContent({
  job_id: jobId,
  status: 'queued',
  message:
    'Estimate generation queued. Poll check_job_status to track progress.',
})
```

Add the import (top of write.ts, alongside the existing imports):
```typescript
import { createEstimate } from '@/lib/agent-tools'   // or '@/lib/agent-tools/create-estimate'
```

After this, the now-unused imports in write.ts can be removed IF nothing else uses them: `randomUUID` (L25), `inngest` (L29), and `EVENT_ESTIMATE_GENERATE` / `EstimateGeneratePayload` (L31-33). **VERIFY before deleting** — `check_job_status` does NOT use them (it uses `fetch` + the Inngest REST API), so they become dead after the dispatch block is removed. Removing them is the cleanest "binding, not re-implementation" signal but is optional; leaving an unused import would trip `tsc`/lint, so either remove or the binding test should not assert their absence.

### The binding precedent to mirror (lib/chat/tools.ts)

The web chat already did EXACTLY this delegation (lib/chat/tools.ts L67-76):
```typescript
execute: async ({ projectId, prompts }) => {
  const { jobId } = await createEstimate({
    companyId: ctx.companyId,
    projectId,
    prompts,
    language: ctx.language,
    channel: 'web',
  })
  return { jobId, status: 'queued' as const }
},
```
The MCP refactor is the same pattern with `channel: 'mcp'`, the trusted `auth.company_id`, and `prompts: [input.prompt]` (MCP takes a single `prompt` string; the neutral fn takes `prompts: string[]`).

### Anti-Patterns to Avoid
- **Re-implementing the dispatch in the MCP tool "for safety."** The whole point of MGEN-01 is ONE dispatch. Delete the inline `inngest.send`; call the neutral fn.
- **Modifying `lib/agent-tools/create-estimate.ts`.** The neutrality gate (`tests/unit/agent-tools/neutrality.test.ts`) and the scope fence forbid it. If the neutral fn needs a new capability (e.g., a custom idempotency-id prefix), that is a deliberate widening — see Pitfall 1 for how to do it without breaking neutrality.
- **Moving the project-ownership lookup into the neutral fn.** It is intentionally channel-specific (each channel keeps its own pre-flight). Keep it in the MCP tool.
- **Changing the `{job_id, status, message}` envelope.** The existing test asserts all three (`mcp-create-estimate.test.ts` L157-159). The neutral fn returns `{jobId}` (camelCase, no envelope); the MCP tool re-wraps it into the snake_case `job_id` envelope it already returns. Keep the wrapping.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Generation dispatch (event name, payload, requestId, jobId guard) | A second inline `inngest.send` in the MCP tool | The neutral `createEstimate` | That IS MGEN-01 — one dispatch, three channels |
| Job-status polling | A new MCP job table | The existing `check_job_status` (write.ts L259-315, Inngest REST) | Already shipped Phase 89; stays unchanged |
| Idempotency id | A new scheme | The neutral fn's `estimate-${projectId}-${requestId}` (or preserve the `estimate-mcp-` prefix — Pitfall 1) | The id is the Inngest dedupe key; keep it deterministic |

**Key insight:** The neutral `createEstimate` was literally written by copying the MCP tool's dispatch body (create-estimate.ts doc comment: "Mirrors the dispatch body of the MCP create_estimate tool"). Reconciliation is the inverse: the MCP tool now calls back into the function that was extracted from it. The diff is small precisely because the two bodies were near-identical to begin with.

## Common Pitfalls

### Pitfall 1: The Inngest idempotency-`id` prefix delta (THE load-bearing risk)
**What goes wrong:** The existing test `mcp-create-estimate.test.ts` L174-175 asserts:
```typescript
// Idempotency key includes the project id + a per-call requestId.
expect(call.id).toMatch(/^estimate-mcp-p1-/)
```
The MCP tool today sends `id: estimate-mcp-${input.project_id}-${requestId}` (write.ts L196). The neutral `createEstimate` sends `id: estimate-${args.projectId}-${requestId}` (create-estimate.ts L48) — **no `mcp-` segment**. If the MCP tool delegates naively, `call.id` becomes `estimate-p1-...`, the regex `/^estimate-mcp-p1-/` FAILS, and the existing suite goes RED — violating MPAR-01 ("existing suite stays green unchanged").
**Why it happens:** The neutral fn was parameterized but did NOT carry the channel into the idempotency id (the chat path, channel:'web', also gets `estimate-${projectId}-...`). The `mcp-` discriminator was an MCP-only detail not lifted into the neutral fn.
**How to avoid (two options — planner must pick ONE deliberately):**
- **Option A (recommended — keep the suite byte-green):** Widen the neutral `createEstimate` to incorporate `channel` into the idempotency id, e.g. `id: \`estimate-${args.channel ? args.channel + '-' : ''}${args.projectId}-${requestId}\``. This makes the MCP path emit `estimate-mcp-p1-...` and the web path `estimate-web-...` — a *behavior change for the web channel's id*, but web has no test asserting its id prefix (lib/chat/tools.ts has no id assertion). **CAVEAT:** this modifies `lib/agent-tools/create-estimate.ts`, which the scope fence says to leave alone. It is a *widening that preserves neutrality* (channel is already a neutral param) and keeps both the MCP behavior AND the existing test green — a justified, surgical exception. The neutral `create-estimate.test.ts` may need a matching assertion update; verify.
- **Option B (relax the one assertion):** Accept the neutral `estimate-` prefix and change the single test line to `expect(call.id).toMatch(/^estimate-p1-/)`. This edits the existing MCP test — technically "the suite did not stay byte-unchanged" — so it is a weaker fit for MPAR-01's "unchanged" wording. Only choose if the planner decides the `mcp-` prefix carries no operational value.
**Warning signs:** `mcp-create-estimate.test.ts` "calls inngest.send with the EVENT_ESTIMATE_GENERATE event and correct payload" goes red on the `call.id` matcher while every other assertion passes.

### Pitfall 2: `prompts: [input.prompt]` vs `prompts: input.prompt`
**What goes wrong:** The MCP tool's input is a single `prompt: string` (write.ts L72, `createEstimateInput` L108). The neutral fn (and the payload) expect `prompts: string[]`. Passing the bare string makes `prompts` a `string` where `string[]` is required → `tsc` error, or worse, a silently malformed payload.
**How to avoid:** Wrap: `prompts: [input.prompt]`. The current MCP tool already does exactly this (write.ts L190: `prompts: [input.prompt]`), so the value is identical — just routed through the neutral fn now.
**Warning signs:** `tsc --noEmit` type error on the `createEstimate({...})` call; or the generated estimate ignores the prompt.

### Pitfall 3: Forgetting `channel: 'mcp'` → Langfuse trace mis-tags
**What goes wrong:** The async job reads `data.channel` to tag the Langfuse trace and session (`generate-estimate.ts` L115: `const traceChannel = (data.channel ?? 'web')`). If the MCP delegation omits `channel: 'mcp'`, MCP-originated runs get tagged `web` — an observability regression (and the existing payload sets it).
**How to avoid:** Always pass `channel: 'mcp'` in the delegated call (matches write.ts L189 today).
**Warning signs:** No test failure (channel is optional), but MCP estimates show up under the `web` Langfuse session — caught only in manual trace review. The plan should keep `channel: 'mcp'` explicit.

### Pitfall 4: Removing imports that `check_job_status` still needs
**What goes wrong:** After deleting the dispatch block, `randomUUID`, `inngest`, `EVENT_ESTIMATE_GENERATE`, and `EstimateGeneratePayload` look unused — but a careless removal could break `check_job_status` or future use. Verified: `check_job_status` uses `fetch` + the Inngest REST API (write.ts L276), NOT the `inngest` client or the event constant, so these four ARE safe to remove. Leaving them in → unused-import lint/tsc warning.
**How to avoid:** Remove all four; run `tsc --noEmit` on write.ts to confirm. The `notFound` / `invalidInput` / `insufficientScope` error helpers and `requireServiceClient` STAY (project lookup + scope gate use them).
**Warning signs:** `tsc` "declared but never used" on `randomUUID`/`inngest`; or a test importing `__testing` that referenced a removed symbol (none do — `__testing` exports `handleCreateEstimate` and the schemas, not the dispatch internals).

### Pitfall 5: Mock topology shift in the existing test
**What goes wrong:** `mcp-create-estimate.test.ts` mocks `@/lib/inngest/client` directly (L31-34) and asserts on `inngestSend`. After the refactor, the MCP tool no longer imports `inngest` — but the neutral `createEstimate` DOES import `@/lib/inngest/client`. Because vitest module mocks are hoisted and apply to the whole module graph, the `vi.mock('@/lib/inngest/client', ...)` still intercepts the send from inside the neutral fn. So the existing assertions on `inngestSend.mock.calls[0][0]` (event name, payload, id) continue to work UNCHANGED — except the `id` prefix (Pitfall 1).
**Why it (mostly) just works:** The mock is on the leaf module both functions ultimately call. The test does not mock `@/lib/agent-tools/create-estimate`, so the real neutral fn runs and calls the mocked `inngest.send`.
**How to avoid surprises:** Do NOT add a `vi.mock('@/lib/agent-tools')` to the existing create_estimate test — that would stub out the real delegation and the payload assertions would lose their meaning. Let the real neutral fn run against the mocked inngest client. Confirm by running the suite after the refactor.
**Warning signs:** If you mock `@/lib/agent-tools`, `inngestSend` is never called and "calls inngest.send ... exactly once" fails with 0 calls.

## Code Examples

### The delegated `handleCreateEstimate` dispatch (post-refactor, the load-bearing change)
```typescript
// Source: synthesis of lib/mcp/tools/write.ts (wrapper) + lib/chat/tools.ts (binding precedent)
async function handleCreateEstimate(auth: McpAuthContext, args: unknown): Promise<ToolResult> {
  ensureScope(auth, 'mcp:write')                       // STAYS — MCP scope gate
  const input = parseInput(createEstimateInput, args)  // STAYS — MCP input parse

  // STAYS — MCP tenancy re-enforcement (project must belong to the OAuth-resolved company)
  const supabase = requireServiceClient()
  const { data: project, error } = await supabase
    .from('projects').select('id, company_id').eq('id', input.project_id).maybeSingle()
  if (error) throw new Error(`create_estimate project lookup failed: ${error.message}`)
  if (!project || (project as { company_id: string }).company_id !== auth.company_id) {
    throw notFound(`Project ${input.project_id} not found`)
  }

  // DELEGATES — one shared generation entry point (MGEN-01). Was an inline inngest.send.
  const { jobId } = await createEstimate({
    companyId: auth.company_id,
    projectId: input.project_id,
    prompts: [input.prompt],
    ...(input.language ? { language: input.language } : {}),
    channel: 'mcp',
  })

  // STAYS — the MCP snake_case envelope the existing test + check_job_status companion expect
  return jsonContent({
    job_id: jobId,
    status: 'queued',
    message: 'Estimate generation queued. Poll check_job_status to track progress.',
  })
}
```

### MPAR-01 static binding-grep test (recommended new test)
```typescript
// Source: pattern mirrors tests/unit/agent-tools/neutrality.test.ts (static readFileSync grep)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

describe('MPAR-01: MCP binds the neutral core (not a re-implementation)', () => {
  it('mcp create_estimate imports the neutral createEstimate', () => {
    const src = read('lib/mcp/tools/write.ts')
    expect(src).toMatch(/from '@\/lib\/agent-tools(\/create-estimate)?'/)
    expect(src).toContain('createEstimate(')
  })

  it('mcp create_estimate no longer dispatches EVENT_ESTIMATE_GENERATE itself', () => {
    const src = read('lib/mcp/tools/write.ts')
    expect(src).not.toContain('EVENT_ESTIMATE_GENERATE') // dispatch delegated to the neutral fn
  })

  it('all three channel adapters route generation through the neutral createEstimate / engine', () => {
    expect(read('lib/chat/tools.ts')).toContain('createEstimate(')                      // web chat
    expect(read('lib/mcp/tools/write.ts')).toContain('createEstimate(')                 // MCP
    // WhatsApp confirm-flow converges on the same engine via generateEstimateForProject
    expect(read('lib/whatsapp/confirm-actions.ts')).toContain('generateEstimateForProject(')
  })
})
```
> NOTE: the second assertion (`not.toContain('EVENT_ESTIMATE_GENERATE')`) only holds if the dispatch block AND the now-dead import are fully removed (Pitfall 4). If the planner chooses to keep the import for any reason, weaken this to assert the absence of `inngest.send(` instead.

## State of the Art

Not applicable — no external library/framework currency to track. This is an internal refactor. The "old approach" (inline MCP dispatch) → "new approach" (delegate to neutral) transition table:

| Old Approach (pre-128) | Current Approach (post-128) | When Changed | Impact |
|------------------------|------------------------------|--------------|--------|
| MCP `create_estimate` has its own inline `inngest.send(EVENT_ESTIMATE_GENERATE)` | MCP `create_estimate` calls neutral `createEstimate` | Phase 128 | One generation dispatch; WhatsApp = chat = MCP over one core |
| Web chat already delegated (v4.9, Phase 124) | unchanged | — | MCP catches up to the chat's binding pattern |

## Runtime State Inventory

> Rename/refactor phase. A grep audit finds files; runtime state is enumerated below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — verified: no DB key, collection, or stored id encodes the `create_estimate` dispatch path. The Inngest idempotency `id` (`estimate-mcp-...`) is a transient event dedupe key, not persisted in any table the app owns. | None |
| Live service config | **Inngest event-id namespace.** The Inngest cloud dedupe window keys on `event.data.requestId` (the function's `idempotency: 'event.data.requestId'`, generate-estimate.ts L43) — NOT on the `send` `id`. The `send` `id` (`estimate-mcp-${projectId}-${requestId}`) is a per-send dedupe; `requestId` is freshly minted per call (`randomUUID`) so changing the `id` prefix does NOT collide with historical events. **No live Inngest config is stored outside git** that references the prefix. | Verify Pitfall 1 keeps requestId per-call (it does) — no Inngest dashboard change |
| OS-registered state | **None** — verified: no Task Scheduler / pm2 / cron references the MCP create_estimate. | None |
| Secrets/env vars | **None** — verified: the refactor adds no secret, reads no new env var. `INNGEST_SIGNING_KEY` / `INNGEST_DEV` are read by `check_job_status` (unchanged) only. | None |
| Build artifacts / installed packages | **None** — verified: no package rename, no egg-info/dist artifact, no `npm install`. Pure source edit. | None |

**The canonical question — "after every file is updated, what runtime systems still have the old string cached/registered?":** Only the Inngest event-id namespace, and it is safe because `requestId` (the actual dedupe key) is per-call random. No data migration is required. This is a code-edit-only refactor.

## Open Questions

1. **Idempotency-`id` prefix: preserve `estimate-mcp-` (Option A) or relax the test (Option B)?**
   - What we know: the existing test asserts `/^estimate-mcp-p1-/`; the neutral fn emits `estimate-`.
   - What's unclear: whether the `mcp-` discriminator carries operational value (it aids Inngest dashboard filtering by channel; the web path has no equivalent today).
   - Recommendation: **Option A** — widen the neutral fn to fold `channel` into the id (`estimate-${channel}-${projectId}-${requestId}`), keeping the MCP suite byte-green AND giving the web path a `web-` discriminator for free. This is a neutrality-preserving widening (channel is already a neutral param), but it DOES edit `lib/agent-tools/create-estimate.ts` — the planner must approve this as the single justified exception to "don't touch the neutral fn," and update the neutral `create-estimate.test.ts` id assertion to match. If the planner wants zero edits to the neutral module, fall back to Option B (relax the one MCP test line) and accept the slightly weaker "unchanged" claim.

2. **Remove the now-dead imports in write.ts, or leave them?**
   - What we know: `randomUUID`, `inngest`, `EVENT_ESTIMATE_GENERATE`, `EstimateGeneratePayload` become unused after the dispatch block is removed; `check_job_status` does not use them.
   - Recommendation: remove them — it makes the "binding, not re-implementation" assertion (`not.toContain('EVENT_ESTIMATE_GENERATE')`) clean and avoids tsc/lint unused-import noise. Run `tsc --noEmit` on write.ts to confirm nothing else references them.

## Environment Availability

> Skipped — no external dependencies. Pure code/config refactor against already-installed modules (vitest, the MCP SDK, the Inngest client — all present from v4.1/v4.9). No tool, service, runtime, or CLI beyond the existing test runner is needed.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured; ~335 test files repo-wide, suite green per STATE.md) |
| Config file | `vitest.config.ts` (repo root — inferred from existing `npx vitest run` usage; verify in Wave 0) |
| Quick run command | `npx vitest run tests/unit/mcp-create-estimate.test.ts tests/unit/mcp-check-job-status.test.ts tests/unit/mcp-tool-registry.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MGEN-01 | MCP `create_estimate` delegates to neutral `createEstimate`; same event/payload/`{job_id,status,message}` return; idempotency id preserved | unit (behavior, EXISTING) | `npx vitest run tests/unit/mcp-create-estimate.test.ts -t "happy path"` | ✅ exists (the regression guard) |
| MGEN-01 | `check_job_status` companion still works unchanged | unit (EXISTING) | `npx vitest run tests/unit/mcp-check-job-status.test.ts` | ✅ exists |
| MGEN-01 | Registry still advertises 12 tools + annotations unchanged | unit (EXISTING) | `npx vitest run tests/unit/mcp-tool-registry.test.ts` | ✅ exists |
| MPAR-01 | MCP imports/calls the neutral `createEstimate` (binding, not re-impl); no inline EVENT dispatch; three-channel convergence | unit (static grep, NEW) | `npx vitest run tests/unit/mcp-generation-parity.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/mcp-create-estimate.test.ts tests/unit/mcp-check-job-status.test.ts tests/unit/mcp-tool-registry.test.ts` plus the new parity test once it exists.
- **Per wave merge:** `npx vitest run tests/unit` (the MCP + agent-tools + chat neighborhood at minimum).
- **Phase gate:** full `npx vitest run` green (the milestone-close gate — STATE.md tracks the known parallel-only `mcp-route-contract.test.ts` flake; confirm it is the ONLY non-green and passes in isolation).

### Wave 0 Gaps
- [ ] `tests/unit/mcp-generation-parity.test.ts` — NEW static binding-grep test for MPAR-01 (mirrors `tests/unit/agent-tools/neutrality.test.ts` readFileSync pattern). Covers: write.ts imports `createEstimate`, no inline `EVENT_ESTIMATE_GENERATE` dispatch, three-channel convergence grep.
- [ ] (Pitfall 1 / Open-Q 1) If Option A chosen: update the id assertion in `tests/unit/agent-tools/create-estimate.test.ts` to match the channel-prefixed id; verify `mcp-create-estimate.test.ts` L175 stays green with the `estimate-mcp-` prefix.
- [ ] No framework install needed — vitest already present.
- Existing tests are the regression spine; the only AUTHORED change to an existing test is the single conditional line in Pitfall 1 (and ONLY if Option B, or the neutral test under Option A).

## Sources

### Primary (HIGH confidence — all codebase-verified by direct Read)
- `lib/mcp/tools/write.ts` — the MCP `create_estimate` + `check_job_status`; dispatch block L184-202, envelope L204-209, idempotency id L196.
- `lib/agent-tools/create-estimate.ts` — neutral `createEstimate`, idempotency id L48, `{jobId}` return L52.
- `lib/chat/tools.ts` — the web-chat binding precedent, L57-77.
- `lib/mcp/tools/knowledge-query.ts` — the Phase-127 binding pattern (read-tool sibling).
- `lib/inngest/functions/generate-estimate.ts` — the shared engine entry; reads `data.channel` L115.
- `lib/inngest/events.ts` — `EVENT_ESTIMATE_GENERATE` L10, `EstimateGeneratePayload` L28-63.
- `lib/whatsapp/confirm-actions.ts` — WhatsApp generation via `generateEstimateForProject` L9/L339 (the third channel's engine convergence).
- `tests/unit/mcp-create-estimate.test.ts` — the behavior guard; id-prefix assertion L174-175, mock topology L31-34.
- `tests/unit/mcp-tool-registry.test.ts` — 12-tool count + annotations.
- `tests/unit/mcp-check-job-status.test.ts` — companion guard.
- `tests/unit/mcp-knowledge-query-tools.test.ts` — Phase-127 binding-test pattern.
- `tests/unit/agent-tools/neutrality.test.ts` — the static readFileSync-grep pattern to mirror for MPAR-01.
- `lib/mcp/tools/registry.ts` — `buildAllTools` concatenation (read+write+knowledge), 12 tools.
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `CLAUDE.md`, `.planning/config.json` — constraints + locked decisions.

### Secondary / Tertiary
- None — this phase required no web research. All facts are first-party codebase reads.

## Project Constraints (from CLAUDE.md)
- **No secrets in any file** (incl. `.planning/`, comments, examples) — this doc uses only placeholder ids (`co_target`, `evt_test_abc123`, `p1`). No real keys.
- **Tech stack:** Next.js 14+ App Router, TypeScript strict, zod. The refactor stays within these.
- **Security:** all AI calls server-side; service role key never in browser. The MCP tool is `import 'server-only'` and uses the service client server-side — unchanged.
- **GSD workflow:** edits happen via the phase execution flow; no direct repo edits outside it.
- **(Project memory) Authored-only / no remote apply:** N/A — this phase has no migration. Deploy is CI→GHCR→Coolify; no on-VPS build.
- **(Project memory) GSD state-revert + phase-number quirks:** the planner/executor should re-assert milestone v4.10 and the real next phase **128** after state commands (STATE.md notes the `phase complete` mis-points to stale 999.1).

## Metadata

**Confidence breakdown:**
- Standard stack / refactor shape: **HIGH** — both functions read in full; the delegation is a near-verbatim mirror of the already-shipped chat binding.
- Architecture (what stays MCP-specific vs delegates): **HIGH** — explicitly documented in both source files' doc comments + verified against the tests.
- Pitfalls: **HIGH** — Pitfall 1 (id prefix) is verified against the exact test assertion line; Pitfalls 2-5 verified against payload types, the engine's channel read, and the test mock topology.
- MPAR-01 test shape: **MEDIUM-HIGH** — the static-grep pattern is proven elsewhere in the repo (`neutrality.test.ts`, `mcp-knowledge-query-tools.test.ts`); the exact assertions are a recommendation the planner may tune.

**Research date:** 2026-06-25
**Valid until:** stable indefinitely — internal refactor against frozen v4.9 neutral core + frozen v4.1 MCP infra; re-validate only if `lib/agent-tools/create-estimate.ts` or `lib/mcp/tools/write.ts` change before the phase runs.
