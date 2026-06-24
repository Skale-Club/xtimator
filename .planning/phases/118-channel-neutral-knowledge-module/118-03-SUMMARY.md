---
phase: 118-channel-neutral-knowledge-module
plan: 03
subsystem: ai
tags: [rag, knowledge-base, prompt-injection-hardening, sanitizeField, openrouter, never-throws, channel-neutral, vitest, tdd, ksec-01]

# Dependency graph
requires:
  - phase: 118-channel-neutral-knowledge-module
    plan: 01
    provides: "KnowledgeProvider port + Passage/RetrieveCtx types"
  - phase: 118-channel-neutral-knowledge-module
    plan: 02
    provides: "retrieve(question, ctx) -> Passage[] never-throws RAG read boundary"
provides:
  - "buildKnowledgePrompt(passages, question, language?) -> { system, user } (KSEC-01): the SINGLE hardened boundary — each passage title/body via sanitizeField, wrapped in <knowledge>; question sanitizeField-escaped into user; forward-compat language arg"
  - "answer(question, ctx) -> string (KMOD-03): retrieve top-k → buildKnowledgePrompt → OpenRouter chat → short conversational answer; NEVER-THROWS (safe FALLBACK string on any failure); ctx.language forwarded"
  - "lib/ai/prompt-builder.ts ## Security block enumerates <knowledge> alongside <transcript>/<photo_description>/<description>/<search_result>/<instruction>"
