# Phase 121: WhatsApp KNOWLEDGE Intent - Research

**Researched:** 2026-06-24
**Domain:** WhatsApp intent routing (LangChain classifier) + channel-neutral `lib/knowledge/` consumption
**Confidence:** HIGH

## Summary

Phase 121 is the **thin consumer phase** that proves the channel-neutral `lib/knowledge/` module (built in Phase 118) end-to-end. Every dependency is already shipped and verified: `answer(question, ctx)` exists, never-throws, and accepts exactly the `{ industries, companyId, language? }` shape this phase must build. There is **no new module, no migration, no new dependency, no secret** — this is a surgical edit to one file (`lib/whatsapp/intent-router.ts`) plus a unit test.

The work has two requirement-mapped pieces. **WAKB-01**: add a 5th label `KNOWLEDGE` to the `Intent` union, the `parseIntent` parser, and the `classify()` system prompt — with a QUERY-vs-KNOWLEDGE disambiguation rule — while preserving the existing safe-default behavior (unrecognized output AND classifier failure both fall through to `CREATE`). **WAKB-02**: a `dispatchKnowledge(input, normalizedText)` function that mirrors `dispatchQuery`: it reads the resolved company's `industries[]` via the service `input.supabase` client, builds the `AnswerCtx`, calls `answer(...)`, and delivers the returned string through the existing `sendOwnerReplyChunks` + `splitReply` path.

**Primary recommendation:** Mirror `dispatchQuery` exactly. Add `KNOWLEDGE` to the union/parser/prompt, add a `dispatchKnowledge` that does one `companies` read (`industries, default_estimate_language`), calls `answer(text, { industries, companyId, language })`, and reuses `splitReply` + `sendOwnerReplyChunks`. `answer()` already never-throws and returns a safe FALLBACK string, so the dispatch needs only a defensive empty-string guard (identical to the QUERY `fallback` pattern). Do NOT touch `lib/knowledge/` (ENGINE-01 neutrality) and do NOT add a migration.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (no `/gsd:discuss-phase` was run). Constraints are sourced from the milestone-level **Locked decisions** in REQUIREMENTS.md and SEED-033, treated with the same authority:

