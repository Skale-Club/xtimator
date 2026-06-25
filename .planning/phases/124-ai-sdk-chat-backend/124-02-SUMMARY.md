---
phase: 124-ai-sdk-chat-backend
plan: 02
subsystem: api
tags: [vercel-ai-sdk, streaming, tool-calling, chat, api-route, credit-reuse, persistence]

# Dependency graph
requires:
  - phase: 124-ai-sdk-chat-backend
    plan: 01
    provides: "lib/chat/provider.ts (resolveChatModel) + lib/chat/tools.ts (buildChatTools) + lib/chat/system-prompt.ts (CHAT_SYSTEM_PROMPT)"
  - phase: 123-chat-persistence-schema-history
    provides: "lib/queries/chat.ts persistence helpers (createConversation / appendMessage)"
provides:
  - "app/api/chat/route.ts — the POST /api/chat backend: owner-auth → resolve active company → streamText(neutral tools) → toUIMessageStreamResponse, persisting the new tail via appendMessage in onFinish"
  - "tests/unit/chat/credit-reuse.test.ts — static regression locking CHATMETER-01 (no debit in the route)"
affects: [125 chat UI (consumes this streaming endpoint), 126 access gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "streamText({ model, system, messages: await convertToModelMessages(ui), tools, stopWhen: stepCountIs(5) }).toUIMessageStreamResponse({ originalMessages, onFinish })"
    - "companyId is the SERVER-resolved active tenant (getActiveCompanyId) — never read from the request body / the LLM (T-lrf-01)"
    - "Persist only the NEW tail (full.slice(messages.length)) in onFinish, never mid-stream (Pitfall 3); best-effort try/catch so persistence never breaks the streamed response"
    - "Default Node runtime (no edge opt-in) — the neutral tools use node:crypto + Inngest + service client (Pitfall 6)"
    - "Credit invariant by ABSENCE: a static source assertion proves the route calls no debit helper (CHATMETER-01 / Pitfall 4)"

key-files:
  created:
    - app/api/chat/route.ts
    - tests/unit/chat/route.test.ts
    - tests/unit/chat/credit-reuse.test.ts
  modified: []

key-decisions:
  - "Mocked @/lib/chat/provider to inject a MockLanguageModelV3 (ai/test) + simulateReadableStream (ai) — the route is exercised end-to-end with no live OpenRouter key, matching the repo mock style over a public test-only param"
  - "Passed the SERVICE client to buildChatTools (the neutral data-reads expect a service-role client), reused for the industries/language read — not the RLS-bound request client"
  - "Awaited convertToModelMessages (it resolves a Promise in ai@6.0.209) before streamText — the AI SDK v6 signature for messages is ModelMessage[], not a Promise"
  - "Reworded the route's CHATMETER-01 doc comment so it contains none of the literal debit identifiers — keeps the static credit-reuse source check honest"

patterns-established:
  - "Route unit test: drain the response body (await new Response(res.body).text()) so onFinish settles WITHIN the test — otherwise a late onFinish bleeds mock history into the next test"
  - "Static-source invariant test: readFileSync(route) + includes(token)===false for each forbidden identifier (no model, no network)"

requirements-completed: [CHATBE-02, CHATMETER-01]

# Metrics
duration: 10min
completed: 2026-06-25
---

# Phase 124 Plan 02: AI SDK Chat Backend Route Summary

**The POST /api/chat backend: authenticate the owner, resolve the trusted active company + the owner's industries/language, stream a tool-calling turn via `streamText` with the Plan-01 neutral tools, and persist the new assistant/tool tail through the Phase-123 `appendMessage` in `onFinish` — adding NO credit debit (locked by a static regression test).**

## Performance
- **Duration:** 10 min
- **Started:** 2026-06-25T03:07:05Z
- **Completed:** 2026-06-25T03:17:14Z
- **Tasks:** 2
- **Files modified:** 3 (3 created, 0 modified)

## Accomplishments
- `app/api/chat/route.ts` (CHATBE-02): the thin streaming endpoint that makes the chat capable.
  1. Authenticates the owner via `supabase.auth.getClaims()` → `401` when absent.
  2. Resolves the ACTIVE company via `getActiveCompanyId()` → `400` when absent. `companyId` is the trusted server-resolved tenant, never from the body / LLM.
  3. Reads the owner's `industries[]` + reply `language` from the `companies` row with the SERVICE client (mirrors `intent-router`'s company read).
  4. `streamText({ model: resolveChatModel(companyId), system: CHAT_SYSTEM_PROMPT, messages: await convertToModelMessages(messages), tools: buildChatTools({ companyId, supabase: svc, industries, language }), stopWhen: stepCountIs(5) })` → `result.toUIMessageStreamResponse({ originalMessages, onFinish })`.
  5. `onFinish` persists only the NEW tail (`full.slice(messages.length)`) via `appendMessage`, creating the conversation first when `conversationId` is absent — wrapped in try/catch + `console.warn` so a persistence hiccup never breaks the already-streamed response.
  6. Runs on the DEFAULT Node runtime (no `export const runtime = 'edge'`) — the neutral tools need `node:crypto` + Inngest + the service client.
