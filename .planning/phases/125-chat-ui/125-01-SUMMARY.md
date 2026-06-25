---
phase: 125-chat-ui
plan: 01
subsystem: ui
tags: [ai-sdk, useChat, chat, vercel-ai, rsc, vitest, shadcn, i18n]

# Dependency graph
requires:
  - phase: 125-00
    provides: "@ai-sdk/react@3.0.211 (bundles ai@6.0.209) + toUIMessages history-seed mapper + RED component scaffolds"
  - phase: 124-chat-backend
    provides: "/api/chat streamText tool-calling route (full messages-array contract) — FROZEN, read-only"
  - phase: 123-chat-persistence
    provides: "lib/queries/chat.ts listConversations / getConversationWithMessages / createConversation"
provides:
  - "app/(app)/chat/[[...id]]/page.tsx — RSC optional-catch-all: loads conversations + (id) history → ChatWorkspace (CHATUI-02)"
  - "components/chat/chat-thread.tsx — v6 @ai-sdk/react useChat surface (DefaultChatTransport, full-array send, own composer) (CHATUI-01)"
  - "components/chat/chat-workspace.tsx — two-pane shell (ChatSidebar + ChatThread, key-reset on switch)"
  - "components/chat/chat-sidebar.tsx — conversation list (newest-first links) + New chat (CHATUI-02)"
  - "components/chat/chat-message.tsx — message.parts switch (text bubble + tool delegate) (CHATUI-01)"
  - "components/chat/chat-tool-part.tsx — per-tool progress chip / result + ESTIMATE_CARD_SEAM (CHATUI-01)"
  - "lib/actions/chat.ts createChatConversation — owner-scoped new-conversation pre-create"
  - "Chat nav entry (/chat, MessageSquare) — auto-renders in sidebar + bottom-nav"
  - "CHAT_COMPOSER_SEAM (chat-thread) + ESTIMATE_CARD_SEAM (chat-tool-part) — marked for Plan 02"
affects: [125-02-PLAN, chat-ui, useChat, multimodal-composer, estimate-card]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "v6 useChat: own a useState for composer text + sendMessage({text}); NO input/handleSubmit/handleInputChange; full-array default send (no last-only override)"
    - "New-conversation pre-create (Pitfall 5): createChatConversation server action → router.replace(/chat/<id>) → id rides in transport.body so the first turn stays on ONE conversation"
    - "RSC optional-catch-all ([[...id]]) seeds useChat initialMessages via toUIMessages; key={activeId ?? 'new'} resets useChat across conversation switches"
    - "ToolUIPart 4-state lifecycle render: input-(streaming|available)→progress chip, output-error→error chip, output-available→result/seam"

key-files:
  created:
    - app/(app)/chat/[[...id]]/page.tsx
    - components/chat/chat-workspace.tsx
    - components/chat/chat-sidebar.tsx
    - components/chat/chat-thread.tsx
    - components/chat/chat-message.tsx
    - components/chat/chat-tool-part.tsx
  modified:
    - components/app-shell/nav-items.ts
    - lib/actions/chat.ts
    - tests/unit/chat/chat-sidebar.test.tsx
    - tests/unit/chat/chat-thread.test.tsx
    - tests/unit/chat/chat-message.test.tsx

key-decisions:
  - "Used getAuthClaims from @/lib/queries/auth in the RSC page — it DOES exist (unlike the server-action path in Plan 00 where the mismatch forced createClient().auth.getClaims()); claims.sub feeds the owner-scoped queries"
  - "createChatConversation authenticates via createClient().auth.getClaims() (the server-action posture), not getAuthClaims (a server-only react cache() helper) — server actions read claims directly like normalizeChatInput / the chat route"
  - "ChatMessage builds thin shadcn bubbles (primary for user, card+border for assistant) rather than importing the WhatsApp MessageBubble (different WaMessageRow data shape)"

patterns-established:
  - "Pattern: chat thread leaves a {/* CHAT_COMPOSER_SEAM */} text-only composer + an ESTIMATE_CARD_SEAM in the createEstimate output branch for Plan 02 to fill — UI-only, backend frozen"

requirements-completed: [CHATUI-01, CHATUI-02]

# Metrics
duration: 6min
completed: 2026-06-25
---

# Phase 125 Plan 01: Chat UI — useChat Surface + Sidebar + History Summary

**Shipped the owner-facing chat shell over the frozen Phase-124 backend: an optional-catch-all RSC route that seeds persisted history into a v6 `@ai-sdk/react` `useChat` thread (own composer + `sendMessage({text})` + `DefaultChatTransport` full-array send + new-conversation pre-create), a WhatsApp-mirrored two-pane workspace, a conversation sidebar, and a `message.parts` renderer with per-tool-call progress chips — turning the 3 RED scaffolds green with the CHAT_COMPOSER_SEAM + ESTIMATE_CARD_SEAM left for Plan 02.**

## Performance
- **Duration:** 6 min
- **Started:** 2026-06-25T09:00:44Z
- **Completed:** 2026-06-25T09:07:22Z
- **Tasks:** 3
- **Files modified:** 11 (6 created, 5 modified)