### Locked Decisions (from SEED-033 + REQUIREMENTS.md milestone guardrails)
- **Channel-neutral module stays neutral.** `lib/knowledge/` imports NO channel. The WhatsApp dispatch is the channel adapter; `lib/knowledge/` is the consumer's dependency, NEVER modified by this phase. The ENGINE-01 static neutrality gate scans `lib/knowledge/*.ts` for channel tokens — adding a `lib/whatsapp` import there would break it.
- **Scope fence: WhatsApp ONLY.** Web chat (SEED-034) and the MCP `ask_knowledge` tool (SEED-030) are OUT — separate milestones. This phase wires only the WhatsApp 5th intent.
- **Safe CREATE default preserved.** `parseIntent` defaults any unrecognized classifier output to `CREATE` (never a privileged action); `classifyAndRoute` defaults to `CREATE` on classifier failure. Both behaviors MUST survive — KNOWLEDGE is ADDED to the recognized set, the fallback stays `CREATE`.
- **QUERY-vs-KNOWLEDGE disambiguation (the seed's non-negotiable rule):** QUERY = a question about the company's OWN records (estimates / clients / projects / its own price book). KNOWLEDGE = a trade how-to / process / best-practice question that does NOT depend on the company's data. Ambiguous "how should I price X?" → prefer QUERY if it references the company's price book, KNOWLEDGE if it's generic best-practice.
- **No new migration; authored-only deploy.** No schema change in this phase. (`companies.industries[]` already exists — migration `20260620000001`.)
- **No secrets.** No new env var; `answer()` reuses the existing platform OpenRouter integration key (`getORKey`).
- **never-throw degradation.** `answer()` already never-throws (returns FALLBACK on any failure). The dispatch degrades gracefully — a fallback reply if `answer` returns an empty string.

### Claude's Discretion
- **`language` argument** is OPTIONAL on `AnswerCtx`. Passing the resolved company's `default_estimate_language` is a recommended improvement (see Pattern 3) but the phase is correct without it — `answer` defaults to `'en'`, and the RAG prompt can also be steered to "respond in the user's language" the way the QUERY agent already is. Plan may include or defer it.
- **`k` (top-k passages)** — leave at the `answer`/`retrieve` default of 5 unless there's a reason to override.

### Deferred Ideas (OUT OF SCOPE)
- Cohere reranker (v2, data-driven trigger).
- Web-chat consumption (SEED-034).
- MCP `ask_knowledge` tool (SEED-030).
- Owner-facing KB browser (locked: KB is a conversational surface only).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WAKB-01 | `classifyAndRoute` gains a 5th intent KNOWLEDGE + QUERY-vs-KNOWLEDGE disambiguation; safe CREATE default preserved | Pattern 1 (Intent union + parseIntent), Pattern 2 (classify prompt). Exact insertion points in `lib/whatsapp/intent-router.ts` documented below. |
| WAKB-02 | A KNOWLEDGE message dispatches to `lib/knowledge/answer` scoped by the resolved company's `industries[]` + overlay, delivered via the existing chunked owner reply path | Pattern 3 (`dispatchKnowledge` mirroring `dispatchQuery`), Pattern 4 (industries[] read), `answer` signature verified, `sendOwnerReplyChunks` + `splitReply` already in the file. |

## Standard Stack

No new packages. Every dependency is already in the repo and verified present.

### Core (already installed, already imported in `intent-router.ts`)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| `@langchain/openai` (`ChatOpenAI`) | The `classify()` gpt-4o classifier call | Already used for the 4-intent classifier; the 5th label needs zero new code here |
| `@langchain/core/messages` | `SystemMessage`/`HumanMessage`/`AIMessage` | Already imported |
| `@supabase/supabase-js` (`SupabaseClient`) | The `input.supabase` service client used to read `companies` | `dispatchQuery` already reads `companies` with it |

### Supporting (the module this phase consumes — DO NOT MODIFY)
| Symbol | Source | Signature / Contract |
|--------|--------|----------------------|
| `answer` | `@/lib/knowledge/answer` | `answer(question: string, ctx: AnswerCtx): Promise<string>` — never-throws, returns FALLBACK string `"I couldn't find an answer in the knowledge base right now."` on any failure |
| `AnswerCtx` | `@/lib/knowledge/answer` | `RetrieveCtx & { language?: 'en' \| 'pt' \| 'es' }` = `{ industries: string[]; companyId: string \| null; k?: number; language?: 'en'\|'pt'\|'es' }` |
| `splitReply` | `@/lib/whatsapp/split-reply` | Already imported in `intent-router.ts`; splits a long answer into ≤1000-char WhatsApp chunks |
| `sendOwnerReplyChunks` | local in `intent-router.ts` | Already defined (lines 133-147); sends ordered chunks + fire-and-forget logging |

**Installation:** None. `npm install` is a no-op for this phase.

## Architecture Patterns

### Recommended structure
The entire change lives in ONE source file. No new files except the test.

```
lib/whatsapp/intent-router.ts   # MODIFIED: union + parseIntent + classify prompt + dispatchKnowledge + switch case
tests/unit/whatsapp/intent-router.test.ts   # EXTENDED: add KNOWLEDGE routing test(s)
```

### Pattern 1: Add `KNOWLEDGE` to the `Intent` union + `parseIntent` (WAKB-01)
**What:** Extend the type union and the label parser. The parser checks each recognized label by substring and falls through to `CREATE`.
**Where:** `lib/whatsapp/intent-router.ts` line 47 (union) + lines 97-104 (`parseIntent`).
**Example (verified against current source):**
```typescript
// line 47 — current:
export type Intent = 'CONFIRM_OR_CANCEL' | 'EDIT' | 'CREATE' | 'QUERY'
// → add 'KNOWLEDGE':
export type Intent = 'CONFIRM_OR_CANCEL' | 'EDIT' | 'CREATE' | 'QUERY' | 'KNOWLEDGE'

// parseIntent (lines 97-104) — add the KNOWLEDGE check BEFORE the CREATE fallthrough.
// CRITICAL: order matters only for substring collisions; 'KNOWLEDGE' shares no
// substring with the others, so any position before the final `return 'CREATE'` is safe.
function parseIntent(raw: string): Intent {
  const t = raw.toUpperCase()
  if (t.includes('CONFIRM_OR_CANCEL')) return 'CONFIRM_OR_CANCEL'
  if (t.includes('EDIT')) return 'EDIT'
  if (t.includes('QUERY')) return 'QUERY'
  if (t.includes('KNOWLEDGE')) return 'KNOWLEDGE'   // NEW — recognized set grows
  // CREATE is the safe default for anything else (new media / unrecognized).
  return 'CREATE'                                    // UNCHANGED — fallback stays CREATE
}
```
**Anti-pattern to avoid:** Do NOT change the final `return 'CREATE'` to `return 'KNOWLEDGE'` or any other label. The existing tests `unrecognized classifier output defaults to CREATE` and `classifier failure defaults to CREATE` are load-bearing — both must stay green.

### Pattern 2: Extend the `classify()` system prompt with KNOWLEDGE + disambiguation (WAKB-01)
**What:** Add a `KNOWLEDGE` bullet to the labelled list, add the QUERY-vs-KNOWLEDGE disambiguation rule, and add `KNOWLEDGE` to the closing "Reply with ONLY one of:" enumeration.
**Where:** `lib/whatsapp/intent-router.ts` lines 157-169 (the `systemPrompt` template literal inside `classify()`).
**Example (drop-in additions):**
```typescript
// After the existing QUERY bullet (line 167), add:
- KNOWLEDGE: a trade HOW-TO / process / best-practice question that does NOT depend on this
  company's own data ("how do I pre-treat a pet stain?", "what's the correct order for
  pressure-washing a deck?", "como faço a remoção de odor de pet em carpete?").

DISAMBIGUATION — QUERY vs KNOWLEDGE (decide carefully):
- QUERY = a question about THIS company's OWN records: its estimates, clients, projects,
  or its own price book ("what did I quote Maria?", "what's my price for window cleaning?").
- KNOWLEDGE = generic trade know-how / process that any contractor in this trade would ask,
  independent of this company's data.
- Ambiguous "how should I price X?": prefer QUERY if it references THIS company's price book
  / past jobs; prefer KNOWLEDGE if it's a generic best-practice question.

// And update the closing line (line 169) from:
//   Reply with ONLY one of: CONFIRM_OR_CANCEL, EDIT, CREATE, QUERY.
// to:
//   Reply with ONLY one of: CONFIRM_OR_CANCEL, EDIT, CREATE, QUERY, KNOWLEDGE.
```

### Pattern 3: `dispatchKnowledge` — mirror `dispatchQuery` (WAKB-02)
**What:** A new async function that reads the company's `industries[]`, builds the ctx, calls `answer`, and delivers via `sendOwnerReplyChunks`. Mirrors `dispatchQuery` (lines 212-282) but is SIMPLER — no ReAct agent, no tools, no profile block; just a read + one `answer()` call.
**Where:** Add after `dispatchQuery` (after line 282) and a `case 'KNOWLEDGE':` in the switch (after line 345).
**Example (verified-shape skeleton — the planner authors the final form):**
```typescript
async function dispatchKnowledge(input: RouteInput, normalizedText: string): Promise<void> {
  // Read the resolved company's industries[] (+ language) with the trusted
  // service client — same posture as dispatchQuery's company read. industries[]
  // is the retrieval scope; it is CALLER-SUPPLIED to answer(), NEVER from the LLM.
  const { data: company } = await input.supabase
    .from('companies')
    .select('industries, default_estimate_language')
    .eq('id', input.companyId)
    .maybeSingle()

  const industries =
    (company as { industries?: string[] | null } | null)?.industries ?? []
  const lang = (company as { default_estimate_language?: string | null } | null)
    ?.default_estimate_language
  const language =
    lang === 'pt' || lang === 'es' || lang === 'en' ? lang : undefined

  // answer() NEVER throws — returns a safe FALLBACK string on any failure.
  // companyId scopes the optional company overlay; industries[] scopes the
  // shared industry KB. retrieve() merges both inside the RPC.
  const text = await answer(normalizedText, {
    industries,
    companyId: input.companyId,
    language,
  })

  const fallback = "I couldn't find an answer to that."
  let chunks = splitReply(text)
  if (chunks.length === 0) chunks = [fallback]
  await sendOwnerReplyChunks(input, chunks)
}

// In the switch (after the QUERY case, line 345):
case 'KNOWLEDGE': {
  await dispatchKnowledge(input, normalized.text)
  return
}
```
**Why this is correct:** `answer`'s contract (verified in `lib/knowledge/answer.ts`) is `answer(question, { industries, companyId, k?, language? }) → Promise<string>`, never-throws. `dispatchQuery` already proves the `input.supabase` service-client `companies` read pattern (lines 217-221). `splitReply` + `sendOwnerReplyChunks` are already in the file and already used by `dispatchQuery` (lines 279-281).

### Pattern 4: Reading `companies.industries[]` (WAKB-02)
**What:** The retrieval scope. `industries text[] NOT NULL DEFAULT '{}'` (migration `20260620000001`). A company with no trades set has `industries = []` → `answer` retrieves only the company overlay (still valid, never throws). The singular `companies.industry` column is kept in sync as `industries[0]` but the array is the correct multi-trade scope to pass.
**Note:** `input.companyId` is the **trusted, upstream-resolved** tenant (set in `whatsapp-process.ts` `whatsAppIntentRouterJob` from `owner_phone → company`; the LLM never supplies it). Passing `industries` and `companyId` from this server-side read honors the multi-tenant invariant documented in `lib/knowledge/provider.ts` ("CALLER-SUPPLIED, NEVER from LLM output").

### Anti-Patterns to Avoid
- **Importing `lib/knowledge/` INTO a channel and a channel INTO `lib/knowledge/`** — the dispatch importing `@/lib/knowledge/answer` is correct (consumer → module). NEVER add a `lib/whatsapp` import to any `lib/knowledge/*.ts` file; the ENGINE-01 neutrality gate will fail.
- **Re-implementing chunking / sending.** `splitReply` + `sendOwnerReplyChunks` already exist in the file. Reuse them verbatim (as `dispatchQuery` does).
- **Adding a try/catch around `answer()` "to be safe."** `answer()` already never-throws. A wrapper is redundant; the only guard needed is the empty-string → `fallback` check (mirrors `dispatchQuery`).
- **Changing the CREATE fallback.** See Pattern 1 anti-pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RAG retrieval + prompt + chat | A bespoke knowledge lookup in the dispatch | `answer(question, ctx)` from `@/lib/knowledge/answer` | Already built, hardened (KSEC-01 `<knowledge>` tag), never-throws, channel-neutral |
| Splitting a long answer into WhatsApp bubbles | A custom splitter | `splitReply` (already imported) | Handles paragraph + sentence + hard-slice packing, ≤1000 chars |
| Sending + logging owner reply chunks | New send loop | `sendOwnerReplyChunks` (local, lines 133-147) | Ordered sequential send + fire-and-forget logging already done |
| Resolving the tenant | Re-deriving company from phone | `input.companyId` (already trusted, resolved upstream) | The multi-tenant isolation control; LLM never supplies it |
| Embedding / pgvector / merge | Anything | Inside `answer`→`retrieve`→`match_knowledge_entries` RPC | All in `lib/knowledge/`, do not touch |

**Key insight:** This phase is a ~30-line consumer. The temptation is to over-build; the discipline is to mirror `dispatchQuery` and let the already-shipped `lib/knowledge/` module do all the work.

## Common Pitfalls

### Pitfall 1: Breaking the safe CREATE default
**What goes wrong:** Refactoring `parseIntent` so unrecognized output no longer falls to `CREATE`, or accidentally moving the `KNOWLEDGE` check after the fallback.
**Why it happens:** Editing the fallthrough chain carelessly.
**How to avoid:** Add `if (t.includes('KNOWLEDGE')) return 'KNOWLEDGE'` ABOVE the unconditional `return 'CREATE'`. Keep the two existing safe-default tests green (`tests/unit/whatsapp/intent-router.test.ts` lines 221-257).
**Warning signs:** The "unrecognized classifier output defaults to CREATE" or "classifier failure defaults to CREATE" tests turn red.

### Pitfall 2: Polluting `lib/knowledge/` neutrality
**What goes wrong:** Adding a WhatsApp-specific import or helper into `lib/knowledge/answer.ts` (e.g. to format chunks).
**Why it happens:** Wanting to "finish the delivery" inside the module.
**How to avoid:** ALL channel formatting (`splitReply`, `sendOwnerReplyChunks`) stays in `intent-router.ts`. `answer` returns a plain string; the channel adapter shapes it.
**Warning signs:** The ENGINE-01 static neutrality grep gate (scans `lib/knowledge/*.ts` for channel tokens) fails.

### Pitfall 3: QUERY-vs-KNOWLEDGE misclassification on ambiguous pricing questions
**What goes wrong:** "How should I price a 2000 sqft carpet job?" routes to QUERY (company records) when the owner wanted generic best-practice, or vice-versa.
**Why it happens:** The two intents genuinely overlap on pricing.
**How to avoid:** Encode the seed's explicit tie-breaker in the prompt (Pattern 2): price-book/own-data reference → QUERY; generic best-practice → KNOWLEDGE. This is best-effort by design; a wrong route still returns a useful answer (QUERY agent answers from data, KNOWLEDGE answers from KB), so misclassification degrades gracefully rather than failing.
**Warning signs:** Eval/manual testing shows pricing questions consistently going the wrong way — tune the prompt wording, not the architecture.

### Pitfall 4: Empty `industries[]` treated as an error
**What goes wrong:** Guarding `if (industries.length === 0) return earlyError`.
**Why it happens:** Assuming a company always has trades.
**How to avoid:** `[]` is valid — `answer` retrieves only the company overlay (or returns the graceful "no reference material found" line and still answers conversationally). Pass `industries` through unconditionally. `industries text[] NOT NULL DEFAULT '{}'` guarantees it's at least an empty array, never null — but `?? []` defensively anyway.

## Code Examples

### Verified `answer` contract (the function this phase calls)
```typescript
// Source: lib/knowledge/answer.ts (Phase 118, verified present)
export type AnswerCtx = RetrieveCtx & { language?: 'en' | 'pt' | 'es' }
// RetrieveCtx = { industries: string[]; companyId: string | null; k?: number }
export async function answer(question: string, ctx: AnswerCtx): Promise<string>
// NEVER throws. Returns FALLBACK = "I couldn't find an answer in the knowledge
// base right now." on retrieve miss, chat !ok, error body, empty content, or any
// exception. ctx.language defaults to 'en' inside buildKnowledgePrompt.
```

### Verified `dispatchQuery` company read (the pattern to mirror for industries[])
```typescript
// Source: lib/whatsapp/intent-router.ts lines 217-221
const { data: company } = await input.supabase
  .from('companies')
  .select('name, owner_name, phone, email, website')
  .eq('id', input.companyId)
  .maybeSingle()
// dispatchKnowledge does the same shape with .select('industries, default_estimate_language')
```

### Verified delivery path (already in the file, reused as-is)
```typescript
// Source: lib/whatsapp/intent-router.ts lines 279-281 (dispatchQuery tail)
let chunks = splitReply(answer ?? fallback)
if (chunks.length === 0) chunks = [fallback]
await sendOwnerReplyChunks(input, chunks)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| n8n treats the KB as a WhatsApp agent tool | Xtimator's KB is a channel-neutral domain module; WhatsApp is one of three consumers | v4.8 (Phases 117-121) | This phase wires the FIRST consumer; web-chat + MCP reuse the same `answer` later |
| 4-intent classifier (CONFIRM/EDIT/CREATE/QUERY) | 5-intent (adds KNOWLEDGE) | This phase | Owner trade how-to questions get first-class routing |

**Deprecated/outdated:** Nothing. All dependencies are current and shipped within the same milestone (Phase 118, completed 2026-06-24).

## Open Questions

1. **Should `language` be passed in v1?**
   - What we know: `companies.default_estimate_language` exists (nullable; null = no preference). `answer`'s `AnswerCtx.language` is optional and defaults to `'en'`. The existing QUERY agent steers language purely via the prompt ("Reply in the SAME language the user writes in") without an explicit arg.
   - What's unclear: Whether the RAG prompt in `buildKnowledgePrompt` honors `language` strongly enough to override the owner's actual message language, and whether `default_estimate_language` (an estimate-document default) is the right signal for a conversational reply.
   - Recommendation: Pass `language` from `default_estimate_language` (cheap, in the same read), but treat it as a hint. This is Claude's-discretion (Pattern 3 includes it). Acceptable to defer.

2. **Does the empty-KB case need different copy?**
   - What we know: `answer` returns its own FALLBACK string on a KB miss; `dispatchKnowledge`'s `fallback` only triggers if `answer` returns an empty string (it never does — FALLBACK is non-empty).
   - What's unclear: Whether the owner-facing FALLBACK wording is good enough or should be WhatsApp-localized.
   - Recommendation: Use `answer`'s FALLBACK as-is for v1 (it's already a clean conversational sentence). The local `fallback` is just defense-in-depth.

## Environment Availability

Step 2.6: SKIPPED for external probing — this phase adds no new external dependency. The one runtime dependency (`answer` → OpenRouter chat + Supabase `match_knowledge_entries` RPC + the populated `knowledge_entries` table) was wired and verified in Phases 117-118. The only execution precondition is **a populated industry KB** (seeded via Phase 119 super-admin curation) so retrieval returns passages — but `answer` never-throws on an empty KB, so an unpopulated KB degrades to the FALLBACK string rather than blocking execution.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| `lib/knowledge/answer` | WAKB-02 dispatch | ✓ | Phase 118 complete, `lib/knowledge/answer.ts` present |
| `companies.industries[]` | retrieval scope | ✓ | Migration `20260620000001`, NOT NULL DEFAULT `'{}'` |
| `knowledge_entries` table + `match_knowledge_entries` RPC | `retrieve` | ✓ | Phase 117 migration (authored; deployed via CI→GHCR→Coolify) |
| Populated industry KB rows | meaningful answers | ⚠ data | Seeded via Phase 119; absent → graceful FALLBACK, not a hard block |
| OpenRouter integration key (`getORKey`) | `answer` chat | ✓ | Existing platform key; no new secret |

## Validation Architecture

`nyquist_validation` is `true` in `.planning/config.json` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in-repo; ~312 test files green at last full run) |
| Config file | `vitest.config.*` (repo root) |
| Quick run command | `npx vitest run tests/unit/whatsapp/intent-router.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WAKB-01 | `KNOWLEDGE` label → `dispatchKnowledge` (not QUERY/CREATE) | unit | `npx vitest run tests/unit/whatsapp/intent-router.test.ts` | ✅ extend |
| WAKB-01 | unrecognized output STILL defaults to CREATE (regression) | unit | same | ✅ exists (lines 221-235) — must stay green |
| WAKB-01 | classifier failure STILL defaults to CREATE (regression) | unit | same | ✅ exists (lines 237-257) — must stay green |
| WAKB-02 | KNOWLEDGE message reads `industries[]`, calls `answer`, sends via `sendWhatsAppMessage` | unit | same | ✅ extend (mock `@/lib/knowledge/answer`) |
| WAKB-02 | `answer` receives `{ industries, companyId }` from the trusted company read (not from LLM) | unit | same | ✅ extend (assert the ctx arg) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/whatsapp/intent-router.test.ts`
- **Per wave merge / phase gate:** `npx vitest run` (full suite green before `/gsd:verify-work`). NOTE: the known parallel-only `mcp-route-contract.test.ts` GET-405 flake is pre-existing and out-of-scope — confirm it passes 8/8 in isolation if it surfaces.

### Wave 0 Gaps
- [ ] Extend `tests/unit/whatsapp/intent-router.test.ts` — add a KNOWLEDGE routing test: mock `@/lib/knowledge/answer` (`answer` → a fixed string), classifier returns `KNOWLEDGE`, assert `answer` called with `{ industries, companyId }` and `sendWhatsAppMessage` called with the owner phone. The supabase mock must return `industries` from the `companies` read (the existing `makeSupabase()` chainable mock's `maybeSingle` currently returns `{ data: null }` — add an industries fixture).
- [ ] Verify the two existing safe-default tests (CREATE fallback) remain green unchanged.

*(Framework install: none — Vitest already present.)*

## Sources

### Primary (HIGH confidence) — direct codebase reads
- `lib/whatsapp/intent-router.ts` — full file: `Intent` union (47), `parseIntent` (97-104), `classify` prompt (157-169), `dispatchQuery` (212-282), `sendOwnerReplyChunks` (133-147), switch (318-351)
- `lib/knowledge/answer.ts` — `answer` signature + `AnswerCtx` + never-throws FALLBACK contract
- `lib/knowledge/provider.ts` — `RetrieveCtx` shape + multi-tenant CALLER-SUPPLIED invariant
- `lib/knowledge/retrieve.ts` — confirms `industries[]`/`companyId` forwarded to `match_knowledge_entries` RPC, never-throws
- `lib/whatsapp/query-tools.ts` — the QUERY company-scoped pattern (contrast for the disambiguation)
- `lib/whatsapp/split-reply.ts` — `splitReply` contract
- `lib/inngest/functions/whatsapp-process.ts` — `whatsAppIntentRouterJob` proves `companyId` is resolved upstream + `input.supabase = requireServiceClient()`
- `tests/unit/whatsapp/intent-router.test.ts` — existing test patterns + the two safe-default regression tests to preserve
- `supabase/migrations/20260620000001_companies_industries_array.sql` — `industries text[] NOT NULL DEFAULT '{}'`
- `lib/schemas/knowledge.ts` — confirms company overlay carries `industry_id: null`
- `.planning/REQUIREMENTS.md` + `.planning/seeds/SEED-033-*.md` + `.planning/STATE.md` — milestone locked decisions + WAKB-01/02 + the QUERY-vs-KNOWLEDGE rule + Phase-118 completion
- `.planning/phases/118-channel-neutral-knowledge-module/118-03-SUMMARY.md` — `answer` consumer-readiness note for Phase 121

### Secondary (MEDIUM confidence)
- None needed — every claim is verified by a direct file read.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; every symbol verified present in source.
- Architecture: HIGH — `dispatchKnowledge` is a 1:1 mirror of the verified `dispatchQuery`; insertion points are exact line numbers.
- Pitfalls: HIGH — derived from the actual safe-default tests and the ENGINE-01 neutrality gate, both observed in the codebase.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable — all dependencies shipped in the same milestone; no fast-moving external surface)