- `tests/unit/chat/credit-reuse.test.ts` (CHATMETER-01): a static-source regression that reads `app/api/chat/route.ts` and asserts it contains NONE of `recordCreditDebit` / `grantCredits` / `consumeCredits`, plus no debit import from `@/lib/billing/credit-ledger`. The no-double-debit invariant is now locked by ABSENCE: generation debits inside the Inngest job's `record-credit-debit` step (`lib/inngest/functions/generate-estimate.ts` L189–207); the conversation turn is absorbed per v4.7.

## Task Commits
Each task committed atomically (TDD test+impl folded per task; all hooked IN-PLACE, gitleaks ran on each, no `--no-verify`):

1. **Task 1: app/api/chat/route.ts — owner-auth → streamText(tools) → persist in onFinish (CHATBE-02)** — `8ce21df4` (feat, TDD RED→GREEN)
2. **Task 2: Static credit-reuse assertion — the route adds NO debit (CHATMETER-01)** — `9c50154e` (test)

**Plan metadata:** _(this SUMMARY + STATE + ROADMAP commit)_

## Files Created/Modified
- `app/api/chat/route.ts` — `export async function POST(req)`: owner-auth → active company → service-client company read → `streamText(neutral tools)` → `toUIMessageStreamResponse` persisting the tail in `onFinish`. No edge runtime, no credit mutation.
- `tests/unit/chat/route.test.ts` — 6 cases: 401 (no claims; tools/model never reached), 4xx (no active company), tools built with the trusted `companyId` + owner `industries`/`language`, authed POST streams (200 + body, `resolveChatModel('company-SECRET')`), `appendMessage` persists the tail when `conversationId` present (no `createConversation`), `createConversation('user-1')` first then persist when absent. Driven by `MockLanguageModelV3` + `simulateReadableStream`.
- `tests/unit/chat/credit-reuse.test.ts` — 4 cases: the 3 forbidden debit-token substring checks + the no-debit-import guard.

## Decisions Made
- **`MockLanguageModelV3` via a `@/lib/chat/provider` module mock** over a public test-only query param — matches the repo's mock style and keeps the route surface clean (Plan-01 also added the `modelOverride` seam, but mocking the resolver is simpler and tests the real route path).
- **Service client passed to `buildChatTools`** — the neutral data-read fns expect a client that can read company rows; the route resolves `requireServiceClient()` once and reuses it for both the industries/language read and the tool context (mirrors `lib/queries/chat.ts` + `query-company-data.ts` posture). The RLS-bound request client is used only for auth.
- **Reworded the route's CHATMETER-01 comment** so the doc no longer contains the literal `recordCreditDebit`/`grantCredits`/`consumeCredits` identifiers — otherwise the static source assertion (which reads the whole file, comments included) would trip on the explanatory comment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `await convertToModelMessages(messages)` — it resolves a Promise in ai@6.0.209**
- **Found during:** Task 1 (`npx tsc --noEmit`)
- **Issue:** The plan's interface snippet wrote `messages: convertToModelMessages(messages)` inline. In the installed `ai@6.0.209`, `convertToModelMessages` returns a `Promise<ModelMessage[]>` (verified at runtime), while `streamText`'s `messages` expects `ModelMessage[]` — a type error (`Type 'Promise<ModelMessage[]>' is missing … from type 'ModelMessage[]'`).
- **Fix:** `const modelMessages = await convertToModelMessages(messages)` then pass `messages: modelMessages`. Behavior identical; the conversion now completes before `streamText`.
- **Files modified:** app/api/chat/route.ts
- **Verification:** `npx tsc --noEmit` clean on the route; route.test.ts 6/6 green.
- **Committed in:** `8ce21df4` (Task 1 commit)