## Accomplishments
- CHATUI-01: a `useChat`-backed streaming surface renders assistant tokens (markdown bubbles) + per-tool-call progress chips, wired to `/api/chat` with the correct v6 transport + full-array send (no banned APIs).
- CHATUI-02: a sidebar lists prior conversations newest-first as `/chat/<id>` links, supports New chat + switch, and the RSC seeds the selected history via `toUIMessages`.
- New-conversation pre-create keeps the first turn on ONE conversation (no duplicate from the route's `onFinish`).
- The composer + estimate-card seams are clearly marked for Plan 02; the full chat suite (14 files / 77 passed / 7 todo) and the Phase-124 scope fence stay green.

## Task Commits
1. **Task 1: Route shell + sidebar + nav entry (CHATUI-02)** — `9e556508` (feat)
2. **Task 2: chat-thread (useChat + transport) + chat-workspace (CHATUI-01/02)** — `c0a432c3` (feat, TDD RED+GREEN)
3. **Task 3: chat-message (parts switch) + chat-tool-part (chip/result) (CHATUI-01)** — `14ffc314` (feat, TDD RED+GREEN)

## Files Created/Modified
- `app/(app)/chat/[[...id]]/page.tsx` — RSC optional-catch-all; `force-dynamic`; `getAuthClaims` → `listConversations` + `getConversationWithMessages` → `toUIMessages` → `ChatWorkspace`
- `components/chat/chat-workspace.tsx` — two-pane shell (header + `ChatSidebar` + `ChatThread`); New chat → `router.push('/chat')`; `key={activeId ?? 'new'}`
- `components/chat/chat-sidebar.tsx` — New chat button + newest-first conversation links + empty state + active highlight
- `components/chat/chat-thread.tsx` — v6 `useChat` (`@ai-sdk/react`) + `DefaultChatTransport({api:'/api/chat', body:{conversationId}})`; own composer `useState` + `sendMessage({text})`; pre-create on first turn; CHAT_COMPOSER_SEAM
- `components/chat/chat-message.tsx` — `message.parts` switch: text → markdown/plain bubble, `tool-*`/`dynamic-tool` → `ChatToolPart`
- `components/chat/chat-tool-part.tsx` — 4-state lifecycle: progress chip (TOOL_LABEL), error chip, result; createEstimate ESTIMATE_CARD_SEAM
- `components/app-shell/nav-items.ts` — Chat entry (`/chat`, `MessageSquare`) after Clients
- `lib/actions/chat.ts` — `createChatConversation` (owner-scoped pre-create wrapping `createConversation`)
- `tests/unit/chat/{chat-sidebar,chat-thread,chat-message}.test.tsx` — RED scaffolds turned GREEN

## Decisions Made
- **`getAuthClaims` used in the RSC page** — unlike Plan 00's server-action path (where the helper signature didn't fit and forced `createClient().auth.getClaims()`), `getAuthClaims` from `@/lib/queries/auth` exists as a `react cache()` helper returning `claims` with `.sub`, exactly what the plan's interface block specified for the RSC.
- **`createChatConversation` authenticates via `createClient().auth.getClaims()`** (not `getAuthClaims`) — `getAuthClaims` is `server-only` + `cache()`; server actions read claims directly, mirroring `normalizeChatInput` and the chat route.
- **Thin shadcn bubbles, not the WhatsApp MessageBubble** — the chat renders `UIMessage.parts`, a different data shape than `WaMessageRow`; building thin primitives keeps the design-system alignment without coupling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded chat-thread doc comments so the no-banned-API static gate stays accurate**
- **Found during:** Task 2 (RED→GREEN)
- **Issue:** `chat-thread.test.tsx` asserts the source contains no `prepareSendMessagesRequest`; my explanatory doc comments named that API (and `handleSubmit`-style wording) to document why they are avoided — a naive `not.toContain` gate false-positived on the comment.
- **Fix:** Reworded the two comments to describe the avoided behavior ("do NOT override the request to send only the last", "no pre-v6 input/submit-change handlers") without naming the banned identifiers. No functional change; the component still uses none of those APIs.
- **Files modified:** components/chat/chat-thread.tsx
- **Verification:** `grep -c "handleSubmit\|handleInputChange\|prepareSendMessagesRequest"` → 0; chat-thread test 6/6 green.
- **Committed in:** `c0a432c3` (Task 2 commit)

**Total deviations:** 1 auto-fixed (bug). **Impact:** cosmetic comment wording to keep the static gate truthful; backend stays frozen, no scope creep.

## Issues Encountered
None — the plan's interface block matched the codebase (`getAuthClaims` exists for the RSC; the server-action auth posture from Plan 00 carried over to `createChatConversation`).

## Known Stubs
- **CHAT_COMPOSER_SEAM** (chat-thread.tsx): the inline text-only composer is intentional for THIS plan; Plan 02 swaps in the multimodal `ChatComposer` (audio/photo via `normalizeChatInput`) at the seam (CHATUI-03).
- **ESTIMATE_CARD_SEAM** (chat-tool-part.tsx): `tool-createEstimate` output-available renders a placeholder "Estimate ready." slot; Plan 02 renders the `EstimateCard` from `part.output` with an action to open the editor (CHATUI-04).

Both are by-design seams the owning plan (125-02) fills — NOT goal-blocking for this plan, whose goal is the useChat surface + sidebar + history + parts rendering. The `chat-composer.test.tsx` + `estimate-card.test.tsx` scaffolds remain RED (todo) for Plan 02.

## User Setup Required
None — no migration, no new dependency, no new secret (all deps installed in Plan 00).

## Next Phase Readiness
- Plan 125-02 fills the two seams against the live surface: the multimodal `ChatComposer` at `CHAT_COMPOSER_SEAM` (routing audio/photo through `normalizeChatInput` → `sendMessage({text})`) and the `EstimateCard` at `ESTIMATE_CARD_SEAM` (rendering `tool-createEstimate` `part.output` + open-in-editor), turning the last two RED scaffolds green.
- No blockers. The Phase-124 backend stays fenced (`app/api/chat/route.ts` + `lib/chat/tools.ts` untouched; scope-fence test green).

---
*Phase: 125-chat-ui*
*Completed: 2026-06-25*

## Self-Check: PASSED
- All 6 created component/route files verified on disk (FOUND).
- All 3 task commits verified in git history (9e556508, c0a432c3, 14ffc314).
