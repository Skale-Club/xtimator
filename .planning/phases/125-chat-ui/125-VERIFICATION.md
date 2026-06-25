---
phase: 125-chat-ui
verified: 2026-06-25T05:25:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 125: Chat UI Verification Report

**Phase Goal:** A useChat-backed streaming chat surface (parts rendering + tool-call progress) + a conversation sidebar (list/new/switch + history) + multimodal input (text/audio/photo via the extracted normalize) + an inline estimate card (open-in-editor) when a generation tool completes. UI only.
**Verified:** 2026-06-25T05:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 (CHATUI-01) | useChat-backed streaming surface renders assistant tokens + per-tool-call progress | ✓ VERIFIED | `chat-thread.tsx` uses `useChat` from `@ai-sdk/react` + `DefaultChatTransport({api:'/api/chat', body:{conversationId}})`, owns `submit()` calling `sendMessage({text})`, no banned APIs. `chat-message.tsx` maps `message.parts`. `chat-tool-part.tsx` renders 4-state lifecycle with `TOOL_LABEL` chips. |
| 2 (CHATUI-02) | Sidebar lists/new/switch + history loads | ✓ VERIFIED | RSC `page.tsx` loads `listConversations` + `getConversationWithMessages` → `toUIMessages`. `chat-sidebar.tsx` renders newest-first `/chat/<id>` links + New chat. Chat nav entry present in `nav-items.ts`. New-conversation pre-created via `createChatConversation` (no duplicate). |
| 3 (CHATUI-03) | Multimodal input (text/audio/photo) routed through normalize | ✓ VERIFIED | `chat-composer.tsx` routes audio (MediaRecorder gesture-bound) + photo (compressImage) through `normalizeChatInput` → `onSend(text)`. No `sendMessage({files})` (Pitfall 4 avoided). |
| 4 (CHATUI-04) | Inline estimate card polls job + open-in-editor | ✓ VERIFIED | `estimate-card.tsx` polls `useJobStatus(jobId)`, on completion resolves id via `resolveCurrentEstimateId` (tenant-guarded), links to `/projects/<id>?tab=estimate&estimate=<id>`. Wired in `chat-tool-part.tsx` for `tool-createEstimate` output-available. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/(app)/chat/[[...id]]/page.tsx` | RSC loads conversations + history | ✓ VERIFIED | Contains `listConversations`, `getConversationWithMessages`, `toUIMessages`, `force-dynamic`. Owner-only (under authenticated app shell). |
| `components/chat/chat-thread.tsx` | useChat surface | ✓ VERIFIED | `useChat` from `@ai-sdk/react`; `DefaultChatTransport({api:'/api/chat', body:{conversationId}})`; `sendMessage({text})`; NO `handleSubmit`/`handleInputChange`/`prepareSendMessagesRequest`. |
| `components/chat/chat-message.tsx` | parts switch | ✓ VERIFIED | Maps `message.parts`; text → markdown/plain bubble; `tool-`/`dynamic-tool` → ChatToolPart. |
| `components/chat/chat-tool-part.tsx` | progress chip/result | ✓ VERIFIED | `input-available`/`output-available`/`output-error` states; TOOL_LABEL map; renders EstimateCard for createEstimate. |
| `components/chat/chat-composer.tsx` | multimodal → normalize | ✓ VERIFIED | `normalizeChatInput`, `getSupportedAudioMimeType`, `compressImage`, MediaRecorder gesture-bound. |
| `components/chat/chat-sidebar.tsx` | list + new + switch | ✓ VERIFIED | Newest-first `/chat/<id>` links, New chat button, empty state, active highlight. |
| `components/chat/chat-workspace.tsx` | two-pane shell | ✓ VERIFIED | ChatSidebar + ChatThread with `key={activeId ?? 'new'}`. |
| `components/chat/estimate-card.tsx` | poll + open-in-editor | ✓ VERIFIED | `useJobStatus`, `resolveCurrentEstimateId`, href `tab=estimate&estimate=`. |
| `lib/chat/history-mapper.ts` | pure mapper | ✓ VERIFIED | `toUIMessages`, user/assistant only, parts verbatim, defensive non-array → []. |
| `lib/actions/chat.ts` | normalize + pre-create + resolve | ✓ VERIFIED | `normalizeChatInput`, `createChatConversation`, `resolveCurrentEstimateId`; all auth + active-company gated; no credit code. |
| `components/app-shell/nav-items.ts` | Chat nav entry | ✓ VERIFIED | `{ label: 'Chat', href: '/chat', icon: MessageSquare }` present. |
| `package.json` | @ai-sdk/react pinned | ✓ VERIFIED | `"@ai-sdk/react": "3.0.211"` (bundles ai@6.0.209 — lockstep; the plan's assumed 6.0.209 does not exist for this package, documented deviation). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| chat-thread.tsx | /api/chat | `DefaultChatTransport({api:'/api/chat', body:{conversationId}})` | ✓ WIRED | Exact literal present (line 45-48). |
| chat-thread.tsx | useChat | `import { useChat } from '@ai-sdk/react'` | ✓ WIRED | Line 22. |
| page.tsx | toUIMessages | history seed | ✓ WIRED | Line 17, 39. |
| chat-composer.tsx | normalizeChatInput | audio/photo → onSend(text) | ✓ WIRED | Lines 107, 138. |
| estimate-card.tsx | /projects/[id] editor | `tab=estimate&estimate=` | ✓ WIRED | Line 81. |
| chat-tool-part.tsx | estimate-card.tsx | createEstimate output → EstimateCard | ✓ WIRED | Line 71. |
| lib/actions/chat.ts | normalizeInput | `import { normalizeInput } from '@/lib/agent-tools'` | ✓ WIRED | Line 21. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| chat-thread.tsx | `messages` | `useChat` → DefaultChatTransport → `/api/chat` (frozen 124 route) | Yes (live stream) | ✓ FLOWING |
| page.tsx | `initialMessages` | `getConversationWithMessages` → `toUIMessages` | Yes (DB query) | ✓ FLOWING |
| chat-sidebar.tsx | `conversations` | `listConversations(userId)` from RSC | Yes (DB query) | ✓ FLOWING |
| estimate-card.tsx | `estimateId` | `resolveCurrentEstimateId` → `getCurrentEstimate` (is_current + tenant guard) | Yes (DB query) | ✓ FLOWING |
| chat-composer.tsx | `result.text` | `normalizeChatInput` → `normalizeInput` (transcription/vision) | Yes (server action) | ✓ FLOWING |

No hollow props or static-only returns found. All dynamic surfaces trace to real DB queries / live stream / server actions.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chat unit suite green | `npx vitest run tests/unit/chat` | 14 files / 84 tests passed, 0 failures | ✓ PASS |
| Scope fence: backend untouched | `git log -1 -- app/api/chat/route.ts lib/chat/tools.ts` | Last touch `9c50154e` (phase 124); no 125 edits | ✓ PASS |
| @ai-sdk/react resolves lockstep | `grep package.json` | `3.0.211` (bundles ai@6.0.209) | ✓ PASS |

Note: `tests/unit/mcp-route-contract.test.ts` is a known parallel-only flake, not a phase-125 regression (not run here; chat suite isolated).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHATUI-01 | 125-00/01 | useChat streaming surface + tool-call progress | ✓ SATISFIED | chat-thread + chat-message + chat-tool-part verified; chat-thread.test.tsx green. |
| CHATUI-02 | 125-00/01 | Conversation sidebar list/new/switch + history | ✓ SATISFIED | page.tsx + chat-sidebar + nav entry verified; chat-sidebar.test.tsx green. |
| CHATUI-03 | 125-00/02 | Multimodal input via extracted normalize | ✓ SATISFIED | chat-composer + normalizeChatInput verified; chat-composer.test.tsx green. |
| CHATUI-04 | 125-00/02 | Inline estimate card + open-in-editor | ✓ SATISFIED | estimate-card + resolveCurrentEstimateId verified; estimate-card.test.tsx green. |

No orphaned requirements — REQUIREMENTS.md maps exactly CHATUI-01..04 to Phase 125, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| chat-tool-part.tsx | 74-78 | `'Estimate ready.'` fallback box | ℹ️ Info | Defensive fallback for unexpected tool output shape; the happy path renders EstimateCard. Not a stub. |
| chat-thread.tsx | 90 | `CHAT_COMPOSER_SEAM` comment | ℹ️ Info | Comment only; the seam is filled — `<ChatComposer/>` is mounted (line 91). |
| chat-tool-part.tsx | 67 | `ESTIMATE_CARD_SEAM` comment | ℹ️ Info | Comment only; the seam is filled — `<EstimateCard/>` is rendered (line 71). |

No blocker anti-patterns. The `[]`/`{}` initial states (estimateId useState null, empty messages) are all overwritten by live data sources — not stubs.

### Human Verification Required

None blocking. Optional manual confirmation (visual/runtime, cannot be verified statically):
- Live audio recording + transcription on iOS Safari (gesture-bound MediaRecorder).
- Streaming token render feel and tool-progress chip transitions in the browser.
- End-to-end: speak a job → estimate generates → Open-in-editor lands on the right estimate.

These are inherent UI/runtime behaviors; the code paths are correctly wired and unit-tested.

### Gaps Summary

No gaps. All 4 observable truths verified, all 12 artifacts pass existence + substantive + wired + data-flow checks, all 7 key links wired, all 4 requirements satisfied, the Phase-124 backend scope fence holds, and the full chat unit suite (14 files / 84 tests) is green. The single notable deviation (`@ai-sdk/react@3.0.211` instead of the planned `6.0.209`) is a correct resolution — that version does not exist for this independently-versioned package and `3.0.211` bundles `ai@6.0.209` lockstep. Phase goal achieved.

---

_Verified: 2026-06-25T05:25:00Z_
_Verifier: Claude (gsd-verifier)_