**2. [Rule 3 - Blocking] Reworded the CHATMETER-01 doc comment so the static test does not trip on it**
- **Found during:** Task 2 (credit-reuse.test.ts RED)
- **Issue:** The static assertion reads the FULL route source (comments included). The route's CHATMETER-01 explanatory comment originally spelled out `recordCreditDebit / grantCredits / consumeCredits`, so `source.includes(token)` was true for all three → 3 failing assertions even though the route has zero debit CALLS.
- **Fix:** Reworded the comment to describe the helpers ("the credit-ledger debit/grant/consume helpers") without the literal identifiers. The invariant is unchanged; the static check now passes for genuine absence.
- **Files modified:** app/api/chat/route.ts
- **Verification:** credit-reuse.test.ts 4/4 green; route.test.ts still 6/6.
- **Committed in:** `9c50154e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both blocking: an SDK Promise-return adaptation + a comment/test-honesty correction). No scope creep; everything else executed exactly as written.

## Issues Encountered
- **Test mock shape:** `supabase.auth.getClaims()` resolves `{ data: { claims }, error }` (the route destructures `.data` then `.claims`). The initial test mock returned `{ claims }` without the `data` wrapper, causing every authed test to 401. Fixed the mock to `{ data: { claims: { sub } } }` (matches `generate-estimate/route.ts` precedent).
- **onFinish history bleed:** because `onFinish` fires after the response is returned, tests that did not drain the body let a late `onFinish` call `appendMessage`/`createConversation` during the NEXT test, inflating mock-call counts. Fixed by draining the body (`await new Response(res.body).text()`) in every authed test so `onFinish` settles within its own test.

## Verification Results
- `npx vitest run tests/unit/chat` → **6 files / 44 passed** (provider 7 + tools 11 + route 6 + credit-reuse 4 + the pre-existing chat-queries/migration suites).
- FULL `npx vitest run` → **325 files passed | 3 skipped (328) | 2279 passed, 2 skipped, 33 todo**. Baseline 124-01 was 322 files / 2268 passed; +3 files / +11 tests, no regressions. The known `mcp-route-contract.test.ts` parallel flake passed this run too.
- `npx tsc --noEmit` → no NEW errors. The 6 residual errors are all pre-existing test-file issues (es2018 regex flags in ai/estimate/inngest tests + 2 test-mock type mismatches), untouched by this plan — same residuals documented in 124-01-SUMMARY.
- grep `app/api/chat/route.ts`: contains `resolveChatModel`, `buildChatTools`, `streamText`, `toUIMessageStreamResponse`, `appendMessage`; contains NO `recordCreditDebit`/`grantCredits`; contains NO `runtime = 'edge'`.
- No migration, no env var, no secret (placeholder ids only in tests).

## Known Stubs
None — the route is fully wired: owner auth, active-company resolution, the service-client company read, the Plan-01 model/tools/prompt, the streamed UI-message response, and onFinish persistence are all real. The chat UI that consumes this streaming endpoint is Phase 125's scope (out of scope here by design).

## User Setup Required
None — no external service configuration. The OpenRouter key path already exists via `getIntegrationKey('openrouter')` (wired in 124-01); this route consumes it at runtime through `resolveChatModel`.

## Next Phase Readiness
- The chat BACKEND is complete and self-contained: `POST /api/chat` streams a tool-calling turn and persists history through the Phase-123 helpers — testable without the Phase-125 UI. Phase 125 wires `useChat`/the AI SDK UI to this endpoint and reloads history via the Phase-123 read helpers (`listConversations` / `getConversationWithMessages`).
- CHATMETER-01 is locked by a regression test, so a future contributor cannot silently introduce a double-debit.
- Phase 126 (access gate) layers entitlement on top of this route without touching the streaming/persistence core.

---
*Phase: 124-ai-sdk-chat-backend*
*Completed: 2026-06-25*

## Self-Check: PASSED

All 3 created files + the SUMMARY exist on disk; both task commits (`8ce21df4`, `9c50154e`) exist in git history.