affects: [121 whatsapp-knowledge-intent (the answer consumer), future web-chat/MCP consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single hardened prompt boundary (KSEC-01): curated KB content is NOT trusted as LLM context — passages enter a prompt ONLY through buildKnowledgePrompt (sanitizeField + <knowledge> tag), mirroring the Phase-107 <search_result> precedent in search-prompt.ts; the tag is enumerated in buildSystemPrompt's ## Security block"
    - "Never-throws RAG composer: answer wraps retrieve (already never-throws) + the OpenRouter chat fetch in one try/catch → safe FALLBACK string on !res.ok / error body / empty content / any exception (console.warn, never propagate) so a channel consumer never crashes"
    - "Channel-neutral grows: the ENGINE-01 static neutrality gate now scans prompt.ts + answer.ts and finds zero channel tokens"

key-files:
  created:
    - lib/knowledge/prompt.ts
    - lib/knowledge/answer.ts
    - tests/unit/knowledge/answer.test.ts
  modified:
    - lib/ai/prompt-builder.ts
    - tests/unit/knowledge/answer-hardening.test.ts

key-decisions:
  - "buildKnowledgePrompt signature follows the plan's authoritative <action>/<behavior> contract — (passages, question, language?) -> { system, user } — not the Wave-0 stub's contradictory (question, passages) -> string shape; the plan explicitly authorized extending the stub, so it was rewritten to the real contract (Tests 1-4)"
  - "Skipped the OPTIONAL recordAICost cost-capture in answer: the plan marked it additive and said skip if it complicates the never-throw guarantee — kept answer.ts minimal to preserve the clean single-try never-throw path"
  - "Single feat commit per task (not split RED/GREEN): the answer-hardening Wave-0 stub already shipped in Plan 01; Task 1 rewrote + landed source together; Task 2's RED answer.test + GREEN source landed as one feat (mirrors Plan 02)"

patterns-established:
  - "Every retrieved passage enters the prompt ONLY through buildKnowledgePrompt — the SINGLE KSEC-01 boundary, static-tested (the <script> -> &lt;script&gt; inside <knowledge> assertion is the load-bearing proof it routed through sanitizeField)"

requirements-completed: [KMOD-03, KSEC-01]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 118 Plan 03: Channel-Neutral lib/knowledge/ (answer RAG + KSEC-01 hardening) Summary

**The KSEC-01 single hardened prompt boundary `buildKnowledgePrompt` (each passage title/body via `sanitizeField`, wrapped in a NEW `<knowledge>` tag enumerated in the prompt-builder `## Security` block — mirroring the Phase-107 `<search_result>` precedent) plus the KMOD-03 never-throws RAG composer `answer(question, ctx)` (retrieve top-k → hardened prompt → OpenRouter chat → short conversational string; safe FALLBACK on any failure; optional `language` forwarded) — turning the Wave-0 `answer-hardening.test.ts` RED gate GREEN and completing the channel-neutral `lib/knowledge/` module.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-24T21:45:07Z
- **Completed:** 2026-06-24T21:49:00Z
- **Tasks:** 2
- **Files modified:** 2 created (source) + 1 created (test), 1 source modified, 1 test extended

## Accomplishments
- `buildKnowledgePrompt(passages, question, language?)` (KSEC-01): the SINGLE place a passage enters a prompt. Each passage `title`/`body` is run through the EXISTING `sanitizeField` (escape `&<>` + 50k cap) and wrapped in a `<knowledge>` tag; the `question` is `sanitizeField`-escaped into the returned `user` message. Returns `{ system, user }`. The `language` arg ('en'|'pt'|'es', default 'en') is forward-compat with Phase 121. Imports `sanitizeField` from `@/lib/ai/prompt-builder` — NO parallel escaper (mirror `search-prompt.ts`).
- `lib/ai/prompt-builder.ts` `## Security` block extended: the single enumerated sentence now names `knowledge-base reference material (inside <knowledge> tags)` alongside `<transcript>`/`<photo_description>`/`<description>`/`<search_result>`/`<instruction>` — exactly as Phase 107 added `<search_result>`. No other behavior of `buildSystemPrompt` changed; estimate generation stays byte-identical except for the added tag name (verified — `tests/unit/ai` 74/74 green).
- `answer(question, ctx)` (KMOD-03): retrieves top-k → composes the hardened prompt via `buildKnowledgePrompt` → POSTs `/chat/completions` (`OR_DEFAULTS.chat`, mirroring `translateTextsOR`) → returns the trimmed answer string. NEVER throws — a safe `FALLBACK` string on `!res.ok`, an error body, empty content, or any exception (`console.warn`, never propagate). `ctx.language` forwarded into the prompt. Channel-neutral (no `lib/whatsapp`).
- ENGINE-01 neutrality gate stayed GREEN: the static grep now scans `prompt.ts` + `answer.ts` and finds zero channel tokens. **The lib/knowledge/ module is now complete (provider/embed/retrieve/fixture/prompt/answer) and fully channel-neutral.**

## Task Commits

Each task committed atomically (normal hooked commits, in-place, no --no-verify — gitleaks ran, no leaks):

1. **Task 1: buildKnowledgePrompt KSEC-01 boundary + <knowledge> in Security block** - `c73ca01a` (feat)
2. **Task 2: answer(question, ctx) — retrieve + hardened RAG prompt + OpenRouter chat, never-throws (KMOD-03)** - `94ab2a86` (feat)

## Files Created/Modified
- `lib/knowledge/prompt.ts` (created) - KSEC-01 single hardened boundary: sanitizeField + `<knowledge>` wrapper, question escaped into user, forward-compat language
- `lib/knowledge/answer.ts` (created) - KMOD-03 never-throws RAG composer: retrieve → buildKnowledgePrompt → OpenRouter chat → short string
- `tests/unit/knowledge/answer.test.ts` (created) - 6 answer behavior tests (success, `<knowledge>` in body, !ok fallback, reject fallback, empty-retrieve, pt language)
- `lib/ai/prompt-builder.ts` (modified) - `## Security` block enumerates `<knowledge>`
- `tests/unit/knowledge/answer-hardening.test.ts` (extended) - the Wave-0 stub rewritten to the plan's authoritative contract (Tests 1-4: `<script>`→`&lt;script&gt;` inside `<knowledge>`, question escaped, static Security-block + static import asserts)

## Decisions Made
- The Wave-0 `answer-hardening.test.ts` stub used a contradictory signature/return shape (`buildKnowledgePrompt(question, passages) -> string`) versus the plan's authoritative `<action>` + `<behavior>` (`buildKnowledgePrompt(passages, question, language?) -> { system, user }`). The plan explicitly instructs to "confirm/extend" the stub, so it was rewritten to the real contract — the load-bearing `<script>` → `&lt;script&gt;` proof preserved.
- Skipped the OPTIONAL `recordAICost` cost-capture in `answer` — the plan marked it additive and said skip if it complicates the never-throw guarantee. Kept `answer.ts` to a single clean try/catch.
- One `feat` commit per task rather than split RED/GREEN: the answer-hardening Wave-0 stub already shipped in Plan 01 (Task 1 rewrote + landed source as one GREEN step); Task 2's new RED `answer.test.ts` + GREEN source landed together (mirrors Plan 02).

## Deviations from Plan
None - plan executed exactly as written. (The Wave-0 `answer-hardening.test.ts` stub was rewritten to the plan's authoritative `buildKnowledgePrompt(passages, question, language?) -> { system, user }` contract, which the plan's Task 1 `<action>`/`<behavior>` explicitly define and the plan authorizes via "confirm/extend `answer-hardening.test.ts`" — within the plan's stated behavior, not a structural change.)

## Issues Encountered
None blocking. The plan referenced an `openrouter-client.ts` `translateTextsOR` chat path to mirror; confirmed the real exports (`getORKey`, `OPENROUTER_BASE`, `OR_DEFAULTS`, `translateTextsOR`) live in `lib/ai/openrouter-client.ts` and used them verbatim.

## User Setup Required
None - no external service configuration required. `answer` reuses the existing platform OpenRouter integration key (`getORKey`); no new env var, no migration, no secret.

## Next Phase Readiness
- Phase 121 (WhatsApp KNOWLEDGE intent) can now dispatch a knowledge message to `answer(question, { industries, companyId, language })` — the never-throws RAG composer — and deliver the returned string via the existing chunked owner reply. The whole `lib/knowledge/` module (embed/retrieve/answer + the deterministic fixture) is complete, channel-neutral, and MCP-ready; Phase 121 is the thin consumer that proves it end-to-end.

## Known Stubs
None. `buildKnowledgePrompt` emits `(no reference material found)` when `passages` is empty — that is an intentional graceful-degradation reference line (so the model still answers conversationally on a KB miss), not an unwired stub.

## Self-Check: PASSED

- `lib/knowledge/prompt.ts` — FOUND
- `lib/knowledge/answer.ts` — FOUND
- `tests/unit/knowledge/answer.test.ts` — FOUND
- Commit `c73ca01a` — FOUND
- Commit `94ab2a86` — FOUND

---
*Phase: 118-channel-neutral-knowledge-module*
*Completed: 2026-06-24*
